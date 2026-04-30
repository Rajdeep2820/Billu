import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { Win95Shell, Win95Window } from './Products';

export default function Dashboard() {
  const { token, user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [liveSalesCount, setLiveSalesCount] = useState(0);

  useEffect(() => {
    api.get('/dashboard/summary').then(res => setSummary(res.data));
    api.get('/dashboard/top-products').then(res => setTopProducts(res.data));

    const socket = io('http://localhost:4000', { auth: { token } });

    socket.on('sale:new', (sale) => {
      setLiveSalesCount(prev => prev + 1);
      setSummary(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          today: {
            ...prev.today,
            totalRevenue: parseFloat(prev.today.totalRevenue) + parseFloat(sale.totalAmount),
            transactionCount: prev.today.transactionCount + 1
          }
        };
      });
    });

    return () => socket.disconnect();
  }, [token]);

  if (!summary) {
    return (
      <Win95Shell activeWindow="Dashboard">
        <Win95Window icon="📊" title="Dashboard — Billu POS"
          statusPanels={['Loading...']}>
          <div style={{padding:40,textAlign:'center'}}>Loading dashboard data...</div>
        </Win95Window>
      </Win95Shell>
    );
  }

  return (
    <Win95Shell activeWindow="Dashboard">
      <Win95Window
        icon="📊"
        title="Dashboard — Billu POS"
        menuItems={[
          { label: <><u>F</u>ile</> },
          { label: <><u>V</u>iew</> },
          { label: <><u>H</u>elp</> },
        ]}
        statusPanels={[
          `User: ${user?.name || user?.email || 'admin'}`,
          user?.role?.toUpperCase() || 'ADMIN',
          liveSalesCount > 0 ? `+${liveSalesCount} live sales` : 'Idle',
        ]}
      >
        {/* ── Stat Cards Row ── */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
          <div className="win95-stat">
            <div className="win95-stat-value">
              Rs.{parseFloat(summary.today.totalRevenue).toFixed(2)}
            </div>
            <div className="win95-stat-label">Today's Revenue</div>
          </div>
          <div className="win95-stat">
            <div className="win95-stat-value">
              {summary.today.transactionCount}
            </div>
            <div className="win95-stat-label">Transactions Today</div>
          </div>
          <div className="win95-stat">
            <div className="win95-stat-value">
              {liveSalesCount}
            </div>
            <div className="win95-stat-label">Live Sales (Session)</div>
          </div>
        </div>

        {/* ── Two-Column: Top Products + Recent Transactions ── */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,flex:1,minHeight:0}}>

          {/* Top Products */}
          <div style={{display:'flex',flexDirection:'column',minHeight:0}}>
            <div className="win95-section-header">► Top Products</div>
            <div className="win95-sunken" style={{padding:0,flex:1,overflow:'auto'}}>
              <table>
                <thead>
                  <tr><th>SKU</th><th>Name</th><th style={{textAlign:'right'}}>Sold</th></tr>
                </thead>
                <tbody>
                  {topProducts.map(p => (
                    <tr key={p.sku}>
                      <td><span className="win95-badge">{p.sku}</span></td>
                      <td>{p.name}</td>
                      <td style={{textAlign:'right',fontWeight:'bold'}}>{p.totalQty}</td>
                    </tr>
                  ))}
                  {topProducts.length === 0 && (
                    <tr><td colSpan="3" style={{textAlign:'center',padding:16,color:'#808080'}}>
                      No sales data yet.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent Transactions */}
          <div style={{display:'flex',flexDirection:'column',minHeight:0}}>
            <div className="win95-section-header">► Recent Transactions</div>
            <div className="win95-sunken" style={{padding:0,flex:1,overflow:'auto'}}>
              <table>
                <thead>
                  <tr><th>ID</th><th style={{textAlign:'right'}}>Amount</th><th>Time</th></tr>
                </thead>
                <tbody>
                  {summary.recentSales.map(tx => (
                    <tr key={tx.id}>
                      <td style={{fontSize:16}}>{tx.id.split('-')[0]}</td>
                      <td style={{textAlign:'right',fontWeight:'bold'}}>
                        Rs.{parseFloat(tx.totalAmount).toFixed(2)}
                      </td>
                      <td>{new Date(tx.createdAt).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                  {summary.recentSales.length === 0 && (
                    <tr><td colSpan="3" style={{textAlign:'center',padding:16,color:'#808080'}}>
                      No transactions yet.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Win95Window>
    </Win95Shell>
  );
}
