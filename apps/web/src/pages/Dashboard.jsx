import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { Sidebar } from './Products';

export default function Dashboard() {
  const { token, user, logout } = useAuth();
  const [summary, setSummary] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [liveSalesCount, setLiveSalesCount] = useState(0);

  useEffect(() => {
    api.get('/dashboard/summary').then(res => setSummary(res.data));
    api.get('/dashboard/top-products').then(res => setTopProducts(res.data));

    // Connect WebSocket
    const socket = io('http://localhost:4000', {
      auth: { token }
    });

    socket.on('sale:new', (sale) => {
      // Live update
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

  if (!summary) return <div className="page">Loading dashboard...</div>;

  return (
    <div className="app-layout">
      <Sidebar />

      <div className="main-content">
        <div className="topbar">
          <div>Overview</div>
          {liveSalesCount > 0 && (
            <span className="badge badge-green" style={{animation: 'fadeIn 0.5s'}}>
              +{liveSalesCount} live sales
            </span>
          )}
        </div>

        <div className="page">
          <div className="grid-4">
            <div className="card">
              <div className="card-title">Today's Revenue</div>
              <div className="card-value">₹{parseFloat(summary.today.totalRevenue).toFixed(2)}</div>
            </div>
            <div className="card">
              <div className="card-title">Transactions Today</div>
              <div className="card-value">{summary.today.transactionCount}</div>
            </div>
          </div>

          <div className="grid-2" style={{marginTop: 24}}>
            <div className="card">
              <div className="section-header" style={{marginBottom: 12}}>
                <h3 style={{fontSize: 14, color: '#6b7280'}}>Top Products</h3>
              </div>
              <table>
                <thead>
                  <tr><th>SKU</th><th>Name</th><th>Sold</th></tr>
                </thead>
                <tbody>
                  {topProducts.map(p => (
                    <tr key={p.sku}>
                      <td><span className="badge badge-gray">{p.sku}</span></td>
                      <td>{p.name}</td>
                      <td>{p.totalQty}</td>
                    </tr>
                  ))}
                  {topProducts.length === 0 && (
                    <tr><td colSpan="3" className="empty-state" style={{padding:'20px 0'}}>No sales data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="card">
              <div className="section-header" style={{marginBottom: 12}}>
                <h3 style={{fontSize: 14, color: '#6b7280'}}>Recent Transactions</h3>
              </div>
              <table>
                <thead>
                  <tr><th>ID</th><th>Amount</th><th>Time</th></tr>
                </thead>
                <tbody>
                  {summary.recentSales.map(tx => (
                    <tr key={tx.id}>
                      <td style={{fontSize: 11, color: '#6b7280'}}>{tx.id.split('-')[0]}</td>
                      <td style={{fontWeight: 600}}>₹{parseFloat(tx.totalAmount).toFixed(2)}</td>
                      <td style={{fontSize: 12}}>{new Date(tx.createdAt).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
