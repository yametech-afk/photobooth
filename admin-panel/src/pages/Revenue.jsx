import React, { useEffect, useState } from 'react';
import { getRevenue } from '../services/dataAdapter';
import { PageShell, StatCard, BarChart, Spinner, Badge } from '../components/UI';
import { formatPeso, formatDateTime } from '../utils/formatters';

export default function Revenue() {
  const [rev, setRev] = useState(null);

  useEffect(() => { getRevenue().then(setRev); }, []);

  if (!rev) return <Spinner />;

  return (
    <>
      <h1 className="page-title">Revenue Analytics</h1>
      <p className="page-sub">Subscription revenue across iOS, Android, and web</p>

      <div className="stats-grid">
        <StatCard title="Total Revenue" value={formatPeso(rev.totalRevenue)} icon="💰" color="#00E676" change="+15.3%" />
        <StatCard title="Last 30 Days" value={formatPeso(rev.monthlyRevenue)} icon="📈" color="#FF4DA6" change="+22%" />
        <StatCard title="Last 7 Days" value={formatPeso(rev.weeklyRevenue)} icon="📅" color="#00BCD4" change="+8%" />
        <StatCard title="Last 24 Hours" value={formatPeso(rev.dailyRevenue)} icon="⚡" color="#FFD600" />
      </div>

      <div className="grid-2 mb">
        <div className="card">
          <h3>Monthly Revenue Trend (₱)</h3>
          <BarChart labels={rev.monthLabels} values={rev.monthData} color="#00E676" />
        </div>
        <div className="card">
          <h3>Key Metrics</h3>
          {[
            ['ARPU (avg revenue / subscriber)', formatPeso(rev.arpu)],
            ['New subscribers (30d)', rev.newSubscribers],
            ['Churn rate', rev.churnRate + '%'],
          ].map(([k, v]) => (
            <div key={k} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="muted" style={{ fontSize: 12 }}>{k}</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Recent Transactions</h3>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Subscription</th><th>User</th><th>Platform</th>
                <th>Amount</th><th>Status</th><th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rev.transactions.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{(t.subscriptionId || t.id).slice(0, 16)}</td>
                  <td className="mono">{t.uid}</td>
                  <td><Badge tone="cyan">{t.platform}</Badge></td>
                  <td style={{ color: 'var(--success)', fontWeight: 700 }}>{formatPeso(t.amount)}</td>
                  <td>
                    <Badge tone={t.status === 'active' ? 'green' : 'gray'}>{t.status}</Badge>
                  </td>
                  <td className="muted">{formatDateTime(t.createdAt)}</td>
                </tr>
              ))}
              {rev.transactions.length === 0 && (
                <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>No transactions yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
