import React from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import '../win95.css';

export default function Landing() {
  const navigate = useNavigate();
  const { isAuth } = useAuth();

  // If already logged in, redirect
  if (isAuth) return <Navigate to="/dashboard" replace />;

  return (
    <div className="win95-page">
      <div className="win95-desktop" style={{alignItems:'center',justifyContent:'center',paddingBottom:46}}>
        <div className="win95-window" style={{maxWidth:720}}>
          {/* Title Bar */}
          <div className="win95-titlebar">
            <div className="win95-titlebar-text">⊞ Billu95 Setup Wizard</div>
            <div className="win95-titlebar-controls">
              <button className="win95-titlebar-btn win95-btn-minimize">_</button>
              <button className="win95-titlebar-btn win95-btn-maximize">□</button>
              <button className="win95-titlebar-btn win95-btn-close">✕</button>
            </div>
          </div>

          {/* Body */}
          <div style={{padding:20}}>
            {/* Hero Section */}
            <div style={{textAlign:'center',marginBottom:20}}>
              <div style={{fontSize:48,marginBottom:6}}>🖥️</div>
              <h1 style={{fontSize:32,margin:0,color:'var(--win-blue)'}}>Welcome to Billu POS</h1>
              <p style={{fontSize:20,color:'var(--win-dark)',margin:'6px 0 0'}}>
                The retro-powered Point of Sale system for modern businesses
              </p>
            </div>

            <div className="win95-start-divider" style={{margin:'16px 0'}} />

            {/* Feature Grid */}
            <div className="win95-section-header">► What can Billu POS do?</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16}}>
              {[
                { icon: '🛒', title: 'POS Terminal', desc: 'Fast billing with barcode scan' },
                { icon: '📦', title: 'Inventory', desc: 'Track stock in real-time' },
                { icon: '📁', title: 'CSV Import', desc: 'Bulk upload products instantly' },
                { icon: '🧾', title: 'Receipts', desc: 'Auto-generated PDF receipts' },
                { icon: '💳', title: 'UPI / Card', desc: 'Multiple payment methods' },
                { icon: '📊', title: 'Dashboard', desc: 'Live sales analytics' },
              ].map((f, i) => (
                <div key={i} className="win95-raised" style={{padding:'10px 12px',display:'flex',gap:10,alignItems:'center'}}>
                  <div style={{fontSize:28}}>{f.icon}</div>
                  <div>
                    <div style={{fontWeight:'bold',fontSize:18}}>{f.title}</div>
                    <div style={{fontSize:14,color:'var(--win-dark)'}}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* How It Works */}
            <div className="win95-section-header">► Getting Started is Easy</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:20}}>
              {[
                { step: '1', title: 'Register', desc: 'Create your business account' },
                { step: '2', title: 'Add Products', desc: 'Import CSV or add manually' },
                { step: '3', title: 'Start Billing', desc: 'Launch POS and sell!' },
              ].map((s, i) => (
                <div key={i} className="win95-stat">
                  <div className="win95-stat-value">{s.step}</div>
                  <div style={{fontWeight:'bold',fontSize:18}}>{s.title}</div>
                  <div style={{fontSize:14,color:'var(--win-dark)'}}>{s.desc}</div>
                </div>
              ))}
            </div>

            {/* CTA Buttons */}
            <div style={{display:'flex',gap:8,justifyContent:'center'}}>
              <button
                className="win95-btn win95-btn-primary"
                style={{fontSize:22,padding:'10px 36px'}}
                onClick={() => navigate('/register')}
              >
                🚀 Get Started Free
              </button>
              <button
                className="win95-btn"
                style={{fontSize:22,padding:'10px 36px'}}
                onClick={() => navigate('/login')}
              >
                🔑 Sign In
              </button>
            </div>
          </div>

          {/* Status Bar */}
          <div className="win95-statusbar">
            <div className="win95-status-panel">© 2025 Billu95 — Free for all merchants</div>
            <div className="win95-status-panel">v1.0</div>
          </div>
        </div>
      </div>

      {/* Taskbar (static for landing) */}
      <div className="win95-taskbar">
        <button className="win95-start-btn" onClick={() => navigate('/register')}>
          ⊞ Start
        </button>
        <div className="win95-taskbar-items">
          <div className="win95-taskbar-item">⊞ Billu95 Setup Wizard</div>
        </div>
        <div className="win95-taskbar-clock">
          {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
