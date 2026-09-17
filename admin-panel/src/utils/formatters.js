export const formatPeso = (n) =>
  '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 });

export const formatNumber = (n) => Number(n || 0).toLocaleString('en-US');

export const formatDate = (d) => {
  if (!d) return '—';
  const date = typeof d?.toDate === 'function' ? d.toDate() : new Date(d);
  return isNaN(date) ? '—' : date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
};

export const formatDateTime = (d) => {
  if (!d) return '—';
  const date = typeof d?.toDate === 'function' ? d.toDate() : new Date(d);
  return isNaN(date) ? '—' : date.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};
