import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';
import '../win95.css';

export default function Onboarding() {
  const { user, isAuth } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [upiId, setUpiId] = useState('');

  // Quick-add product state
  const [productForm, setProductForm] = useState({ sku: '', name: '', basePrice: '', category: '' });
  const [addedProducts, setAddedProducts] = useState([]);
  const [addError, setAddError] = useState('');

  if (!isAuth) {
    navigate('/login', { replace: true });
    return null;
  }

  const handleAddProduct = async (e) => {
    e.preventDefault();
    setAddError('');
    try {
      await api.post('/products', {
        sku: productForm.sku,
        name: productForm.name,
        basePrice: parseFloat(productForm.basePrice),
        category: productForm.category || 'General',
      });
      setAddedProducts(prev => [...prev, { ...productForm }]);
      setProductForm({ sku: '', name: '', basePrice: '', category: '' });
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add product');
    }
  };

  const wizardSteps = [
    { num: 1, label: 'Add Products' },
    { num: 2, label: 'Configure UPI' },
    { num: 3, label: 'Ready!' },
  ];

  return (
    <div className="win95-page">
      <div className="win95-desktop" style={{alignItems:'center',justifyContent:'center',paddingBottom:46}}>
        <div className="win95-window" style={{maxWidth:600}}>
          {/* Title Bar */}
          <div className="win95-titlebar">
            <div className="win95-titlebar-text">🧙 Billu POS Setup Wizard — Step {step} of 3</div>
            <div className="win95-titlebar-controls">
              <button className="win95-titlebar-btn win95-btn-minimize">_</button>
              <button className="win95-titlebar-btn win95-btn-maximize">□</button>
              <button className="win95-titlebar-btn win95-btn-close" onClick={() => navigate('/dashboard')}>✕</button>
            </div>
          </div>

          {/* Step Indicator */}
          <div style={{display:'flex',gap:0,background:'var(--win-gray)',borderBottom:'1px solid var(--win-dark)'}}>
            {wizardSteps.map(s => (
              <div key={s.num} style={{
                flex:1, padding:'6px 0', textAlign:'center', fontSize:16, fontWeight:'bold',
                background: step === s.num ? 'var(--win-blue)' : 'transparent',
                color: step === s.num ? '#fff' : step > s.num ? '#008000' : 'var(--win-dark)',
                borderRight: '1px solid var(--win-dark)',
              }}>
                {step > s.num ? '✓' : s.num}. {s.label}
              </div>
            ))}
          </div>

          {/* Body */}
          <div style={{padding:20,minHeight:280}}>

            {/* ── Step 1: Add Products ── */}
            {step === 1 && (
              <>
                <div className="win95-section-header">► Add Your Products</div>
                <p style={{fontSize:16,color:'#cc0000',fontWeight:'bold',marginBottom:10}}>
                  Add products manually below, or import a CSV file from the Products page later.
                </p>

                {addError && (
                  <div style={{background:'#ffffcc',border:'2px solid #000',padding:'4px 8px',marginBottom:8,fontSize:14}}>
                    ⚠️ {addError}
                  </div>
                )}

                <form onSubmit={handleAddProduct} style={{display:'grid',gridTemplateColumns:'1fr 2fr 1fr',gap:6,marginBottom:10}}>
                  <div className="win95-input-wrap">
                    <input value={productForm.sku} onChange={e => setProductForm(p => ({...p, sku: e.target.value}))} placeholder="SKU*" required />
                  </div>
                  <div className="win95-input-wrap">
                    <input value={productForm.name} onChange={e => setProductForm(p => ({...p, name: e.target.value}))} placeholder="Product Name*" required />
                  </div>
                  <div className="win95-input-wrap">
                    <input type="number" value={productForm.basePrice} onChange={e => setProductForm(p => ({...p, basePrice: e.target.value}))} placeholder="Price*" required />
                  </div>
                  <div className="win95-input-wrap" style={{gridColumn:'1/3'}}>
                    <input value={productForm.category} onChange={e => setProductForm(p => ({...p, category: e.target.value}))} placeholder="Category (optional)" />
                  </div>
                  <button type="submit" className="win95-btn win95-btn-primary" style={{fontSize:16}}>
                    + Add
                  </button>
                </form>

                {addedProducts.length > 0 && (
                  <div className="win95-sunken" style={{padding:0,maxHeight:120,overflow:'auto'}}>
                    <table>
                      <thead><tr><th>SKU</th><th>Name</th><th style={{textAlign:'right'}}>Price</th></tr></thead>
                      <tbody>
                        {addedProducts.map((p,i) => (
                          <tr key={i}><td>{p.sku}</td><td>{p.name}</td><td style={{textAlign:'right'}}>Rs.{p.basePrice}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div style={{fontSize:14,color:'#cc0000',fontWeight:'bold',marginTop:8}}>
                  💡 You can also skip this and import a CSV from the Products page.
                </div>
              </>
            )}

            {/* ── Step 2: UPI Config ── */}
            {step === 2 && (
              <>
                <div className="win95-section-header">► Configure UPI Payment</div>
                <p style={{fontSize:16,color:'var(--win-dark)',marginBottom:10}}>
                  Enter your UPI ID to receive payments from customers via QR code.
                </p>
                <div className="win95-form-row">
                  <label className="win95-form-label">Your UPI ID</label>
                  <div className="win95-input-wrap">
                    <input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="e.g. yourname@upi" />
                  </div>
                </div>
                <div style={{fontSize:14,color:'var(--win-dark)',marginTop:8}}>
                  💡 This can be changed later from settings. You can skip this step if you don't need UPI.
                </div>
              </>
            )}

            {/* ── Step 3: Ready ── */}
            {step === 3 && (
              <div style={{textAlign:'center',padding:'20px 0'}}>
                <div style={{fontSize:56,marginBottom:8}}>🎉</div>
                <div style={{fontSize:26,fontWeight:'bold',color:'var(--win-blue)',marginBottom:6}}>You're All Set!</div>
                <p style={{fontSize:18,color:'var(--win-dark)',marginBottom:20}}>
                  Your POS system is ready. Start billing customers now!
                </p>
                <div style={{display:'flex',gap:8,justifyContent:'center'}}>
                  <button
                    className="win95-btn win95-btn-primary"
                    style={{fontSize:20,padding:'10px 28px'}}
                    onClick={() => navigate('/pos')}
                  >
                    🛒 Launch POS Terminal
                  </button>
                  <button
                    className="win95-btn"
                    style={{fontSize:20,padding:'10px 28px'}}
                    onClick={() => navigate('/dashboard')}
                  >
                    📊 Go to Dashboard
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="win95-dialog-footer">
            {step > 1 && (
              <button className="win95-btn" onClick={() => setStep(s => s - 1)}>
                ◄ Back
              </button>
            )}
            <div style={{flex:1}} />
            {step < 3 ? (
              <button className="win95-btn win95-btn-primary" onClick={() => setStep(s => s + 1)}>
                {step === 1 && addedProducts.length === 0 ? 'Skip ►' : 'Next ►'}
              </button>
            ) : null}
          </div>

          {/* Status Bar */}
          <div className="win95-statusbar">
            <div className="win95-status-panel">Welcome, {user?.name || user?.email || 'Admin'}!</div>
            <div className="win95-status-panel">Step {step} of 3</div>
          </div>
        </div>
      </div>

      {/* Taskbar */}
      <div className="win95-taskbar">
        <button className="win95-start-btn">⊞ Start</button>
        <div className="win95-taskbar-items">
          <div className="win95-taskbar-item">🧙 Billu POS Setup Wizard</div>
        </div>
        <div className="win95-taskbar-clock">
          {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
