import React, { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { usePosOffline } from '../hooks/usePosOffline';
import { io } from 'socket.io-client';
import { Win95Shell } from './Products';

export default function POS() {
  const { logout, token, user } = useAuth();
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [receiptUrl, setReceiptUrl] = useState(null);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [outlets, setOutlets] = useState([]);
  const [selectedOutletId, setSelectedOutletId] = useState(
    () => localStorage.getItem('billu_admin_outlet_id') || ''
  );

  const PAGE_SIZE = 24;

  const searchRef = useRef(null);

  // ── Offline-capable product catalog + queue ────────────────────────────────
  const {
    products,
    isOnline,
    isSyncing,
    pendingCount,
    checkoutWithFallback,
    refreshCatalog,
  } = usePosOffline({ outletId: selectedOutletId, user });

  // ── Fetch outlets for admin selector ──────────────────────────────────────
  useEffect(() => {
    if (user?.role === 'admin') {
      api.get('/outlets').then(res => {
        const active = (res.data || []).filter(o => o.isActive !== false);
        setOutlets(active);

        const savedId = localStorage.getItem('billu_admin_outlet_id');
        const isValidSaved = active.some(o => o.id === savedId);

        if (active.length > 0 && (!savedId || !isValidSaved)) {
          const defaultOutlet = active.find(o => o.id === user.outletId) || active[0];
          setSelectedOutletId(defaultOutlet.id);
          localStorage.setItem('billu_admin_outlet_id', defaultOutlet.id);
        } else if (isValidSaved) {
          setSelectedOutletId(savedId);
        }
      }).catch(() => {});
    }
  }, [user]);

  // Persist selected outlet
  useEffect(() => {
    if (selectedOutletId) {
      localStorage.setItem('billu_admin_outlet_id', selectedOutletId);
    }
  }, [selectedOutletId]);

  // ── WebSocket (receipt:ready events) ──────────────────────────────────────
  useEffect(() => {
    const backendHost = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
      : (window.location.hostname === 'localhost'
          ? (window.location.port === '5173' ? 'http://localhost:4000' : window.location.origin)
          : window.location.origin);

    const socket = io(backendHost, { auth: { token }, path: '/socket.io/' });
    socket.on('receipt:ready', (data) => setReceiptUrl(data.receiptUrl));
    return () => socket.disconnect();
  }, [token]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F5') { e.preventDefault(); handleCheckout(); }
      if (e.key === 'Escape') { setCart([]); setReceiptUrl(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // ── Cart helpers ─────────────────────────────────────────────────────────
  const addToCart = (product) => {
    setReceiptUrl(null);
    setCart(prev => {
      const existing = prev.find(i => i.sku === product.sku);
      if (existing) {
        return prev.map(i => i.sku === product.sku ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { ...product, unitPrice: product.basePrice, qty: 1 }];
    });
  };

  const updateQty = (sku, delta) => {
    setCart(prev => prev.map(i => {
      if (i.sku === sku) {
        const newQty = Math.max(0, i.qty + delta);
        return { ...i, qty: newQty };
      }
      return i;
    }).filter(i => i.qty > 0));
  };

  // ── Barcode scan (works offline using cached catalog) ────────────────────
  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    const sku = barcode.trim().toUpperCase();

    // First try local product list (works offline)
    const localMatch = products.find(p => p.sku === sku);
    if (localMatch) {
      addToCart(localMatch);
      setBarcode('');
      return;
    }

    // Fallback to API (online only)
    try {
      setLoading(true);
      const targetOutlet = selectedOutletId || user?.outletId || '';
      const res = await api.get(`/products/barcode/${sku}?outletId=${targetOutlet}`);
      addToCart(res.data);
      setBarcode('');
    } catch {
      alert(`Barcode ${barcode} not found!`);
      setBarcode('');
    } finally {
      setLoading(false);
    }
  };

  const total = cart.reduce((sum, i) => sum + (parseFloat(i.unitPrice) * i.qty), 0);
  const itemCount = cart.reduce((sum, i) => sum + i.qty, 0);

  // ── Receipt polling ───────────────────────────────────────────────────────
  const pollTimerRef = useRef(null);

  const pollForReceipt = (transactionId) => {
    let attempts = 0;
    pollTimerRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await api.get(`/sales/${transactionId}`);
        if (res.data?.receiptPath) {
          setReceiptUrl(res.data.receiptPath);
          clearInterval(pollTimerRef.current);
        }
      } catch (_) {}
      if (attempts >= 15) clearInterval(pollTimerRef.current);
    }, 2000);
  };

  // ── Checkout (online or offline fallback) ─────────────────────────────────
  const handleCheckout = async () => {
    if (!cart.length) return;
    setLoading(true);
    setReceiptUrl(null);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    const payload = {
      paymentMethod: payMethod,
      origin: window.location.origin,
      lineItems: cart.map(i => ({ sku: i.sku, name: i.name, qty: i.qty, unitPrice: i.unitPrice })),
      ...(user?.role === 'admin' && selectedOutletId ? { outletId: selectedOutletId } : {}),
    };

    const result = await checkoutWithFallback(payload);

    if (result.ok) {
      setCart([]);
      if (result.queued) {
        // Offline — show a queued confirmation, no receipt link
        setReceiptUrl('__queued__');
      } else if (result.data?.transaction?.id) {
        // Online — poll for receipt as usual
        pollForReceipt(result.data.transaction.id);
      }
    } else {
      alert(result.error || 'Checkout failed');
    }

    setLoading(false);
    searchRef.current?.focus();
  };

  const filteredProducts = products.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  // Reset to page 1 whenever search or outlet changes
  useEffect(() => { setCurrentPage(1); }, [search, selectedOutletId]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const pagedProducts = filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // ── Status indicator ──────────────────────────────────────────────────────
  const statusEl = (() => {
    if (isSyncing) return (
      <span style={{ fontSize: 11, color: '#0070d8', fontWeight: 'bold', letterSpacing: 0.5 }}>
        🔄 Syncing {pendingCount} sale{pendingCount !== 1 ? 's' : ''}…
      </span>
    );
    if (!isOnline && pendingCount > 0) return (
      <span style={{ fontSize: 11, color: '#cc0000', fontWeight: 'bold', letterSpacing: 0.5 }}>
        🔴 Offline — {pendingCount} sale{pendingCount !== 1 ? 's' : ''} pending
      </span>
    );
    if (!isOnline) return (
      <span style={{ fontSize: 11, color: '#cc0000', fontWeight: 'bold', letterSpacing: 0.5 }}>
        🔴 Offline (cached catalog)
      </span>
    );
    if (pendingCount > 0) return (
      <span style={{ fontSize: 11, color: '#cc6600', fontWeight: 'bold', letterSpacing: 0.5 }}>
        🟡 Online — syncing {pendingCount} queued sale{pendingCount !== 1 ? 's' : ''}…
      </span>
    );
    return (
      <span style={{ fontSize: 11, color: '#007700', fontWeight: 'bold', letterSpacing: 0.5 }}>
        🟢 Online
      </span>
    );
  })();

  return (
    <Win95Shell activeWindow="POS Terminal">
      <div className="pos95-layout">

        {/* ═══ LEFT: Products Window ═══ */}
        <div className="pos95-left">
          <div className="win95-window" style={{maxWidth:'none',height:'100%'}}>
            {/* Title Bar */}
            <div className="win95-titlebar">
              <div className="win95-titlebar-text">🛒 Product Catalog</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', marginRight: 8 }}>
                {statusEl}
              </div>
              <div className="win95-titlebar-controls">
                <button className="win95-titlebar-btn win95-btn-minimize">_</button>
                <button className="win95-titlebar-btn win95-btn-maximize">□</button>
                <button className="win95-titlebar-btn win95-btn-close">✕</button>
              </div>
            </div>

            {/* Toolbar: Barcode + Search */}
            <div style={{background:'var(--win-gray)',padding:'4px 8px',borderBottom:'1px solid var(--win-dark)',display:'flex',gap:6,alignItems:'center'}}>
              <form onSubmit={handleBarcodeSubmit} style={{display:'flex',gap:4,flex:1}}>
                <div className="win95-input-wrap" style={{flex:1}}>
                  <input
                    ref={searchRef}
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Scan Barcode / SKU + Enter [F2]"
                    autoFocus
                  />
                </div>
                <button type="submit" className="win95-btn pos95-scan-btn" style={{minWidth:60,padding:'3px 12px',fontSize:16,backgroundColor:'rgba(5, 219, 5, 0.15)'}}>
                  ⏎ Scan
                </button>
              </form>
              <div style={{width:1,height:24,background:'var(--win-dark)',margin:'0 2px'}} />
              <div className="win95-input-wrap" style={{width:160}}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="🔍 Filter..."
                />
              </div>
              {/* Outlet selector for admin */}
              {user?.role === 'admin' && outlets.length > 1 && (
                <>
                  <div style={{width:1,height:24,background:'var(--win-dark)',margin:'0 2px'}} />
                  <div className="win95-input-wrap" style={{width:180}}>
                    <select
                      value={selectedOutletId}
                      onChange={(e) => setSelectedOutletId(e.target.value)}
                    >
                      {outlets.map(o => (
                        <option key={o.id} value={o.id}>🏪 {o.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              {/* Manual refresh button */}
              <button
                className="win95-btn"
                title="Refresh product catalog"
                style={{ padding: '2px 8px', fontSize: 14 }}
                onClick={() => refreshCatalog()}
                disabled={!isOnline}
              >
                ↺
              </button>
            </div>

            {/* Product Grid */}
            <div className="pos95-grid-area">
              <div className="pos95-grid">
                {pagedProducts.map(p => (
                  <button key={p.id} className="pos95-product-tile" onClick={() => addToCart(p)}>
                    <div className="pos95-tile-name">{p.name}</div>
                    <div className="pos95-tile-sku">{p.sku}</div>
                    <div className="pos95-tile-price">Rs.{parseFloat(p.basePrice).toFixed(2)}</div>
                  </button>
                ))}
                {pagedProducts.length === 0 && (
                  <div style={{gridColumn:'1/-1',textAlign:'center',padding:40,color:'#808080'}}>
                    {isOnline ? 'No products found.' : '📦 Showing cached catalog. Connect to load latest products.'}
                  </div>
                )}
              </div>

              {/* Pagination bar */}
              {totalPages > 1 && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 8, padding: '6px 8px', borderTop: '1px solid var(--win-dark)',
                  background: 'var(--win-gray)', flexShrink: 0,
                }}>
                  <button
                    className="win95-btn"
                    style={{ padding: '2px 10px', fontSize: 13 }}
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => p - 1)}
                  >◀ Prev</button>

                  <span style={{ fontSize: 12, color: '#444', minWidth: 100, textAlign: 'center' }}>
                    Page {currentPage} / {totalPages}
                    &nbsp;({filteredProducts.length} items)
                  </span>

                  <button
                    className="win95-btn"
                    style={{ padding: '2px 10px', fontSize: 13 }}
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}
                  >Next ▶</button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ RIGHT: Cart Window ═══ */}
        <div className="pos95-right">
          <div className="win95-window" style={{maxWidth:'none',height:'100%'}}>
            {/* Title Bar */}
            <div className="win95-titlebar">
              <div className="win95-titlebar-text">📋 Current Order</div>
              <div className="win95-titlebar-controls">
                <button className="win95-titlebar-btn win95-btn-minimize">_</button>
                <button className="win95-titlebar-btn win95-btn-maximize">□</button>
                <button className="win95-titlebar-btn win95-btn-close" onClick={() => setCart([])}>✕</button>
              </div>
            </div>

            {/* ── LED Total Display ── */}
            <div className="pos95-led-display">
              <div className="pos95-led-label">TOTAL</div>
              <div className="pos95-led-value">Rs.{total.toFixed(2)}</div>
              <div className="pos95-led-items">{itemCount} item{itemCount !== 1 ? 's' : ''}</div>
            </div>

            {/* Cart Items */}
            <div className="pos95-cart-items">
              {cart.length === 0 && (
                <div style={{textAlign:'center',padding:'30px 10px',color:'#808080',fontSize:16}}>
                  Cart is empty.<br />Click a product or scan a barcode.
                </div>
              )}
              {cart.map(item => (
                <div key={item.sku} className="pos95-cart-row">
                  <div className="pos95-cart-info">
                    <div className="pos95-cart-name">{item.name}</div>
                    <div className="pos95-cart-sku">{item.sku} — Rs.{parseFloat(item.unitPrice).toFixed(2)} ea.</div>
                  </div>
                  <div className="pos95-cart-controls">
                    <button className="win95-btn" style={{minWidth:24,padding:'0 6px',fontSize:16}} onClick={() => updateQty(item.sku, -1)}>−</button>
                    <span className="pos95-cart-qty">{item.qty}</span>
                    <button className="win95-btn" style={{minWidth:24,padding:'0 6px',fontSize:16}} onClick={() => updateQty(item.sku, 1)}>+</button>
                  </div>
                  <div className="pos95-cart-subtotal">
                    Rs.{(parseFloat(item.unitPrice) * item.qty).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* Checkout Footer */}
            <div className="pos95-checkout">
              {/* Payment method */}
              <div style={{display:'flex',gap:4,marginBottom:8}}>
                <button
                  className={`win95-btn ${payMethod === 'cash' ? 'win95-btn-toggled' : ''}`}
                  style={{flex:1,fontSize:16,padding:'8px 0'}}
                  onClick={() => setPayMethod('cash')}
                >
                  💵 Cash
                </button>
                <button
                  className={`win95-btn ${payMethod === 'card' ? 'win95-btn-toggled' : ''}`}
                  style={{flex:1,fontSize:16,padding:'8px 0'}}
                  onClick={() => setPayMethod('card')}
                >
                  💳 Card/UPI
                </button>
              </div>

              {/* Charge Button */}
              <button
                className="pos95-charge-btn"
                disabled={cart.length === 0 || loading}
                onClick={handleCheckout}
              >
                {loading
                  ? '⏳ Processing...'
                  : `${isOnline ? '⚡' : '📦'} CHARGE Rs.${total.toFixed(2)} [F5]`}
              </button>

              {/* Receipt / Confirmation */}
              {receiptUrl && receiptUrl !== '__queued__' && (
                <div className="pos95-receipt-bar">
                  <span style={{color:'#008000',fontWeight:'bold'}}>✓ Sale complete!</span>
                  <button
                    className="win95-btn"
                    style={{fontSize:14,padding:'4px 14px',minWidth:'auto'}}
                    onClick={() => {
                      // Open receipt in new tab (customer sees eBill + QR code)
                      const pw = window.open(receiptUrl, '_blank');
                      // Trigger print dialog as soon as the PDF loads (thermal printer)
                      if (pw) {
                        pw.addEventListener('load', () => pw.print());
                      }
                    }}
                  >
                    🖨️ Print Bill
                  </button>
                </div>
              )}

              {receiptUrl === '__queued__' && (
                <div className="pos95-receipt-bar" style={{background:'rgba(204,102,0,0.08)',borderColor:'#cc6600'}}>
                  <span style={{color:'#cc6600',fontWeight:'bold'}}>
                    📦 Sale saved — will sync when online
                  </span>
                </div>
              )}

              {/* Keyboard Shortcut Hints */}
              <div className="pos95-shortcuts">
                <span>[F2] Focus Scan</span>
                <span>[F5] Charge</span>
                <span>[Esc] Clear</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Win95Shell>
  );
}
