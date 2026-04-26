import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Win95Shell, Win95Window } from './Products';
import api from '../api/client';

export default function Inventory() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchInventory = () => {
    setLoading(true);
    api.get('/inventory').then(res => {
      setInventory(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { fetchInventory(); }, []);

  const filtered = inventory.filter(inv => {
    if (!search) return true;
    const q = search.toLowerCase();
    return inv.product.name.toLowerCase().includes(q) ||
           inv.product.sku.toLowerCase().includes(q);
  });

  const lowStockCount = inventory.filter(i => i.quantity < 10).length;

  return (
    <Win95Shell activeWindow="Inventory">
      <Win95Window
        icon="📋"
        title="Inventory Manager — Billu POS"
        menuItems={[
          { label: <><u>F</u>ile</> },
          { label: <><u>V</u>iew</> },
          { label: <><u>H</u>elp</> },
        ]}
        statusPanels={[
          `${filtered.length} of ${inventory.length} record(s)`,
          lowStockCount > 0 ? `⚠️ ${lowStockCount} low stock` : '✅ Stock OK',
          `User: ${user?.name || user?.email || 'admin'}`,
        ]}
      >
        {/* Toolbar */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,gap:8}}>
          <button className="win95-btn" onClick={fetchInventory}>🔄 Refresh</button>
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            <span style={{fontSize:14}}>Search:</span>
            <div className="win95-input-wrap" style={{width:200}}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Product or SKU..."
              />
            </div>
          </div>
        </div>

        {/* Section Header */}
        <div className="win95-section-header">► Stock Levels</div>

        {/* Data Table */}
        <div className="win95-sunken" style={{padding:0,flex:1,overflow:'auto',minHeight:0}}>
          {loading ? (
            <div style={{padding:20,textAlign:'center'}}>Loading inventory...</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{width:100}}>SKU</th>
                  <th>Product Name</th>
                  <th style={{width:140}}>Outlet</th>
                  <th style={{width:120,textAlign:'right'}}>Stock</th>
                  <th style={{width:80,textAlign:'center'}}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => (
                  <tr key={inv.id}>
                    <td><span className="win95-badge">{inv.product.sku}</span></td>
                    <td>{inv.product.name}</td>
                    <td>{inv.outlet.name}</td>
                    <td style={{
                      textAlign:'right', fontWeight:'bold',
                      color: inv.quantity < 10 ? '#cc0000' : 'inherit'
                    }}>
                      {inv.quantity}
                    </td>
                    <td style={{textAlign:'center',fontSize:14}}>
                      {inv.quantity === 0
                        ? <span style={{color:'#cc0000',fontWeight:'bold'}}>OUT</span>
                        : inv.quantity < 10
                          ? <span style={{color:'#cc8800'}}>LOW</span>
                          : <span style={{color:'#008000'}}>OK</span>
                      }
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan="5" style={{textAlign:'center',padding:20,color:'#808080'}}>
                    No inventory records found.
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Win95Window>
    </Win95Shell>
  );
}
