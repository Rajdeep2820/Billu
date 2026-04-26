import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import '../win95.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Register() {
  const { register, googleLogin, isAuth } = useAuth();
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef(null);

  useEffect(() => {
    if (isAuth) { navigate('/onboarding', { replace: true }); return; }

    // Initialize Google Sign-In
    if (GOOGLE_CLIENT_ID && window.google) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline', size: 'large', width: 360, text: 'signup_with',
      });
    }
  }, []);

  const handleGoogleResponse = async (response) => {
    setError('');
    setLoading(true);
    try {
      const data = await googleLogin(response.credential, businessName || undefined);
      navigate(data.isNewUser ? '/onboarding' : '/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Google sign-up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      await register(businessName, email, password);
      navigate('/onboarding', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="win95-page">
      <div className="win95-desktop" style={{alignItems:'center',justifyContent:'center',paddingBottom:46}}>
        <div className="win95-window" style={{maxWidth:460}}>
          {/* Title Bar */}
          <div className="win95-titlebar">
            <div className="win95-titlebar-text">📝 Create Your Account — Billu POS</div>
            <div className="win95-titlebar-controls">
              <button className="win95-titlebar-btn win95-btn-minimize">_</button>
              <button className="win95-titlebar-btn win95-btn-maximize">□</button>
              <button className="win95-titlebar-btn win95-btn-close" onClick={() => navigate('/')}>✕</button>
            </div>
          </div>

          {/* Body */}
          <div style={{padding:20}}>
            <div style={{textAlign:'center',marginBottom:16}}>
              <div style={{fontSize:36,marginBottom:4}}>🏪</div>
              <div style={{fontSize:22,fontWeight:'bold',color:'var(--win-blue)'}}>Register Your Business</div>
              <div style={{fontSize:16,color:'var(--win-dark)'}}>Set up your POS in under 2 minutes</div>
            </div>

            {/* Error */}
            {error && (
              <div style={{background:'#ffffcc',border:'2px solid #000',padding:'6px 10px',marginBottom:10,fontSize:16}}>
                ⚠️ {error}
              </div>
            )}

            {/* Password Form */}
            <form onSubmit={handleSubmit}>
              <div className="win95-form-row">
                <label className="win95-form-label">Business Name *</label>
                <div className="win95-input-wrap">
                  <input value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="e.g. Raj Electronics" required />
                </div>
              </div>
              <div className="win95-form-row">
                <label className="win95-form-label">Email Address *</label>
                <div className="win95-input-wrap">
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
                </div>
              </div>
              <div className="win95-form-row">
                <label className="win95-form-label">Password *</label>
                <div className="win95-input-wrap">
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 6 characters" required />
                </div>
              </div>
              <div className="win95-form-row">
                <label className="win95-form-label">Confirm Password *</label>
                <div className="win95-input-wrap">
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" required />
                </div>
              </div>

              <button
                type="submit"
                className="win95-btn win95-btn-primary"
                style={{width:'100%',fontSize:20,padding:'8px 0',marginTop:8}}
                disabled={loading}
              >
                {loading ? '⏳ Creating account...' : '🚀 Create Account'}
              </button>
            </form>

            {/* Divider */}
            <div style={{display:'flex',alignItems:'center',gap:8,margin:'14px 0'}}>
              <div style={{flex:1,height:1,background:'var(--win-dark)'}} />
              <span style={{fontSize:14,color:'var(--win-dark)'}}>OR</span>
              <div style={{flex:1,height:1,background:'var(--win-dark)'}} />
            </div>

            {/* Google Sign-Up */}
            {GOOGLE_CLIENT_ID ? (
              <div style={{display:'flex',justifyContent:'center'}}>
                <div ref={googleBtnRef} />
              </div>
            ) : (
              <button className="win95-btn" style={{width:'100%',fontSize:18,padding:'8px 0'}} disabled>
                🔒 Google Sign-Up (not configured)
              </button>
            )}

            {/* Login Link */}
            <div style={{textAlign:'center',marginTop:14,fontSize:16}}>
              Already have an account?{' '}
              <Link to="/login" style={{color:'var(--win-blue)',fontWeight:'bold'}}>Sign In</Link>
            </div>
          </div>

          {/* Status Bar */}
          <div className="win95-statusbar">
            <div className="win95-status-panel">Step 1: Registration</div>
          </div>
        </div>
      </div>

      {/* Taskbar */}
      <div className="win95-taskbar">
        <button className="win95-start-btn" onClick={() => navigate('/')}>⊞ Start</button>
        <div className="win95-taskbar-items">
          <div className="win95-taskbar-item">📝 Create Your Account</div>
        </div>
        <div className="win95-taskbar-clock">
          {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
