import React, { useEffect, useState } from 'react';
import { getNotifications, saveNotification } from '../services/dataAdapter';
import { PageShell, Spinner, Badge, Modal } from '../components/UI';
import { formatDateTime } from '../utils/formatters';

const EMPTY = {
  title: '', body: '', audience: 'all-users', type: 'promo',
};

export default function Notifications() {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => { getNotifications().then(setRows); }, []);

  const handleSend = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setError('Title and message are required.');
      return;
    }
    await saveNotification(form);
    setOpen(false);
    setForm(EMPTY);
    setError('');
    setRows(await getNotifications());
  };

  if (!rows) return <Spinner />;

  return (
    <PageShell
      title="Notifications"
      subtitle="Admin alerts and push campaigns sent to app users"
      toolbar={<button className="btn" onClick={() => setOpen(true)}>＋ New Push Notification</button>}
    >
      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Title</th><th>Message</th><th>Audience</th><th>Type</th><th>Status</th><th>Sent</th></tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id}>
                  <td><strong>{n.title}</strong></td>
                  <td className="muted" style={{ maxWidth: 340 }}>{n.body}</td>
                  <td><Badge tone="pink">{n.audience}</Badge></td>
                  <td className="muted">{n.type}</td>
                  <td><Badge tone="green">{n.status}</Badge></td>
                  <td className="muted">{formatDateTime(n.createdAt)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>No notifications sent yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <Modal title="New Push Notification" onClose={() => setOpen(false)}>
          {error && <div className="error-text">{error}</div>}
          <div className="field">
            <label>Title *</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="New Christmas filters are here! 🎄" />
          </div>
          <div className="field">
            <label>Message *</label>
            <textarea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Try the new seasonal AI filters — free this week only." />
          </div>
          <div className="field">
            <label>Audience</label>
            <select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
              <option value="all-users">All users</option>
              <option value="free-users">Free users only</option>
              <option value="premium-users">Premium users only</option>
              <option value="admins">Admins only</option>
            </select>
          </div>
          <div className="field">
            <label>Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="promo">Promo</option>
              <option value="announcement">Announcement</option>
              <option value="system">System</option>
            </select>
          </div>
          <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" onClick={handleSend}>Send via FCM</button>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
