import React from 'react';
import { Link } from 'react-router-dom';

const ICONS = {
  dashboard: '📊', users: '👥', photos: '🖼️', filters: '🎨',
  revenue: '💰', events: '📅', bookings: '🗓️', notifications: '🔔',
  settings: '⚙️',
};

export function StatCard({ title, value, icon, color, change }) {
  return (
    <div className="card stat-card">
      <div className="stat-ico" style={{ background: `${color}22`, color }}>
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-title">{title}</div>
      {change && <div className="stat-change">▲ {change}</div>}
    </div>
  );
}

export function BarChart({ labels, values, color = '#FF4DA6', height = 220 }) {
  const max = Math.max(...values, 1);
  return (
    <div className="barchart" style={{ height }}>
      {labels.map((label, i) => (
        <div className="barchart-col" key={`${label}-${i}`}>
          <div className="barchart-bar-wrap" title={`${label}: ${values[i]}`}>
            <div
              className="barchart-bar"
              style={{
                height: `${(values[i] / max) * 100}%`,
                background: `linear-gradient(180deg, ${color}, ${color}66)`,
              }}
            />
          </div>
          <div className="barchart-label">{label}</div>
        </div>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="spinner-wrap">
      <div className="spinner" />
    </div>
  );
}

export const Badge = ({ tone = 'gray', children }) => (
  <span className={`badge ${tone}`}>{children}</span>
);

export function SideNav() {
  const items = [
    ['Dashboard', 'dashboard', '/dashboard'],
    ['Users', 'users', '/users'],
    ['Photos', 'photos', '/photos'],
    ['AI Filters', 'filters', '/filters'],
    ['Revenue', 'revenue', '/revenue'],
    ['Events', 'events', '/events'],
    ['Bookings', 'bookings', '/bookings'],
    ['Notifications', 'notifications', '/notifications'],
    ['Settings', 'settings', '/settings'],
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">📸 Photobooth Admin</div>
      <nav className="side-nav">
        {items.map(([label, icon, path]) => (
          <Link key={path} to={path} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="ico">{ICONS[icon]}</span> {label}
          </Link>
        ))}
      </nav>
      <div className="side-foot">Photobooth Platform v1.0</div>
    </aside>
  );
}

export function PageShell({ title, subtitle, toolbar, children }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-sub">{subtitle}</p>
        </div>
        {toolbar}
      </div>
      {children}
    </>
  );
}
