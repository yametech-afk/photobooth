import React, { useEffect, useState } from 'react';
import { getDashboardData } from '../services/dataAdapter';
import { StatCard, BarChart, Spinner, Badge } from '../components/UI';
import { formatPeso, formatNumber } from '../utils/formatters';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboardData()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="hint">Failed to load dashboard: {error}</div>;
  if (!data) return <Spinner />;

  const { stats, chart, topFilters, recentPhotos } = data;

  return (
    <>
      <h1 className="page-title">Dashboard Overview</h1>
      <p className="page-sub">Real-time insights about your photobooth platform</p>

      <div className="stats-grid">
        <StatCard title="Total Users" value={formatNumber(stats.totalUsers)} icon="👥" color="#FF4DA6" change="+12.5%" />
        <StatCard title="Premium Users" value={formatNumber(stats.premiumUsers)} icon="⭐" color="#FFD600" change="+8.2%" />
        <StatCard title="Photos Taken" value={formatNumber(stats.totalPhotos)} icon="📸" color="#00BCD4" change="+24%" />
        <StatCard title="Total Revenue" value={formatPeso(stats.totalRevenue)} icon="💰" color="#00E676" change="+18.7%" />
        <StatCard title="Active Events" value={stats.activeEvents} icon="📅" color="#7B61FF" />
        <StatCard title="Avg Rating" value={stats.avgRating} icon="📈" color="#FF9800" />
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Activity — Last 7 Days</h3>
          <BarChart labels={chart.labels} values={chart.photosPerDay} color="#FF4DA6" />
          <h3 style={{ marginTop: 24 }}>Revenue — Last 7 Days (₱)</h3>
          <BarChart labels={chart.labels} values={chart.revenuePerDay} color="#00BCD4" />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="card">
            <h3>Top AI Filters</h3>
            {topFilters.map((f) => (
              <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <Badge tone="pink">{f.name}</Badge>
                <strong>{f.count} photos</strong>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>Recent Photos</h3>
            {recentPhotos.slice(0, 5).map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  background: 'linear-gradient(135deg, #FF4DA6, #00BCD4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                }}>🖼️</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13 }}>{p.ownerName || p.uid}</div>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {p.filterId} · {String(p.createdAt || '').slice(0, 10)}
                  </div>
                </div>
                <Badge tone={p.isPublic ? 'green' : 'gray'}>{p.isPublic ? 'Public' : 'Private'}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
