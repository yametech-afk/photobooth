import React, { useEffect, useMemo, useState } from 'react';
import { getBookings, setBookingStatus } from '../services/dataAdapter';
import { PageShell, Spinner, Badge } from '../components/UI';
import { formatDate, formatPeso } from '../utils/formatters';

const STATUS_TONE = {
  confirmed: 'green', pending: 'yellow', completed: 'cyan', cancelled: 'red',
};

export default function Bookings() {
  const [bookings, setBookings] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { getBookings().then(setBookings); }, []);

  const filtered = useMemo(() => {
    if (!bookings) return [];
    return statusFilter === 'all'
      ? bookings
      : bookings.filter((b) => b.status === statusFilter);
  }, [bookings, statusFilter]);

  const setStatus = async (b, status) => {
    await setBookingStatus(b.id, status);
    setBookings(await getBookings());
  };

  if (!bookings) return <Spinner />;

  const revenuePipeline = bookings
    .filter((b) => b.status !== 'cancelled')
    .reduce((s, b) => s + (b.amount || 0), 0);

  return (
    <PageShell
      title="Bookings"
      subtitle={`${bookings.length} bookings · ${formatPeso(revenuePipeline)} total booking value`}
      toolbar={
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            background: 'var(--surface)', color: 'var(--text)',
            border: '1px solid var(--border)', borderRadius: 10,
            padding: '10px 14px', fontSize: 14,
          }}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      }
    >
      <div className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Customer</th><th>Type</th><th>Package</th><th>Event date</th>
                <th>Amount</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.customerName}</strong>
                    <div className="muted mono">{b.eventId ? `event: ${b.eventId}` : 'no event linked'}</div>
                  </td>
                  <td><Badge tone="pink">{b.eventType}</Badge></td>
                  <td className="muted">{b.packageType}</td>
                  <td className="muted">{formatDate(b.eventDate)}</td>
                  <td style={{ fontWeight: 700 }}>{formatPeso(b.amount)}</td>
                  <td><Badge tone={STATUS_TONE[b.status] || 'gray'}>{b.status}</Badge></td>
                  <td>
                    <div className="btn-row">
                      {b.status === 'pending' && (
                        <>
                          <button className="btn success small" onClick={() => setStatus(b, 'confirmed')}>Confirm</button>
                          <button className="btn danger small" onClick={() => setStatus(b, 'cancelled')}>Cancel</button>
                        </>
                      )}
                      {b.status === 'confirmed' && (
                        <button className="btn small" onClick={() => setStatus(b, 'completed')}>Mark completed</button>
                      )}
                      {b.status === 'completed' && <span className="muted" style={{ fontSize: 12 }}>Done ✓</span>}
                      {b.status === 'cancelled' && (
                        <button className="btn ghost small" onClick={() => setStatus(b, 'pending')}>Restore</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 30 }}>No bookings with this status.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageShell>
  );
}
