import React, { useState, useEffect, useRef } from 'react';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { io } from 'socket.io-client';

export default function POS() {
  const { logout, token } = useAuth();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [barcode, setBarcode] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [receiptUrl, setReceiptUrl] = useState(null);
  
  const searchRef = useRef(null);

  useEffect(() => {
    // Load all products initially for the visual grid
    api.get('/products?limit=100').then(res => setProducts(res.data.products));

    // Connect websocket to receive receipt PDF URL
    const socket = io('http://localhost:4000', { auth: { token } });
    socket.on('receipt:ready', (data) => {
      console.log('Receipt ready:', data);
      setReceiptUrl(data.receiptUrl);
    });

    return () => socket.disconnect();
  }, [token]);

  const addToCart = (product) => {
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

  const handleCheckout = async () => {
    if (!cart.length) return;
    setLoading(true);
    setReceiptUrl(null);
    try {
      const payload = {
        paymentMethod: payMethod,
        lineItems: cart.map(i => ({ sku: i.sku, name: i.name, qty: i.qty, unitPrice: i.unitPrice }))
      };
      
      await api.post('/sales', payload);
      setCart([]);
      // The receipt URL will arrive via websocket within 1-2 seconds
      
    } catch (err) {
      alert(err.response?.data?.error || 'Checkout failed');
    } finally {
      setLoading(false);
      searchRef.current?.focus();
    }
  };

  return (
    <div className="pos-layout">
      {/* LEFT: Products Grid */}
      <div className="pos-products">
        <div className="section-header">
          <h2>Billu POS</h2>
          <button className="btn-outline" onClick={logout}>Logout</button>
        </div>

        <form className="pos-search" onSubmit={handleBarcodeSubmit}>
          <input 
            ref={searchRef}
            type="text" 
            placeholder="Scan Barcode or Type SKU (e.g. COKE500) + Enter" 
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-primary">Scan</button>
        </form>

        <div className="product-grid">
          {products.map(p => (
            <div key={p.id} className="product-card" onClick={() => addToCart(p)}>
              <div className="p-name">{p.name}</div>
              <div className="p-sku">{p.sku}</div>
              <div className="p-price">₹{parseFloat(p.basePrice).toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Cart & Checkout */}
      <div className="pos-cart">
        <div className="cart-title">Current Order</div>
        
        <div className="cart-items">
          {cart.length === 0 && <div className="empty-state">Cart is empty</div>}
          {cart.map(item => (
            <div key={item.sku} className="cart-item">
              <div className="cart-item-name">{item.name}</div>
              <div className="cart-item-qty">
                <button onClick={() => updateQty(item.sku, -1)}>−</button>
                <span style={{width: 20, textAlign: 'center'}}>{item.qty}</span>
                <button onClick={() => updateQty(item.sku, 1)}>+</button>
              </div>
              <div className="cart-item-price">₹{(item.unitPrice * item.qty).toFixed(2)}</div>
            </div>
          ))}
        </div>

        <div className="cart-footer">
          <div className="pay-methods">
            <button className={`pay-btn ${payMethod === 'cash' ? 'active' : ''}`} onClick={() => setPayMethod('cash')}>Cash</button>
            <button className={`pay-btn ${payMethod === 'card' ? 'active' : ''}`} onClick={() => setPayMethod('card')}>Card / UPI</button>
          </div>

          <div className="cart-total">
            <span>Total</span>
            <span>₹{total.toFixed(2)}</span>
          </div>

          <button 
            className="btn-primary" 
            style={{width: '100%', height: 48, fontSize: 16}}
            disabled={cart.length === 0 || loading}
            onClick={handleCheckout}
          >
            {loading ? 'Processing...' : `Charge ₹${total.toFixed(2)}`}
          </button>

          {receiptUrl && (
            <div style={{marginTop: 16, textAlign: 'center'}}>
              <a href={receiptUrl} target="_blank" rel="noreferrer" style={{color: '#16a34a', fontWeight: 600}}>
                ✓ View PDF Receipt
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
