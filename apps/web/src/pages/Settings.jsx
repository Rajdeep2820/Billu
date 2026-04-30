import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Win95Shell, Win95Window } from './Products';
import api from '../api/client';

export default function Settings() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [name, setName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [upiId, setUpiId] = useState('');

  // Password change
  const [showPwdForm, setShowPwdForm] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  // Messages
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const { data } = await api.get('/auth/me');
      setProfile(data);
      setName(data.name || '');
      setStoreName(data.tenant?.name || '');
    } catch (err) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileSave = async () => {
    setError('');
    setSuccess('');
    try {
      await api.put('/auth/me', { name, storeName });
      setSuccess('✓ Profile updated successfully!');
      loadProfile();
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPwd !== confirmPwd) { setError('New passwords do not match'); return; }
    if (newPwd.length < 6) { setError('Password must be at least 6 characters'); return; }
    try {
      await api.put('/auth/me/password', { currentPassword: currentPwd, newPassword: newPwd });
      setSuccess('✓ Password changed successfully!');
      setShowPwdForm(false);
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (err) {
      setError(err.response?.data?.error || 'Password change failed');
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await api.delete('/auth/me');
      logout();
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Win95Shell activeWindow="Settings">
        <Win95Window icon="⚙️" title="Loading..." menuItems={[]} statusPanels={['Loading...']}>
          <div style={{padding:40,textAlign:'center',fontSize:20}}>⏳ Loading profile...</div>
        </Win95Window>
      </Win95Shell>
    );
  }

  return (
    <Win95Shell activeWindow="Settings">
      <Win95Window
        icon="⚙️"
        title="Settings — Billu POS"
        menuItems={[
          { label: <><u>F</u>ile</> },
          { label: <><u>H</u>elp</> },
        ]}
        statusPanels={[
          `User: ${profile?.name || user?.email}`,
          `Role: ${profile?.role || 'admin'}`,
          `Plan: ${profile?.tenant?.plan || 'starter'}`,
        ]}
      >
        {/* Messages */}
        {success && (
          <div style={{background:'#ccffcc',border:'2px solid #008000',padding:'6px 10px',marginBottom:10,fontSize:16,color:'#006600'}}>
            {success}
          </div>
        )}
        {error && (
          <div style={{background:'#ffffcc',border:'2px solid #000',padding:'6px 10px',marginBottom:10,fontSize:16}}>
            ⚠️ {error}
          </div>
        )}

        {/* ── Account Info (read-only) ── */}
        <div className="win95-section-header">► Account Information</div>
        <div className="win95-raised" style={{padding:12,marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
          <div style={{display:'grid',gridTemplateColumns:'140px 1fr',gap:6,fontSize:18, flex: 1}}>
            <span style={{fontWeight:'bold'}}>Email:</span>
            <span>{profile?.email}</span>
            <span style={{fontWeight:'bold'}}>Role:</span>
            <span style={{textTransform:'capitalize'}}>{profile?.role}</span>
            <span style={{fontWeight:'bold'}}>Member Since:</span>
            <span>{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN') : '—'}</span>
            <span style={{fontWeight:'bold'}}>Login Method:</span>
            <span>{profile?.isGoogleUser ? '🔵 Google Account' : '🔑 Password'}</span>
            <span style={{fontWeight:'bold'}}>Outlet:</span>
            <span>{profile?.outlet?.name || '—'} {profile?.outlet?.city ? `(${profile.outlet.city})` : ''}</span>
          </div>
          {user?.picture && (
            <div style={{
              width: '110px', 
              height: '110px', 
              borderTop: '2px solid var(--win-dark)', 
              borderLeft: '2px solid var(--win-dark)', 
              borderRight: '2px solid var(--win-white)', 
              borderBottom: '2px solid var(--win-white)',
              marginLeft: '20px', 
              marginRight: '10px',
              backgroundColor: 'var(--win-gray)', 
              padding: '4px',
              flexShrink: 0
            }}>
              <img src={user.picture} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="Profile" />
            </div>
          )}
        </div>

        {/* ── Editable Profile ── */}
        <div className="win95-section-header">► Edit Profile</div>
        <div className="win95-raised" style={{padding:12,marginBottom:10}}>
          <div className="win95-form-row">
            <label className="win95-form-label">Your Name</label>
            <div className="win95-input-wrap">
              <input value={name} onChange={e => setName(e.target.value)} />
            </div>
          </div>
          <div className="win95-form-row">
            <label className="win95-form-label">Store / Business Name</label>
            <div className="win95-input-wrap">
              <input value={storeName} onChange={e => setStoreName(e.target.value)} />
            </div>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end'}}>
            <button className="win95-btn win95-btn-primary" onClick={handleProfileSave}>
              💾 Save Changes
            </button>
          </div>
        </div>

        {/* ── Change Password ── */}
        <div className="win95-section-header" style={{cursor:'pointer',userSelect:'none'}} onClick={() => setShowPwdForm(v => !v)}>
          {showPwdForm ? '▼' : '►'} Change Password
        </div>
        <div style={{
          maxHeight: showPwdForm ? '300px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.35s ease',
          marginBottom: 10,
        }}>
          <div className="win95-raised" style={{padding:12}}>
            <form onSubmit={handlePasswordChange}>
              {!profile?.isGoogleUser && (
                <div className="win95-form-row">
                  <label className="win95-form-label">Current Password</label>
                  <div className="win95-input-wrap">
                    <input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder="Enter current password" required />
                  </div>
                </div>
              )}
              <div className="win95-form-row">
                <label className="win95-form-label">New Password</label>
                <div className="win95-input-wrap">
                  <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min 6 characters" required />
                </div>
              </div>
              <div className="win95-form-row">
                <label className="win95-form-label">Confirm New Password</label>
                <div className="win95-input-wrap">
                  <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Re-enter new password" required />
                </div>
              </div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
                <button type="button" className="win95-btn" onClick={() => setShowPwdForm(false)}>Cancel</button>
                <button type="submit" className="win95-btn win95-btn-primary">🔐 Update Password</button>
              </div>
            </form>
          </div>
        </div>

        {/* ── UPI Configuration ── */}
        <div className="win95-section-header">► UPI Payment Settings</div>
        <div className="win95-raised" style={{padding:12,marginBottom:10}}>
          <div className="win95-form-row">
            <label className="win95-form-label">Merchant UPI ID</label>
            <div className="win95-input-wrap">
              <input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="e.g. yourname@upi" />
            </div>
          </div>
          <div style={{fontSize:14,color:'var(--win-dark)'}}>
            💡 UPI ID is currently configured on the server. Contact your admin to change it.
          </div>
        </div>

        {/* ── Danger Zone ── */}
        <div className="win95-section-header" style={{color:'#cc0000'}}>► Danger Zone</div>
        <div className="win95-raised" style={{padding:12,marginBottom:10}}>
          {/* Log Out row */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div>
              <div style={{fontWeight:'bold',fontSize:18}}>Log Out</div>
              <div style={{fontSize:14,color:'var(--win-dark)'}}>Sign out of your account on this device.</div>
            </div>
            <button className="win95-btn" style={{color:'#cc0000',fontWeight:'bold'}} onClick={logout}>
              🔌 Log Out
            </button>
          </div>
          <div style={{height:1,background:'var(--win-dark)',margin:'8px 0'}} />
          {/* Delete Account row */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <div>
              <div style={{fontWeight:'bold',fontSize:18,color:'#cc0000'}}>Delete Account</div>
              <div style={{fontSize:14,color:'var(--win-dark)'}}>Permanently delete your account and ALL data. This cannot be undone.</div>
            </div>
            <button
              className="win95-btn"
              style={{color:'#fff',background:'#cc0000',fontWeight:'bold',borderColor:'#990000'}}
              onClick={() => setShowDeleteConfirm(true)}
            >
              🗑️ Delete Account
            </button>
          </div>
        </div>

        {/* ── Delete Confirmation Dialog ── */}
        {showDeleteConfirm && (
          <div className="win95-overlay">
            <div className="win95-dialog">
              <div className="win95-titlebar">
                <div className="win95-titlebar-text">⚠️ Confirm Account Deletion</div>
                <div className="win95-titlebar-controls">
                  <button className="win95-titlebar-btn win95-btn-close" onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); }}>✕</button>
                </div>
              </div>
              <div style={{padding:16}}>
                <div style={{fontSize:18,marginBottom:10,color:'#cc0000',fontWeight:'bold'}}>
                  ⚠️ This will permanently delete:
                </div>
                <ul style={{fontSize:16,marginBottom:12,paddingLeft:20}}>
                  <li>Your account and login credentials</li>
                  <li>All products and inventory data</li>
                  <li>All sales transactions</li>
                  <li>Your entire store ({profile?.tenant?.name})</li>
                </ul>
                <div style={{fontSize:16,marginBottom:8,fontWeight:'bold'}}>
                  Type <span style={{color:'#cc0000',fontFamily:'monospace'}}>DELETE</span> to confirm:
                </div>
                <div className="win95-input-wrap" style={{marginBottom:12}}>
                  <input
                    value={deleteInput}
                    onChange={e => setDeleteInput(e.target.value)}
                    placeholder="Type DELETE here"
                    autoFocus
                  />
                </div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                  <button className="win95-btn" onClick={() => { setShowDeleteConfirm(false); setDeleteInput(''); }}>
                    Cancel
                  </button>
                  <button
                    className="win95-btn"
                    style={{color:'#fff',background: deleteInput === 'DELETE' ? '#cc0000' : '#aaa',cursor: deleteInput === 'DELETE' ? 'pointer' : 'not-allowed'}}
                    disabled={deleteInput !== 'DELETE' || deleting}
                    onClick={handleDeleteAccount}
                  >
                    {deleting ? '⏳ Deleting...' : '🗑️ Yes, Delete Everything'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </Win95Window>
    </Win95Shell>
  );
}
