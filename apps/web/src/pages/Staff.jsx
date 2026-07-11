import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { Win95Shell, Win95Window } from './Products';

export default function Staff() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [staff, setStaff] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // New staff form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'cashier',
    outletId: '',
  });

  useEffect(() => {
    if (user?.role !== 'admin' && user?.role !== 'manager') {
      navigate('/dashboard');
      return;
    }
    fetchData();
  }, [user, navigate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [staffRes, outletsRes] = await Promise.all([
        api.get('/auth/staff'),
        api.get('/outlets'),
      ]);
      setStaff(staffRes.data);
      const activeOutlets = (outletsRes.data || []).filter(o => o.isActive);
      setOutlets(activeOutlets);
      if (activeOutlets.length > 0) {
        setFormData(prev => ({ ...prev, outletId: activeOutlets[0].id }));
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.post('/auth/staff', formData);
      setStaff([res.data, ...staff]);
      setShowModal(false);
      setFormData({ name: '', email: '', password: '', role: 'cashier', outletId: outlets[0]?.id || '' });
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create staff');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      const res = await api.put(`/auth/staff/${userId}`, { role: newRole });
      setStaff(staff.map(s => s.id === userId ? { ...s, role: res.data.role } : s));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update role');
    }
  };

  const handleOutletChange = async (userId, newOutletId) => {
    try {
      const res = await api.put(`/auth/staff/${userId}`, { outletId: newOutletId });
      setStaff(staff.map(s => s.id === userId ? { ...s, outlet: res.data.outlet } : s));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update outlet assignment');
    }
  };

  return (
    <Win95Shell activeWindow="Staff Management">
      <Win95Window
        icon="👥"
        title="Staff Management — Billu POS"
        menuItems={[{ label: <><u>F</u>ile</> }, { label: <><u>H</u>elp</> }]}
        statusPanels={[
          `${staff.length} staff members`,
          `User: ${user?.name || 'admin'}`,
        ]}
      >
        <div style={{ padding: 10 }}>
          {error && (
            <div style={{ background: '#ffffcc', border: '2px solid #000', padding: '6px 10px', marginBottom: 10, fontSize: 16 }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="win95-section-header" style={{ margin: 0, padding: '4px 8px' }}>► Manage Team</div>
            <button className="win95-btn win95-btn-primary" onClick={() => setShowModal(true)}>
              ➕ Add Staff
            </button>
          </div>

          <div className="win95-sunken" style={{ padding: 0, overflow: 'auto', flex: 1, maxHeight: 400 }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center' }}>Loading staff...</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Assigned Outlet</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 'bold' }}>{s.name}</td>
                      <td>{s.email}</td>
                      <td>
                        {s.id === user?.id || user?.role !== 'admin' ? (
                          <span className="win95-badge">{s.role.toUpperCase()}</span>
                        ) : (
                          <div className="win95-input-wrap">
                            <select
                              value={s.role}
                              onChange={(e) => handleRoleChange(s.id, e.target.value)}
                            >
                              <option value="admin">ADMIN</option>
                              <option value="manager">MANAGER</option>
                              <option value="cashier">CASHIER</option>
                            </select>
                          </div>
                        )}
                      </td>
                      <td>
                        {s.role === 'admin' ? (
                          <span style={{ color: '#808080' }}>All Outlets</span>
                        ) : user?.role !== 'admin' ? (
                          <span>{s.outlet?.name || 'Unassigned'}</span>
                        ) : (
                          <div className="win95-input-wrap">
                            <select
                              value={s.outlet?.id || ''}
                              onChange={(e) => handleOutletChange(s.id, e.target.value)}
                            >
                              {outlets.map(o => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {staff.length === 0 && (
                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: 16 }}>No staff found.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Win95Window>

      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div className="win95-window" style={{ width: 400 }}>
            <div className="win95-titlebar">
              <div className="win95-title">
                <span style={{ marginRight: 6 }}>👥</span>
                Add New Staff Member
              </div>
              <button className="win95-close-btn" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 4 }}>Full Name</label>
                  <div className="win95-input-wrap">
                    <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 4 }}>Email Address</label>
                  <div className="win95-input-wrap">
                    <input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: 4 }}>Temporary Password</label>
                  <div className="win95-input-wrap">
                    <input type="password" required value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: 4 }}>Role</label>
                    <div className="win95-input-wrap">
                      <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                        <option value="cashier">Cashier</option>
                        {user?.role === 'admin' && <option value="manager">Manager</option>}
                      </select>
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: 4 }}>Assign to Outlet</label>
                    <div className="win95-input-wrap">
                      <select required value={formData.outletId} onChange={e => setFormData({ ...formData, outletId: e.target.value })}>
                        {outlets.map(o => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                  <button type="button" className="win95-btn" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="win95-btn win95-btn-primary">Create User</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </Win95Shell>
  );
}
