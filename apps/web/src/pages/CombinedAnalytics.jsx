import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { Win95Shell, Win95Window } from './Products';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';

const CHART_COLORS = ['#000080', '#008080', '#800000', '#808000', '#800080', '#008000', '#c0c0c0', '#404040'];

/* ── Recharts styled tooltip ── */
function Win95Tooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#ffffcc', border: '2px solid #000', padding: '4px 8px',
      fontFamily: 'var(--win-font)', fontSize: 14,
    }}>
      <div style={{fontWeight:'bold'}}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{color: p.color}}>
          {p.name}: {typeof p.value === 'number' ? `Rs.${p.value.toFixed(2)}` : p.value}
        </div>
      ))}
    </div>
  );
}

/* ── Date presets ── */
function DateRangeSelector({ startDate, endDate, onChangeStart, onChangeEnd }) {
  const setPreset = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    onChangeStart(start.toISOString().split('T')[0]);
    onChangeEnd(end.toISOString().split('T')[0]);
  };

  return (
    <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
      <button className="win95-btn" style={{minWidth:50,padding:'2px 10px',fontSize:14}} onClick={() => setPreset(0)}>Today</button>
      <button className="win95-btn" style={{minWidth:50,padding:'2px 10px',fontSize:14}} onClick={() => setPreset(7)}>7d</button>
      <button className="win95-btn" style={{minWidth:50,padding:'2px 10px',fontSize:14}} onClick={() => setPreset(30)}>30d</button>
      <button className="win95-btn" style={{minWidth:50,padding:'2px 10px',fontSize:14}} onClick={() => setPreset(90)}>90d</button>
      <div style={{width:1,height:20,background:'var(--win-dark)',margin:'0 2px'}} />
      <div className="win95-input-wrap" style={{width:130}}>
        <input type="date" value={startDate} onChange={e => onChangeStart(e.target.value)} />
      </div>
      <span style={{fontSize:14}}>to</span>
      <div className="win95-input-wrap" style={{width:130}}>
        <input type="date" value={endDate} onChange={e => onChangeEnd(e.target.value)} />
      </div>
    </div>
  );
}

/* ── Empty state ── */
function EmptyState({ message }) {
  return (
    <div style={{textAlign:'center',padding:'20px 10px',color:'#808080',fontSize:16}}>
      {message || 'No data available yet.'}
    </div>
  );
}

/* ── KPI Card ── */
function KpiCard({ label, value, subtext }) {
  return (
    <div className="win95-stat">
      <div className="win95-stat-value">{value}</div>
      <div className="win95-stat-label">{label}</div>
      {subtext && <div style={{fontSize:12,color:'#808080',marginTop:2}}>{subtext}</div>}
    </div>
  );
}

