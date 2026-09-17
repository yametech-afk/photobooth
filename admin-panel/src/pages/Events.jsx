import React, { useEffect, useState } from 'react';
import { getEvents, saveEvent, removeEvent } from '../services/dataAdapter';
import { PageShell, Spinner, Badge, Modal } from '../components/UI';
import { formatDate, formatNumber } from '../utils/formatters';

const EMPTY = {
  title: '', organizerId: '', packageType: 'birthday',
  eventDate: '', status: 'draft',
};

const STATUS_TONE = { published: 'green', draft: 'gray', ended: 'red' };

export default function Events() {
  const [events, setEvents] = useState(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => { getEvents().then(setEvents); }, []);

  const openNew = () => { setEditingId(null); setForm(EMPTY); setError(''); setOpen(true); };
  const openEdit = (e) => {
    setEditingId(e.id);
    setForm({
      title: e.title || '', organizerId: e.organizerId || '',
      packageType: e.packageType || 'birthday',
      eventDate: String(e.eventDate || '').slice(0, 10),
      status: e.status || 'draft',
    });
    setError(''); setOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Event title is required.'); return; }
    await saveEvent(form, editingId);
    setOpen(false);
    setEvents(await getEvents());
  };

  const handleDelete = async (e) => {
    if (!window.confirm(`Delete event "${e.title}"?`)) return;
    await removeEvent(e.id);
    setEvents(await getEvents());
  };

  if (!events) return <Spinner />;

  return (
    <PageShell
      title="Events"
      subtitle={`${events.length} events · ${events.filter((e) => e.status === 'published').length} published`}
      toolbar={<button className="btn" onClick={openNew}>＋ New Event</button>}
    >
      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Event</th><th>Package</th><th>Date</th>
                <th>Photos</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>
                    <strong>{e.title}</strong>
                    <div className="muted mono">organizer: {e.organizerId}</div>
                  </td>
                  <td><Badge tone="pink">{e.packageType}</Badge></td>
                  <td className="muted">{formatDate(e.eventDate)}</td>
                  <td>{formatNumber(e.photoCount)}</td>
                  <td><Badge tone={STATUS_TONE[e.status] || 'gray'}>{e.status}</Badge></td>
                  <td>
                    <div className="btn-row">
                      <button className="btn ghost small" onClick={() => openEdit(e)}>Edit</button>
                      <button className="btn danger small" onClick={() => handleDelete(e)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 30 }}>No events yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <Modal title={editingId ? 'Edit Event' : 'New Event'} onClose={() => setOpen(false)}>
          {error && <div className="error-text">{error}</div>}
          <div className="field">
            <label>Title *</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Wedding — Santos & Reyes" />
          </div>
          <div className="field">
            <label>Organizer UID</label>
            <input value={form.organizerId} onChange={(e) => setForm({ ...form, organizerId: e.target.value })} placeholder="u1" />
          </div>
          <div className="field">
            <label>Package type</label>
            <select value={form.packageType} onChange={(e) => setForm({ ...form, packageType: e.target.value })}>
              <option value="birthday">birthday</option>
              <option value="wedding">wedding</option>
              <option value="corporate">corporate</option>
              <option value="kiosk">kiosk</option>
            </select>
          </div>
          <div className="field">
            <label>Event date</label>
            <input type="date" value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="ended">ended</option>
            </select>
          </div>
          <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" onClick={handleSave}>Save Event</button>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
