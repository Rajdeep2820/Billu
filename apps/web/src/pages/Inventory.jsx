import React, { useState, useEffect } from 'react';
import { Sidebar } from './Products';
import api from '../api/client';

export default function Inventory() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/inventory').then(res => {
      setInventory(res.data);
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
          <div>Inventory Master</div>
        </div>
        <div className="page">
          <div className="card">
            <div className="section-header" style={{marginBottom: 12}}>
              <h3 style={{fontSize: 14, color: '#6b7280'}}>Stock Levels</h3>
            </div>
            {loading ? <p>Loading...</p> : (
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Product Name</th>
                    <th>Outlet</th>
                    <th>Current Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map(inv => (
                    <tr key={inv.id}>
                      <td><span className="badge badge-gray">{inv.product.sku}</span></td>
                      <td>{inv.product.name}</td>
                      <td>{inv.outlet.name}</td>
                      <td style={{fontWeight: 600, color: inv.quantity < 10 ? '#ef4444' : 'inherit'}}>
                        {inv.quantity}
                      </td>
                    </tr>
                  ))}
                  {inventory.length === 0 && (
                    <tr><td colSpan="4" className="empty-state" style={{padding:'20px 0'}}>No inventory records found.</td></tr>
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
