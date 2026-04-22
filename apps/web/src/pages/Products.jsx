import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../api/client';

export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="sidebar">
      <div className="sidebar-logo">Billu Admin</div>
      <div className="sidebar-nav">
        <a 
          href="#" 
          onClick={(e) => { e.preventDefault(); navigate('/dashboard'); }} 
          className={location.pathname === '/dashboard' ? 'active' : ''}
        >Dashboard</a>
        <a 
          href="#" 
          onClick={(e) => { e.preventDefault(); navigate('/products'); }} 
          className={location.pathname === '/products' ? 'active' : ''}
        >Products</a>
        <a 
          href="#" 
          onClick={(e) => { e.preventDefault(); navigate('/pos'); }} 
          className={location.pathname === '/pos' ? 'active' : ''}
        >POS Terminal</a>
        <a 
          href="#" 
          onClick={(e) => { e.preventDefault(); navigate('/inventory'); }} 
          className={location.pathname === '/inventory' ? 'active' : ''}
        >Inventory</a>
        <a href="#">Settings</a>
      </div>
      <div className="sidebar-footer">
        <div>{user?.email}</div>
        <button className="link-btn" onClick={logout} style={{marginTop: 8}}>Logout</button>
      </div>
    </div>
  );
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/products?limit=100').then(res => {
      setProducts(res.data.products);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoading(false);
    });
  }, []);

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <div className="topbar">
          <div>Products Master</div>
        </div>
        <div className="page">
          <div className="card">
            <div className="section-header" style={{marginBottom: 12}}>
              <h3 style={{fontSize: 14, color: '#6b7280'}}>All Products</h3>
            </div>
            {loading ? <p>Loading...</p> : (
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Base Price</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id}>
                      <td><span className="badge badge-gray">{p.sku}</span></td>
                      <td>{p.name}</td>
                      <td style={{textTransform: 'capitalize'}}>{p.category}</td>
                      <td>₹{parseFloat(p.basePrice).toFixed(2)}</td>
                    </tr>
                  ))}
                  {products.length === 0 && (
                    <tr><td colSpan="4" className="empty-state" style={{padding:'20px 0'}}>No products found. Use API to add them.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