/* ════════════════════════════════════════════════════════ */
export default function CombinedAnalytics() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data states
  const [summary, setSummary] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [customers, setCustomers] = useState(null);
  const [traffic, setTraffic] = useState(null);
  const [financials, setFinancials] = useState(null);
  const [liveSalesCount, setLiveSalesCount] = useState(0);

  // Date range
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Build query string
  const qs = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    return params.toString() ? `?${params.toString()}` : '';
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const q = qs();
      const [sumRes, invRes, custRes, trafRes, finRes] = await Promise.all([
        api.get(`/analytics/combined/summary${q}`),
        api.get(`/analytics/combined/inventory${q}`),
        api.get(`/analytics/combined/customers${q}`),
        api.get(`/analytics/combined/traffic${q}`),
        api.get(`/analytics/combined/financials${q}`),
      ]);
      setSummary(sumRes.data);
      setInventory(invRes.data);
      setCustomers(custRes.data);
      setTraffic(trafRes.data);
      setFinancials(finRes.data);
      setForbidden(false);
    } catch (err) {
      if (err.response?.status === 403) {
        setForbidden(true);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();

    // Socket.io for live updates
    const backendHost = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '')
      : (window.location.hostname === 'localhost' ? (window.location.port === '5173' ? 'http://localhost:4000' : window.location.origin) : window.location.origin);

    const socket = io(backendHost, { auth: { token }, path: '/socket.io/' });
    socket.on('sale:new', (sale) => {
      setLiveSalesCount(prev => prev + 1);
      // Update summary live
      setSummary(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          today: {
            ...prev.today,
            totalRevenue: prev.today.totalRevenue + parseFloat(sale.totalAmount),
            transactionCount: prev.today.transactionCount + 1,
          },
        };
      });
    });

    return () => socket.disconnect();
  }, [token]);

  // Refetch on date change
  useEffect(() => {
    if (!loading) fetchAll();
  }, [startDate, endDate]);

  // ─── 403: Not enough outlets ───
  if (forbidden) {
    return (
      <Win95Shell activeWindow="Combined Analytics">
        <Win95Window icon="📈" title="Combined Analytics — Billu POS" statusPanels={['Access Denied']}>
          <div style={{padding:30,textAlign:'center'}}>
            <div style={{fontSize:48,marginBottom:12}}>🔒</div>
            <div style={{fontSize:20,fontWeight:'bold',marginBottom:8}}>Combined Dashboard Locked</div>
            <div style={{fontSize:16,color:'#808080',marginBottom:20}}>
              Combined analytics requires more than one active outlet.<br/>
              Add another shop/outlet to unlock this dashboard.
            </div>
            <button className="win95-btn win95-btn-primary" onClick={() => navigate('/outlets')}>
              🏪 Go to Outlets
            </button>
          </div>
        </Win95Window>
      </Win95Shell>
    );
  }

  if (loading) {
    return (
      <Win95Shell activeWindow="Combined Analytics">
        <Win95Window icon="📈" title="Combined Analytics — Billu POS" statusPanels={['Loading...']}>
          <div style={{padding:40,textAlign:'center'}}>Loading analytics data...</div>
        </Win95Window>
      </Win95Shell>
    );
  }

  return (
    <Win95Shell activeWindow="Combined Analytics">
      <Win95Window
        icon="📈"
        title="Combined Analytics — Billu POS"
        menuItems={[
          { label: <><u>F</u>ile</> },
          { label: <><u>V</u>iew</> },
          { label: <><u>H</u>elp</> },
        ]}
        statusPanels={[
          `${summary?.activeOutlets || 0} active outlets`,
          liveSalesCount > 0 ? `+${liveSalesCount} live sales` : 'Idle',
          `User: ${user?.name || 'admin'}`,
        ]}
      >
        {/* ── Date Range ── */}
        <div style={{marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <DateRangeSelector
            startDate={startDate} endDate={endDate}
            onChangeStart={setStartDate} onChangeEnd={setEndDate}
          />
          <button className="win95-btn" style={{padding:'2px 10px',fontSize:14}} onClick={fetchAll}>🔄 Refresh</button>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:10,overflow:'auto',flex:1,minHeight:0}}>

          {/* ═══ KPI Cards ═══ */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8}}>
            <KpiCard label="Today's Revenue" value={`Rs.${(summary?.today?.totalRevenue || 0).toFixed(2)}`} />
            <KpiCard label="Today's Transactions" value={summary?.today?.transactionCount || 0} />
            <KpiCard label="Avg. Order Value" value={`Rs.${(summary?.period?.avgOrderValue || 0).toFixed(2)}`} />
            <KpiCard label="Active Outlets" value={summary?.activeOutlets || 0} />
          </div>

          {/* ═══ Two-Column: Outlet Comparison + Real-time ═══ */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>

            {/* Outlet Revenue Comparison */}
            <div>
              <div className="win95-section-header">► Outlet Revenue Comparison</div>
              <div className="win95-sunken" style={{padding:8,minHeight:200}}>
                {summary?.outletBreakdown?.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={summary.outletBreakdown}>
                      <XAxis dataKey="outletName" tick={{fontSize:12,fontFamily:'VT323'}} />
                      <YAxis tick={{fontSize:11,fontFamily:'VT323'}} />
                      <Tooltip content={<Win95Tooltip />} />
                      <Bar dataKey="totalAmount" name="Revenue" fill="#000080" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyState message="No outlet data yet." />}
              </div>
            </div>

            {/* Real-time Sales */}
            <div>
              <div className="win95-section-header">► Recent Transactions {liveSalesCount > 0 && <span style={{color:'#00ff00'}}> ● LIVE</span>}</div>
              <div className="win95-sunken" style={{padding:0,maxHeight:220,overflow:'auto'}}>
                <table>
                  <thead>
                    <tr><th>ID</th><th>Outlet</th><th style={{textAlign:'right'}}>Amount</th><th>Time</th></tr>
                  </thead>
                  <tbody>
                    {summary?.recentSales?.map(tx => (
                      <tr key={tx.id}>
                        <td style={{fontSize:14}}>{tx.id.split('-')[0]}</td>
                        <td style={{fontSize:14}}>{tx.outletName}</td>
                        <td style={{textAlign:'right',fontWeight:'bold'}}>Rs.{tx.totalAmount.toFixed(2)}</td>
                        <td style={{fontSize:14}}>{new Date(tx.createdAt).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                    {(!summary?.recentSales || summary.recentSales.length === 0) && (
                      <tr><td colSpan="4" style={{textAlign:'center',padding:16,color:'#808080'}}>No transactions yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ═══ Two-Column: Inventory + Financials ═══ */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>

            {/* Inventory Turnover */}
            <div>
              <div className="win95-section-header">► Inventory Turnover</div>
              <div className="win95-sunken" style={{padding:0,maxHeight:200,overflow:'auto'}}>
                <table>
                  <thead>
                    <tr><th>SKU</th><th>Product</th><th style={{textAlign:'right'}}>Sold</th><th style={{textAlign:'right'}}>Revenue</th></tr>
                  </thead>
                  <tbody>
                    {inventory?.fastMoving?.map(p => (
                      <tr key={p.sku}>
                        <td><span className="win95-badge">{p.sku}</span></td>
                        <td>{p.name}</td>
                        <td style={{textAlign:'right',fontWeight:'bold'}}>{p.totalQtySold}</td>
                        <td style={{textAlign:'right'}}>Rs.{p.totalRevenue.toFixed(2)}</td>
                      </tr>
                    ))}
                    {(!inventory?.fastMoving || inventory.fastMoving.length === 0) && (
                      <tr><td colSpan="4" style={{textAlign:'center',padding:12,color:'#808080'}}>No sales data yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Low Stock Alert */}
              {inventory?.lowStock?.length > 0 && (
                <div style={{marginTop:8}}>
                  <div className="win95-section-header" style={{background:'#800000'}}>⚠️ Low Stock Alert</div>
                  <div className="win95-sunken" style={{padding:0,maxHeight:120,overflow:'auto'}}>
                    <table>
                      <thead>
                        <tr><th>Product</th><th>Outlet</th><th style={{textAlign:'right'}}>Stock</th></tr>
                      </thead>
                      <tbody>
                        {inventory.lowStock.slice(0, 5).map((item, i) => (
                          <tr key={i}>
                            <td>{item.name}</td>
                            <td>{item.outletName}</td>
                            <td style={{textAlign:'right',fontWeight:'bold',color:'#cc0000'}}>{item.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Aggregated Financials */}
            <div>
              <div className="win95-section-header">► Aggregated Financials</div>
              <div className="win95-raised" style={{padding:10}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,fontSize:16}}>
                  <span style={{fontWeight:'bold'}}>Gross Sales:</span>
                  <span style={{textAlign:'right'}}>Rs.{(financials?.grossSales || 0).toFixed(2)}</span>
                  <span style={{fontWeight:'bold'}}>Discounts:</span>
                  <span style={{textAlign:'right',color:'#cc0000'}}>−Rs.{(financials?.totalDiscounts || 0).toFixed(2)}</span>
                  <span style={{fontWeight:'bold'}}>Taxes:</span>
                  <span style={{textAlign:'right'}}>Rs.{(financials?.totalTaxes || 0).toFixed(2)}</span>
                  <span style={{fontWeight:'bold',fontSize:18}}>Net Sales:</span>
                  <span style={{textAlign:'right',fontWeight:'bold',fontSize:18,color:'#000080'}}>Rs.{(financials?.netSales || 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Method Breakdown */}
              <div style={{marginTop:8}}>
                <div className="win95-section-header">► Payment Methods</div>
                <div className="win95-sunken" style={{padding:8,minHeight:140}}>
                  {financials?.paymentBreakdown?.length > 0 ? (
                    <ResponsiveContainer width="100%" height={130}>
                      <PieChart>
                        <Pie
                          data={financials.paymentBreakdown.map(p => ({ name: p.method.toUpperCase(), value: p.amount }))}
                          cx="50%" cy="50%" outerRadius={50} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                          dataKey="value" fontSize={12} fontFamily="VT323"
                        >
                          {financials.paymentBreakdown.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<Win95Tooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <EmptyState message="No payment data yet." />}
                </div>
              </div>
            </div>
          </div>

          {/* ═══ Two-Column: Customer Behavior + Traffic ═══ */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>

            {/* Customer Behavior */}
            <div>
              <div className="win95-section-header">► Customer Behavior</div>
              <div className="win95-raised" style={{padding:10}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,fontSize:16}}>
                  <span style={{fontWeight:'bold'}}>Avg Basket Size:</span>
                  <span style={{textAlign:'right'}}>{customers?.avgBasketSize || 0} items</span>
                  <span style={{fontWeight:'bold'}}>Avg Order Value:</span>
                  <span style={{textAlign:'right'}}>Rs.{(customers?.avgOrderValue || 0).toFixed(2)}</span>
                  <span style={{fontWeight:'bold'}}>Total Transactions:</span>
                  <span style={{textAlign:'right'}}>{customers?.totalTransactions || 0}</span>
                  <span style={{fontWeight:'bold'}}>Known Customers:</span>
                  <span style={{textAlign:'right'}}>{customers?.totalCustomers || 0}</span>
                  <span style={{fontWeight:'bold'}}>Repeat Customers:</span>
                  <span style={{textAlign:'right'}}>{customers?.repeatCustomers || 0}</span>
                </div>
                {!customers?.customerDataAvailable && (
                  <div style={{
                    marginTop:8, padding:'4px 8px', fontSize:14,
                    background:'#ffffcc', border:'1px solid #808080',
                  }}>
                    💡 Customer tracking is not yet active. Metrics are transaction-based only.
                  </div>
                )}
              </div>
            </div>

            {/* Traffic & Acquisition */}
            <div>
              <div className="win95-section-header">► Traffic & Acquisition</div>
              <div className="win95-raised" style={{padding:10}}>
                {traffic?.acquisitionSources?.length > 0 ? (
                  <div className="win95-sunken" style={{padding:0}}>
                    <table>
                      <thead>
                        <tr><th>Source</th><th style={{textAlign:'right'}}>Count</th><th style={{textAlign:'right'}}>%</th></tr>
                      </thead>
                      <tbody>
                        {traffic.acquisitionSources.map(s => (
                          <tr key={s.source}>
                            <td style={{textTransform:'capitalize'}}>{s.source.replace(/_/g, ' ')}</td>
                            <td style={{textAlign:'right'}}>{s.count}</td>
                            <td style={{textAlign:'right'}}>{s.percentage}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{
                    padding:'12px 8px', fontSize:14, color:'#808080', textAlign:'center',
                  }}>
                    No acquisition events recorded yet.<br/>
                    Traffic data will appear once acquisition tracking is active.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ Outlet-wise Revenue Table ═══ */}
          <div>
            <div className="win95-section-header">► Outlet-wise Revenue Breakdown</div>
            <div className="win95-sunken" style={{padding:0}}>
              <table>
                <thead>
                  <tr>
                    <th>Outlet</th>
                    <th style={{textAlign:'right'}}>Revenue</th>
                    <th style={{textAlign:'right'}}>Transactions</th>
                    <th style={{textAlign:'right'}}>Avg. Order</th>
                  </tr>
                </thead>
                <tbody>
                  {financials?.outletRevenue?.map(o => (
                    <tr key={o.outletId}>
                      <td style={{fontWeight:'bold'}}>{o.outletName}</td>
                      <td style={{textAlign:'right'}}>Rs.{o.revenue.toFixed(2)}</td>
                      <td style={{textAlign:'right'}}>{o.transactions}</td>
                      <td style={{textAlign:'right'}}>Rs.{o.transactions > 0 ? (o.revenue / o.transactions).toFixed(2) : '0.00'}</td>
                    </tr>
                  ))}
                  {(!financials?.outletRevenue || financials.outletRevenue.length === 0) && (
                    <tr><td colSpan="4" style={{textAlign:'center',padding:16,color:'#808080'}}>No revenue data yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══ Revenue Trend Chart ═══ */}
          {financials?.trend?.length > 0 && (
            <div>
              <div className="win95-section-header">► Revenue Trend</div>
              <div className="win95-sunken" style={{padding:8}}>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={[...financials.trend].reverse()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#c0c0c0" />
                    <XAxis
                      dataKey="date"
                      tick={{fontSize:11,fontFamily:'VT323'}}
                      tickFormatter={v => {
                        const d = new Date(v);
                        return `${d.getDate()}/${d.getMonth()+1}`;
                      }}
                    />
                    <YAxis tick={{fontSize:11,fontFamily:'VT323'}} />
                    <Tooltip content={<Win95Tooltip />} />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#000080" strokeWidth={2} dot={{r:3}} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>
      </Win95Window>
    </Win95Shell>
  );
}
