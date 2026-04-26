import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import '../win95.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Login() {
  const { login, googleLogin, isAuth } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef(null);

  useEffect(() => {
    if (isAuth) { navigate('/dashboard', { replace: true }); return; }

    if (GOOGLE_CLIENT_ID && window.google) {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleResponse,
      });
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline', size: 'large', width: 360, text: 'signin_with',
      });
    }
  }, []);

  const handleGoogleResponse = async (response) => {
    setError('');
    setLoading(true);
    try {
      const data = await googleLogin(response.credential);
      navigate(data.user.role === 'admin' ? '/dashboard' : '/pos', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user } = await login(email, password);
      navigate(user.role === 'admin' ? '/dashboard' : '/pos', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="win95-page">
      <div className="win95-desktop" style={{alignItems:'center',justifyContent:'center',paddingBottom:46}}>
        <div className="win95-window" style={{maxWidth:440}}>
          {/* Title Bar */}
          <div className="win95-titlebar">
            <div className="win95-titlebar-text">🔑 Sign In — Billu POS</div>
            <div className="win95-titlebar-controls">
              <button className="win95-titlebar-btn win95-btn-minimize">_</button>
              <button className="win95-titlebar-btn win95-btn-maximize">□</button>
              <button className="win95-titlebar-btn win95-btn-close" onClick={() => navigate('/')}>✕</button>
            </div>
          </div>

          {/* Body */}
          <div style={{padding:20}}>
            <div style={{textAlign:'center',marginBottom:16}}>
              <div style={{fontSize:40,marginBottom:4}}>🖥️</div>
              <div style={{fontSize:24,fontWeight:'bold',color:'var(--win-blue)'}}>Billu POS</div>
              <div style={{fontSize:16,color:'var(--win-dark)'}}>Sign in to your account</div>
            </div>

            {error && (
              <div style={{background:'#ffffcc',border:'2px solid #000',padding:'6px 10px',marginBottom:10,fontSize:16}}>
                ⚠️ {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="win95-form-row">
                <label className="win95-form-label">Email Address</label>
                <div className="win95-input-wrap">
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus />
                </div>
              </div>
              <div className="win95-form-row">
                <label className="win95-form-label">Password</label>
                <div className="win95-input-wrap">
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" required />
                </div>
              </div>

              <button
                type="submit"
                className="win95-btn win95-btn-primary"
                style={{width:'100%',fontSize:20,padding:'8px 0',marginTop:8}}
                disabled={loading}
              >
                {loading ? '⏳ Signing in...' : '🔑 Sign In'}
              </button>
            </form>

            {/* Divider */}
            <div style={{display:'flex',alignItems:'center',gap:8,margin:'14px 0'}}>
              <div style={{flex:1,height:1,background:'var(--win-dark)'}} />
              <span style={{fontSize:14,color:'var(--win-dark)'}}>OR</span>
              <div style={{flex:1,height:1,background:'var(--win-dark)'}} />
            </div>

            {/* Google Sign-In */}
            {GOOGLE_CLIENT_ID ? (
              <div style={{display:'flex',justifyContent:'center'}}>
                <div ref={googleBtnRef} />
              </div>
            ) : (
              <button className="win95-btn" style={{width:'100%',fontSize:18,padding:'8px 0'}} disabled>
                🔒 Google Sign-In (not configured)
              </button>
            )}

            {/* Register Link */}
            <div style={{textAlign:'center',marginTop:14,fontSize:16}}>
              Don't have an account?{' '}
              <Link to="/register" style={{color:'var(--win-blue)',fontWeight:'bold'}}>Register Free</Link>
            </div>
          </div>

          {/* Status Bar */}
          <div className="win95-statusbar">
            <div className="win95-status-panel">Ready</div>
          </div>
        </div>
      </div>

      {/* Taskbar */}
      <div className="win95-taskbar">
        <button className="win95-start-btn" onClick={() => navigate('/')}>⊞ Start</button>
        <div className="win95-taskbar-items">
          <div className="win95-taskbar-item">🔑 Sign In</div>
        </div>
        <div className="win95-taskbar-clock">
          {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
