import React, { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Win95Shell, Win95Window } from './Products';
import api from '../api/client';

export default function Inventory() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  // Outlet filter state
  const [outlets, setOutlets] = useState([]);
  const [selectedOutletId, setSelectedOutletId] = useState(() => localStorage.getItem('billu_admin_outlet_id') || '');

  // Adjustment state
  const [editingItem, setEditingItem] = useState(null);
  const [adjMode, setAdjMode] = useState('add'); // 'add', 'subtract', 'set'
  const [adjQty, setAdjQty] = useState('');
  const [adjError, setAdjError] = useState(null);

  useEffect(() => {
    if (user?.role === 'admin' || user?.role === 'manager') {
      api.get('/outlets').then(res => {
        const activeOutlets = (res.data || []).filter(o => o.isActive);
        setOutlets(activeOutlets);
        
        const savedId = localStorage.getItem('billu_admin_outlet_id');
        const isValidSaved = activeOutlets.some(o => o.id === savedId);

        if (activeOutlets.length > 0 && (!savedId || !isValidSaved)) {
          const defaultOutlet = activeOutlets.find(o => o.id === user.outletId) || activeOutlets[0];
          setSelectedOutletId(defaultOutlet.id);
          localStorage.setItem('billu_admin_outlet_id', defaultOutlet.id);
        } else if (isValidSaved) {
          setSelectedOutletId(savedId);
        } else {
          fetchInventory('');
        }
      }).catch(() => fetchInventory(''));
    } else {
      // Cashier only sees their own assigned outlet
      fetchInventory('');
    }
  }, [user]);

  useEffect(() => {
    if (selectedOutletId) {
      localStorage.setItem('billu_admin_outlet_id', selectedOutletId);
      fetchInventory(selectedOutletId);
    }
  }, [selectedOutletId]);

  const fetchInventory = (outletId = selectedOutletId) => {
    setLoading(true);
    const qs = outletId ? `?outletId=${outletId}` : '';
    api.get(`/inventory${qs}`).then(res => {
      setInventory(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  const filtered = inventory.filter(inv => {
    if (!search) return true;
    const q = search.toLowerCase();
    return inv.product.name.toLowerCase().includes(q) ||
           inv.product.sku.toLowerCase().includes(q);
  });

  const lowStockCount = inventory.filter(i => i.quantity < 10).length;

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    setAdjError(null);
    const qty = parseInt(adjQty, 10);
    if (isNaN(qty) || qty < 0) {
      setAdjError('Please enter a valid positive number');
      return;
    }
    
    try {
      await api.put(`/inventory/${editingItem.outlet.id}/${editingItem.product.id}`, {
        mode: adjMode,
        quantity: qty,
      });
      // Refresh inventory list
      fetchInventory();
      setEditingItem(null);
      setAdjQty('');
    } catch (err) {
      setAdjError(err.response?.data?.error || 'Adjustment failed');
    }
  };

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
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8,gap:8,flexWrap:'wrap'}}>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button className="win95-btn" onClick={() => fetchInventory()}>🔄 Refresh</button>
            
            {(user?.role === 'admin' || user?.role === 'manager') && outlets.length > 0 && (
              <>
                <div style={{width:1,height:24,background:'var(--win-dark)'}} />
                <span style={{fontSize:14}}>Outlet:</span>
                <div className="win95-input-wrap">
                  <select value={selectedOutletId} onChange={e => setSelectedOutletId(e.target.value)}>
                    <option value="">All Outlets</option>
                    {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
          
          <div style={{display:'flex',gap:4,alignItems:'center'}}>
            <span style={{fontSize:14}}>Search:</span>
            <div className="win95-input-wrap" style={{width:180}}>
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
                  <th style={{width:80,textAlign:'right'}}>Stock</th>
                  <th style={{width:80,textAlign:'center'}}>Status</th>
                  <th style={{width:80,textAlign:'center'}}>Action</th>
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
                    <td style={{textAlign:'center'}}>
                      {(user?.role === 'admin' || user?.role === 'manager') && (
                        <button 
                          className="win95-btn" 
                          style={{padding: '2px 6px', fontSize: 12}}
                          onClick={() => {
                            setEditingItem(inv);
                            setAdjQty('');
                            setAdjMode('add');
                          }}
                        >
                          Adjust
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan="6" style={{textAlign:'center',padding:20,color:'#808080'}}>
                    No inventory records found.
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </Win95Window>

      {/* Adjustment Modal */}
      {editingItem && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
        }}>
          <div className="win95-window" style={{ width: 350 }}>
            <div className="win95-titlebar">
              <div className="win95-title">
                <span style={{ marginRight: 6 }}>⚖️</span>
                Adjust Stock
              </div>
              <button className="win95-close-btn" onClick={() => setEditingItem(null)}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              {adjError && (
                <div style={{ background: '#ffffcc', border: '1px solid #000', padding: 6, marginBottom: 10, fontSize: 14 }}>
                  ⚠️ {adjError}
                </div>
              )}
              
              <div style={{marginBottom: 12}}>
                <div style={{fontWeight: 'bold', fontSize: 18}}>{editingItem.product.name}</div>
                <div style={{fontSize: 14, color: '#808080'}}>SKU: {editingItem.product.sku} | Outlet: {editingItem.outlet.name}</div>
                <div style={{marginTop: 6}}>Current Stock: <span style={{fontWeight:'bold'}}>{editingItem.quantity}</span></div>
              </div>

              <form onSubmit={handleAdjustSubmit}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <div className="win95-input-wrap" style={{ flex: 1 }}>
                    <select value={adjMode} onChange={e => setAdjMode(e.target.value)}>
                      <option value="add">Add (+)</option>
                      <option value="subtract">Subtract (-)</option>
                      <option value="set">Set Exact (=)</option>
                    </select>
                  </div>
                  <div className="win95-input-wrap" style={{ flex: 1 }}>
                    <input 
                      type="number" 
                      min="0" 
                      required 
                      value={adjQty} 
                      onChange={e => setAdjQty(e.target.value)} 
                      placeholder="Qty..." 
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" className="win95-btn" onClick={() => setEditingItem(null)}>Cancel</button>
                  <button type="submit" className="win95-btn win95-btn-primary">Apply Update</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </Win95Shell>
  );
}
