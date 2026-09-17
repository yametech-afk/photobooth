/** Small, dependency-free helpers shared across the module. */

let idCounter = 0;

/** Collision-resistant-enough id for local queue/selection keys (not a secret). */
export function localId(prefix = 'job'): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

/**
 * Idempotency key for the upload protocol. The backend stores
 * `idempotencyKeys/{key}` with a 24h TTL, so a retried upload never double-charges.
 */
export function makeIdempotencyKey(uid: string, uri: string, salt?: string): string {
  const tail = uri.split('/').pop() ?? uri;
  return `${uid}:upload:${tail}:${salt ?? Math.random().toString(36).slice(2, 10)}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function formatRelativeTime(input: number | Date | null | undefined): string {
  if (!input) return '—';
  const ms = typeof input === 'number' ? input : input.getTime();
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'ngayon lang';
  if (mins < 60) return `${mins} min ang nakalipas`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} oras ang nakalipas`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} araw ang nakalipas`;
  return new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Bottom text stamped on a strip, e.g. "16 SEP 2026". */
export function formatDateStamp(date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = date
    .toLocaleDateString('en-US', { month: 'short' })
    .toUpperCase();
  return `${day} ${month} ${date.getFullYear()}`;
}

export function humanStatus(status: string): string {
  switch (status) {
    case 'idle':
      return 'Naghihintay';
    case 'preparing':
      return 'Inihahanda';
    case 'uploading':
      return 'Ina-upload';
    case 'finalizing':
      return 'Kinukumpirma';
    case 'saving':
      return 'Sine-save';
    case 'done':
      return 'Tapos';
    case 'error':
      return 'May error';
    case 'canceled':
      return 'Kinansela';
    default:
      return status;
  }
}

export function pct(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}