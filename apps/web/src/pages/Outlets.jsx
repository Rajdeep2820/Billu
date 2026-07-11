import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Win95Shell, Win95Window } from './Products';
import api from '../api/client';

/* ── Outlet Modal (Add/Edit) ── */
function OutletModal({ outlet, onClose, onSave }) {
  const isEdit = !!outlet?.id;
  const [form, setForm] = useState({
    name: outlet?.name || '',
    address: outlet?.address || '',
    city: outlet?.city || '',
    state: outlet?.state || '',
    timezone: outlet?.timezone || 'Asia/Kolkata',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await api.put(`/outlets/${outlet.id}`, form);
      } else {
        await api.post('/outlets', form);
      }
      onSave();
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="win95-overlay" onClick={onClose}>
      <div className="win95-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="win95-titlebar">
          <div className="win95-titlebar-text">{isEdit ? '✏️' : '➕'} {isEdit ? 'Edit Outlet' : 'New Outlet'}</div>
          <div className="win95-titlebar-controls">
            <button className="win95-titlebar-btn" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="win95-dialog-body">
          {error && (
            <div style={{background:'#ffffcc',border:'1px solid #000',padding:'4px 8px',marginBottom:8,fontSize:14}}>
              ⚠️ {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="win95-form-row">
              <label className="win95-form-label">Outlet Name:*</label>
              <div className="win95-input-wrap">
                <input value={form.name} onChange={(e) => setForm(p => ({...p, name: e.target.value}))}
                  placeholder="e.g. South Delhi Branch" required />
              </div>
            </div>
            <div className="win95-form-row">
              <label className="win95-form-label">Address:</label>
              <div className="win95-input-wrap">
                <input value={form.address} onChange={(e) => setForm(p => ({...p, address: e.target.value}))}
                  placeholder="e.g. 123 Market Road" />
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div className="win95-form-row">
                <label className="win95-form-label">City:</label>
                <div className="win95-input-wrap">
                  <input value={form.city} onChange={(e) => setForm(p => ({...p, city: e.target.value}))}
                    placeholder="e.g. New Delhi" />
                </div>
              </div>
              <div className="win95-form-row">
                <label className="win95-form-label">State:</label>
                <div className="win95-input-wrap">
                  <input value={form.state} onChange={(e) => setForm(p => ({...p, state: e.target.value}))}
                    placeholder="e.g. Delhi" />
                </div>
              </div>
            </div>
            <div className="win95-form-row">
              <label className="win95-form-label">Timezone:</label>
              <div className="win95-input-wrap">
                <select value={form.timezone} onChange={(e) => setForm(p => ({...p, timezone: e.target.value}))}>
                  <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                  <option value="America/New_York">America/New_York (EST)</option>
                  <option value="Europe/London">Europe/London (GMT)</option>
                  <option value="Asia/Singapore">Asia/Singapore (SGT)</option>
                </select>
              </div>
            </div>
          </form>
        </div>
        <div className="win95-dialog-footer">
          <button className="win95-btn" onClick={onClose}>Cancel</button>
          <button className="win95-btn win95-btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Deactivate Confirmation Dialog ── */
function DeactivateDialog({ outlet, onClose, onConfirm }) {
  const [processing, setProcessing] = useState(false);
  const isActive = outlet.isActive;

  const handleToggle = async () => {
    setProcessing(true);
    try {
      await api.patch(`/outlets/${outlet.id}`, { isActive: !isActive });
      onConfirm();
    } catch (err) {
      alert(err.response?.data?.error || 'Operation failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="win95-overlay" onClick={onClose}>
      <div className="win95-dialog" style={{width:380}} onClick={(e) => e.stopPropagation()}>
        <div className="win95-titlebar">
          <div className="win95-titlebar-text">{isActive ? '🔒' : '🔓'} {isActive ? 'Deactivate' : 'Reactivate'} Outlet</div>
          <div className="win95-titlebar-controls">
            <button className="win95-titlebar-btn" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="win95-dialog-body" style={{display:'flex',gap:12,alignItems:'flex-start'}}>
          <div style={{fontSize:32,lineHeight:1}}>⚠️</div>
          <div style={{fontSize:16}}>
            {isActive ? (
              <>
                Are you sure you want to deactivate<br/>
                <strong>{outlet.name}</strong>?<br/>
                <span style={{fontSize:14,color:'#808080'}}>
                  Staff assigned to this outlet will not be able to use POS. Sales history is preserved.
                </span>
              </>
            ) : (
              <>
                Reactivate <strong>{outlet.name}</strong>?<br/>
                <span style={{fontSize:14,color:'#808080'}}>
                  This outlet will become available for POS and staff assignment again.
                </span>
              </>
            )}
          </div>
        </div>
        <div className="win95-dialog-footer">
          <button className="win95-btn" onClick={onClose}>Cancel</button>
          <button
            className={`win95-btn ${isActive ? 'win95-btn-danger' : 'win95-btn-primary'}`}
            onClick={handleToggle}
            disabled={processing}
          >
            {processing ? 'Processing...' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Outlets Page ── */
export default function Outlets() {
  const { user } = useAuth();
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editOutlet, setEditOutlet] = useState(null);
  const [toggleOutlet, setToggleOutlet] = useState(null);

  const fetchOutlets = () => {
    setLoading(true);
    api.get('/outlets').then(res => {
      setOutlets(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchOutlets(); }, []);

  const handleSaved = () => { setShowModal(false); setEditOutlet(null); fetchOutlets(); };
  const handleToggled = () => { setToggleOutlet(null); fetchOutlets(); };

  const activeCount = outlets.filter(o => o.isActive).length;

  return (
    <Win95Shell activeWindow="Outlets">
      <Win95Window
        icon="🏪"
        title="Outlet Manager — Billu POS"
        menuItems={[
          { label: <><u>F</u>ile</> },
          { label: <><u>E</u>dit</> },
          { label: <><u>H</u>elp</> },
        ]}
        statusPanels={[
          `${outlets.length} outlet(s) · ${activeCount} active`,
          `User: ${user?.name || user?.email || 'admin'}`,
          user?.role?.toUpperCase() || 'ADMIN',
        ]}
      >
        {/* Toolbar */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,gap:8}}>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button className="win95-btn" onClick={() => { setEditOutlet(null); setShowModal(true); }}>
              ➕ New Outlet
            </button>
            <button className="win95-btn" onClick={fetchOutlets}>
              🔄 Refresh
            </button>
          </div>
          <div style={{fontSize:14,color:'var(--win-dark)'}}>
            💡 {activeCount > 1
              ? 'Combined Analytics dashboard is available!'
              : 'Add another outlet to unlock Combined Analytics.'}
          </div>
        </div>

        {/* Section Header */}
        <div className="win95-section-header">► All Outlets / Shops</div>

        {/* Data Table */}
        <div className="win95-sunken" style={{padding:0,maxHeight:'calc(100vh - 260px)',overflow:'auto'}}>
          {loading ? (
            <div style={{padding:20,textAlign:'center'}}>Loading outlets...</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Address</th>
                  <th style={{width:100}}>City</th>
                  <th style={{width:80}}>State</th>
                  <th style={{width:80,textAlign:'center'}}>Staff</th>
                  <th style={{width:80,textAlign:'center'}}>Sales</th>
                  <th style={{width:80,textAlign:'center'}}>Status</th>
                  <th style={{width:130,textAlign:'center'}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {outlets.map(o => (
                  <tr key={o.id} style={!o.isActive ? {opacity:0.5} : {}}>
                    <td style={{fontWeight:'bold'}}>{o.name}</td>
                    <td style={{fontSize:16}}>{o.address || '—'}</td>
                    <td>{o.city || '—'}</td>
                    <td>{o.state || '—'}</td>
                    <td style={{textAlign:'center'}}>{o._count?.users || 0}</td>
                    <td style={{textAlign:'center'}}>{o._count?.transactions || 0}</td>
                    <td style={{textAlign:'center'}}>
                      {o.isActive
                        ? <span style={{color:'#008000',fontWeight:'bold'}}>Active</span>
                        : <span style={{color:'#808080'}}>Inactive</span>
                      }
                    </td>
                    <td style={{textAlign:'center'}}>
                      <button className="win95-btn" style={{minWidth:40,padding:'1px 8px',fontSize:14,marginRight:4}}
                        onClick={() => { setEditOutlet(o); setShowModal(true); }}>
                        ✏️
                      </button>
                      <button
                        className="win95-btn"
                        style={{
                          minWidth:40,padding:'1px 8px',fontSize:14,
                          background: o.isActive ? 'rgba(244, 7, 7, 0.15)' : 'rgba(5, 219, 5, 0.15)',
                          color: o.isActive ? '#e70505' : '#008000',
                        }}
                        onClick={() => setToggleOutlet(o)}
                      >
                        {o.isActive ? '🔒' : '🔓'}
                      </button>
                    </td>
                  </tr>
                ))}
                {outlets.length === 0 && (
                  <tr>
                    <td colSpan="8" style={{textAlign:'center',padding:20,color:'#808080'}}>
                      No outlets found. Click [New Outlet] to add one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Win95Window>

      {/* Modals */}
      {showModal && (
        <OutletModal
          outlet={editOutlet}
          onClose={() => { setShowModal(false); setEditOutlet(null); }}
          onSave={handleSaved}
        />
      )}
      {toggleOutlet && (
        <DeactivateDialog
          outlet={toggleOutlet}
          onClose={() => setToggleOutlet(null)}
          onConfirm={handleToggled}
        />
      )}
    </Win95Shell>
  );
}
