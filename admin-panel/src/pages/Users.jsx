import React, { useEffect, useMemo, useState } from 'react';
import { getUsers, toggleUserPlan, removeUser } from '../services/dataAdapter';
import { PageShell, Spinner, Badge, Modal } from '../components/UI';
import { formatDate, formatNumber } from '../utils/formatters';

const PER_PAGE = 8;

export default function Users() {
  const [users, setUsers] = useState(null);
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);

  useEffect(() => { getUsers().then(setUsers); }, []);

  const filtered = useMemo(() => {
    if (!users) return [];
    let rows = users;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (u) =>
          (u.email || '').toLowerCase().includes(q) ||
          (u.displayName || '').toLowerCase().includes(q)
      );
    }
    if (planFilter !== 'all') rows = rows.filter((u) => u.plan === planFilter);
    return rows;
  }, [users, search, planFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pages);
  const rows = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  const handleToggle = async (u) => {
    await toggleUserPlan(u.id, u.plan);
    setUsers(await getUsers());
  };
  const handleDelete = async (u) => {
    if (!window.confirm(`Delete ${u.displayName || u.email}? This cannot be undone.`)) return;
    await removeUser(u.id);
    setUsers(await getUsers());
  };

  if (!users) return <Spinner />;

  return (
    <PageShell
      title="User Management"
      subtitle={`${users.length} registered users · ${users.filter((u) => u.plan === 'premium').length} premium`}
    >
      <div className="card">
        <div className="toolbar">
          <input
            className="grow"
            style={{
              background: 'var(--surface)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 10,
              padding: '10px 14px', fontSize: 14,
            }}
            placeholder="Search by email or name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <select
            value={planFilter}
            onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
            style={{
              background: 'var(--surface)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 10,
              padding: '10px 14px', fontSize: 14,
            }}
          >
            <option value="all">All plans</option>
            <option value="free">Free</option>
            <option value="premium">Premium</option>
          </select>
        </div>

        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>User</th><th>Email</th><th>Plan</th><th>Photos</th>
                <th>Credits</th><th>Joined</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
                        {(u.displayName || 'U')[0]}
                      </div>
                      <button className="btn ghost small" onClick={() => setDetail(u)} style={{ border: 'none', color: 'var(--text)' }}>
                        {u.displayName || 'Unnamed'}
                      </button>
                    </div>
                  </td>
                  <td className="muted">{u.email}</td>
                  <td>
                    <Badge tone={u.plan === 'premium' ? 'yellow' : 'gray'}>
                      {u.plan === 'premium' ? '⭐ Premium' : 'Free'}
                    </Badge>
                  </td>
                  <td>{formatNumber(u.totalPhotosTaken)}</td>
                  <td>{u.plan === 'premium' ? '∞' : (u.creditsRemaining ?? 0)}</td>
                  <td className="muted">{formatDate(u.createdAt)}</td>
                  <td>
                    <div className="btn-row">
                      <button className="btn success small" onClick={() => handleToggle(u)}>
                        {u.plan === 'premium' ? 'Downgrade' : 'Upgrade'}
                      </button>
                      <button className="btn danger small" onClick={() => handleDelete(u)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>No users match your filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="btn-row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button className="btn ghost small" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>← Prev</button>
          <span className="muted" style={{ fontSize: 13 }}>Page {safePage} of {pages}</span>
          <button className="btn ghost small" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>Next →</button>
        </div>
      </div>

      {detail && (
        <Modal title="User Details" onClose={() => setDetail(null)}>
          <div className="field"><label>User ID</label><input readOnly value={detail.uid || detail.id} /></div>
          <div className="field"><label>Name</label><input readOnly value={detail.displayName || '—'} /></div>
          <div className="field"><label>Email</label><input readOnly value={detail.email || '—'} /></div>
          <div className="field"><label>Plan</label><input readOnly value={detail.plan} /></div>
          <div className="field"><label>Photos taken</label><input readOnly value={formatNumber(detail.totalPhotosTaken)} /></div>
          <div className="field"><label>Credits remaining</label><input readOnly value={detail.plan === 'premium' ? 'Unlimited' : (detail.creditsRemaining ?? 0)} /></div>
          <div className="field"><label>Joined</label><input readOnly value={formatDate(detail.createdAt)} /></div>
        </Modal>
      )}
    </PageShell>
  );
}
