import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';
import '../win95.css';

/* ── Win95 Taskbar + Start Menu (reusable) ── */
export function Win95Shell({ children, activeWindow }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [clock, setClock] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    if (isDark) document.body.classList.add('dark-theme');
    else document.body.classList.remove('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  const navItems = [
    { icon: '📊', label: 'Dashboard', path: '/dashboard' },
    { icon: '📦', label: 'Products', path: '/products' },
    { icon: '🛒', label: 'POS Terminal', path: '/pos' },
    { icon: '📋', label: 'Inventory', path: '/inventory' },
    { icon: '📁', label: 'Import CSV', path: '/import' },
  ];

  return (
    <div className="win95-page">
      {/* Sliding/Collapsible Sidebar */}
      <div className={`win95-start-sidebar-panel open ${isCollapsed ? 'collapsed' : ''}`}>
        
        <div className="win95-start-brand" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {!isCollapsed && <span>⊞ Billu95</span>}
          <button 
            className="win95-btn" 
            style={{ minWidth: !isCollapsed ? '30px' : '100%', padding: '2px 4px', fontSize: '12px' }}
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? '→' : '←'}
          </button>
        </div>

        <div className="win95-start-nav">
          {navItems.map(item => (
            <button
              key={item.path}
              className="win95-start-item"
              style={location.pathname === item.path ? {background:'#000080',color:'#fff'} : {}}
              onClick={() => { navigate(item.path); }}
              title={isCollapsed ? item.label : ''}
            >
              <span className="nav-icon">{item.icon}</span>
              {!isCollapsed && <span className="nav-text" style={{marginLeft: 8}}>{item.label}</span>}
            </button>
          ))}
        </div>
        <div className="win95-start-footer">
          <div className="win95-start-divider" />
          <button
            className="win95-start-item"
            title="Toggle Theme"
            onClick={() => setIsDark(!isDark)}
          >
            <span className="nav-icon">{isDark ? '☀️' : '🌙'}</span>
            {!isCollapsed && <span style={{marginLeft: 8}}>{isDark ? 'Light Theme' : 'Dark Theme'}</span>}
          </button>
          <button
            className="win95-start-item win95-shutdown-btn"
            title="Log Out"
            onClick={() => { logout(); }}
          >
            <span className="nav-icon">🔌</span>
            {!isCollapsed && <span style={{marginLeft: 8}}>Shut Down...</span>}
          </button>
        </div>
      </div>

      {/* Desktop */}
      <div className={`win95-desktop sidebar-open ${isCollapsed ? 'sidebar-collapsed' : ''}`}>
        {children}
      </div>

      {/* Taskbar */}
      <div className="win95-taskbar">
        <button className="win95-start-btn win95-btn-toggled">
          ⊞ Start
        </button>
        <div className="win95-taskbar-items">
          {navItems.map(item => (
            location.pathname === item.path && (
              <div key={item.path} className="win95-taskbar-item">
                {item.label}
              </div>
            )
          ))}
        </div>
        {/* Account Icon */}
        <button
          className="win95-account-btn"
          title={user?.name || user?.email || 'Account'}
          onClick={() => navigate('/settings')}
          style={{ padding: user?.picture ? '2px 4px' : undefined, overflow: 'hidden' }}
        >
          {user?.picture ? (
            <img 
              src={user.picture} 
              alt="Profile" 
              style={{ width: '22px', height: '22px', objectFit: 'cover', display: 'block' }} 
            />
          ) : (
            '👤'
          )}
        </button>
        <div className="win95-taskbar-clock">{clock}</div>
      </div>
    </div>
  );
}

/* ── Backward-compatible Sidebar for non-Win95 pages ── */
export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const links = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Products', path: '/products' },
    { label: 'POS Terminal', path: '/pos' },
    { label: 'Inventory', path: '/inventory' },
    { label: 'Import CSV', path: '/import' },
  ];
  return (
    <div className="sidebar">
      <div className="sidebar-logo">Billu Admin</div>
      <div className="sidebar-nav">
        {links.map(l => (
          <a key={l.path} href="#" className={location.pathname === l.path ? 'active' : ''}
            onClick={(e) => { e.preventDefault(); navigate(l.path); }}>{l.label}</a>
        ))}
        <a href="#">Settings</a>
      </div>
      <div className="sidebar-footer">
        <div>{user?.email}</div>
        <button className="link-btn" onClick={logout} style={{marginTop: 8}}>Logout</button>
      </div>
    </div>
  );
}

