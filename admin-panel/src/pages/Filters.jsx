import React, { useEffect, useState } from 'react';
import { getFilters, saveFilter, removeFilter } from '../services/dataAdapter';
import { PageShell, Spinner, Badge, Modal } from '../components/UI';
import { formatPeso } from '../utils/formatters';

const EMPTY = {
  name: '', description: '', prompt: '',
  isPremium: false, price: 0, category: 'basic', color: '#FF4DA6',
};

export default function Filters() {
  const [filters, setFilters] = useState(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => { getFilters().then(setFilters); }, []);

  const openNew = () => { setEditingId(null); setForm(EMPTY); setError(''); setOpen(true); };
  const openEdit = (f) => {
    setEditingId(f.id);
    setForm({
      name: f.name || '', description: f.description || '', prompt: f.prompt || '',
      isPremium: !!f.isPremium, price: f.price || 0,
      category: f.category || 'basic', color: f.color || '#FF4DA6',
    });
    setError(''); setOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.prompt.trim()) {
      setError('Name and AI prompt are required.');
      return;
    }
    if (form.isPremium && Number(form.price) <= 0) {
      setError('Premium filters need a price greater than 0.');
      return;
    }
    await saveFilter(
      { ...form, price: Number(form.price) || 0 },
      editingId
    );
    setOpen(false);
    setFilters(await getFilters());
  };

  const handleDelete = async (f) => {
    if (!window.confirm(`Delete filter "${f.name}"?`)) return;
    await removeFilter(f.id);
    setFilters(await getFilters());
  };

  if (!filters) return <Spinner />;

  return (
    <PageShell
      title="AI Filters"
      subtitle={`${filters.length} filters configured · ${filters.filter((f) => f.isPremium).length} premium`}
      toolbar={<button className="btn" onClick={openNew}>＋ New Filter</button>}
    >
      <div className="filter-grid">
        {filters.map((f) => (
          <div className="card" key={f.id}>
            <div className="photo-thumb" style={{ background: `linear-gradient(135deg, ${f.color || '#FF4DA6'}, #00BCD4)` }}>
              {f.name}
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <strong>{f.name}</strong>
                {f.isPremium
                  ? <Badge tone="yellow">⭐ {formatPeso(f.price)}</Badge>
                  : <Badge tone="cyan">Free</Badge>}
              </div>
              <p className="muted" style={{ fontSize: 13, margin: '6px 0' }}>{f.description}</p>
              <p className="mono" style={{ margin: '6px 0 10px' }}>
                prompt: {f.prompt?.slice(0, 60)}{f.prompt?.length > 60 ? '…' : ''}
              </p>
              <div className="btn-row">
                <Badge tone="gray">{f.category}</Badge>
                <span style={{ flex: 1 }} />
                <button className="btn ghost small" onClick={() => openEdit(f)}>Edit</button>
                <button className="btn danger small" onClick={() => handleDelete(f)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <Modal title={editingId ? 'Edit Filter' : 'New Filter'} onClose={() => setOpen(false)}>
          {error && <div className="error-text">{error}</div>}
          <div className="field">
            <label>Name *</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Anime Dream" />
          </div>
          <div className="field">
            <label>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Short description shown in-app" />
          </div>
          <div className="field">
            <label>AI Prompt (Stable Diffusion) *</label>
            <textarea rows={3} value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} placeholder="anime style, vibrant colors, highly detailed" />
          </div>
          <div className="field">
            <label>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="basic">basic</option>
              <option value="artistic">artistic</option>
              <option value="premium">premium</option>
              <option value="seasonal">seasonal</option>
            </select>
          </div>
          <div className="field">
            <label>Preview color</label>
            <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ height: 42 }} />
          </div>
          <div className="field checkbox-row">
            <input
              type="checkbox" id="isPremium" checked={form.isPremium}
              onChange={(e) => setForm({ ...form, isPremium: e.target.checked })}
            />
            <label htmlFor="isPremium" style={{ margin: 0 }}>Premium filter (paid unlock)</label>
          </div>
          {form.isPremium && (
            <div className="field">
              <label>Price (₱)</label>
              <input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
          )}
          <div className="btn-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn" onClick={handleSave}>Save Filter</button>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
