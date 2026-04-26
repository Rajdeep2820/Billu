import React, { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { io } from 'socket.io-client';
import { Win95Shell } from './Products';

export default function POS() {
  const { logout, token } = useAuth();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [receiptUrl, setReceiptUrl] = useState(null);
  const [search, setSearch] = useState('');

  const searchRef = useRef(null);

  useEffect(() => {
    api.get('/products?limit=100').then(res => setProducts(res.data.products));

    // Connect via Nginx proxy (works in both dev and Docker)
    const socketUrl = window.location.hostname === 'localhost'
      ? (window.location.port === '5173' ? 'http://localhost:4000' : window.location.origin)
      : window.location.origin;
    const socket = io(socketUrl, { auth: { token }, path: '/socket.io/' });
    socket.on('receipt:ready', (data) => {
      setReceiptUrl(data.receiptUrl);
    });

    return () => socket.disconnect();
  }, [token]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'F2') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F5') { e.preventDefault(); handleCheckout(); }
      if (e.key === 'Escape') { setCart([]); setReceiptUrl(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

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

  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    if (!barcode.trim()) return;
    try {
      const res = await api.get(`/products/barcode/${barcode.trim().toUpperCase()}`);
      addToCart(res.data);
      setBarcode('');
    } catch (err) {
      alert(`Barcode ${barcode} not found!`);
      setBarcode('');
    }
  };

  const total = cart.reduce((sum, i) => sum + (parseFloat(i.unitPrice) * i.qty), 0);
  const itemCount = cart.reduce((sum, i) => sum + i.qty, 0);

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
      if (attempts >= 15) clearInterval(pollTimerRef.current); // give up after 30s
    }, 2000);
  };

  const handleCheckout = async () => {
    if (!cart.length) return;
    setLoading(true);
    setReceiptUrl(null);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    try {
      const payload = {
        paymentMethod: payMethod,
        origin: window.location.origin, // Tell API exactly what URL to put in the QR code
        lineItems: cart.map(i => ({ sku: i.sku, name: i.name, qty: i.qty, unitPrice: i.unitPrice }))
      };
      const res = await api.post('/sales', payload);
      setCart([]);
      // Start polling for receipt (socket is secondary; polling is reliable in Docker too)
      if (res.data?.transaction?.id) {
        pollForReceipt(res.data.transaction.id);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Checkout failed');
    } finally {
      setLoading(false);
      searchRef.current?.focus();
    }
  };

  const filteredProducts = products.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
  });

  return (
    <Win95Shell activeWindow="POS Terminal">
      <div className="pos95-layout">

        {/* ═══ LEFT: Products Window ═══ */}
        <div className="pos95-left">
          <div className="win95-window" style={{maxWidth:'none',height:'100%'}}>
            {/* Title Bar */}
            <div className="win95-titlebar">
              <div className="win95-titlebar-text">🛒 Product Catalog</div>
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
            </div>

            {/* Product Grid — CRT scanline effect */}
            <div className="pos95-grid-area">
              <div className="pos95-grid">
                {filteredProducts.map(p => (
                  <button key={p.id} className="pos95-product-tile" onClick={() => addToCart(p)}>
                    <div className="pos95-tile-name">{p.name}</div>
                    <div className="pos95-tile-sku">{p.sku}</div>
                    <div className="pos95-tile-price">Rs.{parseFloat(p.basePrice).toFixed(2)}</div>
                  </button>
                ))}
                {filteredProducts.length === 0 && (
                  <div style={{gridColumn:'1/-1',textAlign:'center',padding:40,color:'#808080'}}>
                    No products found.
                  </div>
                )}
              </div>
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
                {loading ? '⏳ Processing...' : `⚡ CHARGE Rs.${total.toFixed(2)} [F5]`}
              </button>

              {/* Receipt Links */}
              {receiptUrl && (
                <div className="pos95-receipt-bar">
                  <span style={{color:'#008000',fontWeight:'bold'}}>✓ Sale complete!</span>
                  <div style={{display:'flex',gap:6}}>
                    <a href={receiptUrl} target="_blank" rel="noreferrer" className="win95-btn" style={{fontSize:14,padding:'2px 10px',minWidth:'auto',textDecoration:'none'}}>
                      📄 View
                    </a>
                    <button
                      className="win95-btn"
                      style={{fontSize:14,padding:'2px 10px',minWidth:'auto'}}
                      onClick={() => {
                        const pw = window.open(receiptUrl, '_blank');
                        pw.addEventListener('load', () => pw.print());
                      }}
                    >
                      🖨️ Print
                    </button>
                  </div>
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