/* ── Win95 Window Component (reusable) ── */
export function Win95Window({ icon, title, menuItems, statusPanels, children }) {
  const [toast, setToast] = useState('');

  const handleMenuClick = (item) => {
    if (item.onClick) item.onClick();
    else {
      setToast('The feature is only for UI enhancement.');
      // Auto-hide after 2.5s
      setTimeout(() => setToast(''), 2500);
    }
  };
  return (
    <div className="win95-window">
      <div className="win95-titlebar">
        <div className="win95-titlebar-text">{icon} {title}</div>
        <div className="win95-titlebar-controls">
          <button className="win95-titlebar-btn win95-btn-minimize" onClick={() => handleMenuClick({})}>_</button>
          <button className="win95-titlebar-btn win95-btn-maximize" onClick={() => handleMenuClick({})}>□</button>
          <button className="win95-titlebar-btn win95-btn-close" onClick={() => handleMenuClick({})}>✕</button>
        </div>
      </div>
      {menuItems && (
        <div className="win95-menubar">
          {menuItems.map((item, i) => (
            <button key={i} className={`win95-menubar-item ${item.active ? 'active' : ''}`} onClick={() => handleMenuClick(item)}>
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="win95-body">
        {children}
      </div>
      {statusPanels && (
        <div className="win95-statusbar">
          {statusPanels.map((panel, i) => (
            <div key={i} className="win95-status-panel">{panel}</div>
          ))}
        </div>
      )}

      {/* Decorative Toast */}
      {toast && (
        <div className="win95-toast">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ── Product Modal (Add/Edit) ── */
function ProductModal({ product, onClose, onSave }) {
  const isEdit = !!product?.id;
  const [form, setForm] = useState({
    sku: product?.sku || '',
    name: product?.name || '',
    category: product?.category || 'general',
    basePrice: product?.basePrice || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await api.put(`/products/${product.id}`, {
          name: form.name, category: form.category,
          basePrice: parseFloat(form.basePrice),
        });
      } else {
        await api.post('/products', {
          sku: form.sku.toUpperCase(), name: form.name,
          category: form.category, basePrice: parseFloat(form.basePrice),
        });
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
          <div className="win95-titlebar-text">{isEdit ? '✏️' : '➕'} {isEdit ? 'Edit Product' : 'New Product'}</div>
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
              <label className="win95-form-label">SKU / Barcode:</label>
              <div className="win95-input-wrap">
                <input value={form.sku} onChange={(e) => setForm(p => ({...p, sku: e.target.value}))}
                  placeholder="e.g. MILK1L" disabled={isEdit} required
                  style={isEdit ? {color:'#808080'} : {}} />
              </div>
            </div>
            <div className="win95-form-row">
              <label className="win95-form-label">Product Name:</label>
              <div className="win95-input-wrap">
                <input value={form.name} onChange={(e) => setForm(p => ({...p, name: e.target.value}))}
                  placeholder="e.g. Amul Milk 1L" required />
              </div>
            </div>
            <div className="win95-form-row">
              <label className="win95-form-label">Category:</label>
              <div className="win95-input-wrap">
                <input value={form.category} onChange={(e) => setForm(p => ({...p, category: e.target.value}))}
                  placeholder="e.g. dairy, snacks" />
              </div>
            </div>
            <div className="win95-form-row">
              <label className="win95-form-label">Base Price (Rs.):</label>
              <div className="win95-input-wrap">
                <input type="number" step="0.01" min="0" value={form.basePrice}
                  onChange={(e) => setForm(p => ({...p, basePrice: e.target.value}))}
                  placeholder="e.g. 65.00" required />
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

/* ── Delete Confirmation Dialog ── */
function DeleteDialog({ product, onClose, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/products/${product.id}`);
      onDelete();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    } finally { setDeleting(false); }
  };

  return (
    <div className="win95-overlay" onClick={onClose}>
      <div className="win95-dialog" style={{width:340}} onClick={(e) => e.stopPropagation()}>
        <div className="win95-titlebar">
          <div className="win95-titlebar-text">❌ Confirm Delete</div>
          <div className="win95-titlebar-controls">
            <button className="win95-titlebar-btn" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="win95-dialog-body" style={{display:'flex',gap:12,alignItems:'flex-start'}}>
          <div style={{fontSize:32,lineHeight:1}}>⚠️</div>
          <div style={{fontSize:16}}>
            Are you sure you want to delete<br/>
            <strong>{product.name}</strong> ({product.sku})?<br/>
            <span style={{fontSize:14,color:'#808080'}}>This action cannot be undone.</span>
          </div>
        </div>
        <div className="win95-dialog-footer">
          <button className="win95-btn" onClick={onClose}>Cancel</button>
          <button className="win95-btn win95-btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting...' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Products Page ── */
export default function Products() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [deleteProduct, setDeleteProduct] = useState(null);

  const fetchProducts = () => {
    setLoading(true);
    const params = search ? `?search=${encodeURIComponent(search)}&limit=100` : '?limit=100';
    api.get(`/products${params}`).then(res => {
      setProducts(res.data.products);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchProducts(); }, [search]);

  const handleSaved = () => { setShowModal(false); setEditProduct(null); fetchProducts(); };
  const handleDeleted = () => { setDeleteProduct(null); fetchProducts(); };

  return (
    <Win95Shell activeWindow="Products">
      <Win95Window
        icon="📦"
        title={`Products Master — Billu POS`}
        menuItems={[
          { label: <><u>F</u>ile</>, onClick: () => {} },
          { label: <><u>E</u>dit</>, onClick: () => {} },
          { label: <><u>V</u>iew</>, onClick: () => {} },
          { label: <><u>H</u>elp</>, onClick: () => {} },
        ]}
        statusPanels={[
          `${products.length} product(s)`,
          `User: ${user?.name || user?.email || 'admin'}`,
          user?.role?.toUpperCase() || 'ADMIN',
        ]}
      >
        {/* Toolbar */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,gap:8}}>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button className="win95-btn" onClick={() => { setEditProduct(null); setShowModal(true); }}>
              ➕ New
            </button>
            <button className="win95-btn" onClick={fetchProducts}>
              🔄 Refresh
            </button>
          </div>
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            <span style={{fontSize:14}}>Search:</span>
            <div className="win95-input-wrap" style={{width:200}}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or SKU..."
              />
            </div>
          </div>
        </div>

        {/* Section Header */}
        <div className="win95-section-header">► All Products</div>

        {/* Data Table */}
        <div className="win95-sunken" style={{padding:0,maxHeight:'calc(100vh - 260px)',overflow:'auto'}}>
          {loading ? (
            <div style={{padding:20,textAlign:'center'}}>Loading...</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{width:100}}>SKU</th>
                  <th>Name</th>
                  <th style={{width:120}}>Category</th>
                  <th style={{width:100,textAlign:'right'}}>Price</th>
                  <th style={{width:120,textAlign:'center'}}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id}>
                    <td><span className="win95-badge">{p.sku}</span></td>
                    <td>{p.name}</td>
                    <td style={{textTransform:'capitalize'}}>{p.category}</td>
                    <td style={{textAlign:'right',fontWeight:'bold'}}>Rs.{parseFloat(p.basePrice).toFixed(2)}</td>
                    <td style={{textAlign:'center'}}>
                      <button className="win95-btn" style={{minWidth:40,padding:'1px 8px',fontSize:14,marginRight:4}}
                        onClick={() => { setEditProduct(p); setShowModal(true); }}>
                        ✏️
                      </button>
                      <button className="win95-btn" style={{minWidth:40,padding:'1px 8px',fontSize:14,background:'rgba(244, 7, 7, 0.15)',color:'#e70505ff'}}
                        onClick={() => setDeleteProduct(p)}>
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{textAlign:'center',padding:20,color:'#808080'}}>
                      No products found. Click [New] to add one.
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
        <ProductModal
          product={editProduct}
          onClose={() => { setShowModal(false); setEditProduct(null); }}
          onSave={handleSaved}
        />
      )}
      {deleteProduct && (
        <DeleteDialog
          product={deleteProduct}
          onClose={() => setDeleteProduct(null)}
          onDelete={handleDeleted}
        />
      )}
    </Win95Shell>
  );
}
