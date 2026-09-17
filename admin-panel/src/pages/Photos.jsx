import React, { useEffect, useMemo, useState } from 'react';
import { getPhotos, moderatePhoto, removePhoto } from '../services/dataAdapter';
import { PageShell, Spinner, Badge } from '../components/UI';
import { formatDateTime } from '../utils/formatters';

export default function Photos() {
  const [photos, setPhotos] = useState(null);
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [filterId, setFilterId] = useState('all');

  useEffect(() => { getPhotos().then(setPhotos); }, []);

  const filterOptions = useMemo(
    () => [...new Set((photos || []).map((p) => p.filterId).filter(Boolean))],
    [photos]
  );

  const filtered = useMemo(() => {
    if (!photos) return [];
    let rows = photos;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (p) =>
          (p.ownerName || '').toLowerCase().includes(q) ||
          (p.uid || '').toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q)
      );
    }
    if (visibility !== 'all') rows = rows.filter((p) => (visibility === 'public' ? p.isPublic : !p.isPublic));
    if (filterId !== 'all') rows = rows.filter((p) => p.filterId === filterId);
    return rows;
  }, [photos, search, visibility, filterId]);

  const act = async (id, action) => {
    await moderatePhoto(id, action);
    setPhotos(await getPhotos());
  };
  const del = async (p) => {
    if (!window.confirm('Permanently delete this photo?')) return;
    await removePhoto(p.id);
    setPhotos(await getPhotos());
  };

  if (!photos) return <Spinner />;

  const selectStyle = {
    background: 'var(--surface)', color: 'var(--text)',
    border: '1px solid var(--border)', borderRadius: 10,
    padding: '10px 14px', fontSize: 14,
  };

  return (
    <PageShell
      title="Photos & Moderation"
      subtitle={`${filtered.length} of ${photos.length} photos shown`}
    >
      <div className="card mb">
        <div className="toolbar">
          <input
            className="grow"
            style={{ ...selectStyle, width: 'auto' }}
            placeholder="Search owner, uid or photo id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select style={selectStyle} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="all">All visibility</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </select>
          <select style={selectStyle} value={filterId} onChange={(e) => setFilterId(e.target.value)}>
            <option value="all">All filters</option>
            {filterOptions.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>

      <div className="photo-grid">
        {filtered.map((p) => (
          <div className="card" key={p.id}>
            <div className="photo-thumb" style={{ background: 'linear-gradient(135deg, #FF4DA6, #00BCD4)' }}>
              {p.filterId || 'no filter'}
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{p.ownerName || p.uid}</strong>
                <Badge tone={p.isPublic ? 'green' : 'gray'}>{p.isPublic ? 'Public' : 'Private'}</Badge>
              </div>
              <div className="muted" style={{ fontSize: 11, margin: '6px 0' }}>
                ♥ {p.likes || 0} · ↗ {p.shares || 0} · {formatDateTime(p.createdAt)}
              </div>
              <div className="btn-row" style={{ marginTop: 8 }}>
                {p.isPublic
                  ? <button className="btn ghost small" onClick={() => act(p.id, 'hide')}>Hide</button>
                  : <button className="btn success small" onClick={() => act(p.id, 'approve')}>Approve</button>}
                <button className="btn danger small" onClick={() => del(p)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="card muted" style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40 }}>
            No photos match your filters.
          </div>
        )}
      </div>
    </PageShell>
  );
}
