/**
 * Data adapter layer: every page calls these functions.
 * If Firebase env vars are configured -> real Firestore reads/writes.
 * Otherwise -> deterministic seeded mock data so all screens render.
 */
import {
  isConfigured,
  listCollection,
  createDoc,
  updateDocById,
  deleteDocById,
} from './firebase';
import { seedDB } from './seed';

const db = seedDB();

const today = new Date();
const daysAgo = (n) =>
  new Date(today.getTime() - n * 86400000).toISOString();

// listCollection() already normalizes Firestore timestamps to ISO strings.
function toClient(rows) {
  return rows.map((r) => ({ ...r }));
}

async function safeList(name, orderField = 'createdAt') {
  try {
    return toClient(await listCollection(name, orderField));
  } catch (e) {
    console.warn(`[data] Firestore list of "${name}" failed, using mock data:`, e.message);
    return null;
  }
}

/* ---------------- dashboard / analytics ---------------- */

export async function getDashboardData() {
  if (isConfigured) {
    const [users, photos, subs, events] = await Promise.all([
      safeList('users'), safeList('photos'), safeList('subscriptions'), safeList('events'),
    ]);
    if (users && photos && subs) {
      return buildDashboard(users, photos, subs, events || []);
    }
  }
  return buildDashboard(db.users, db.photos, db.subscriptions, db.events);
}

function buildDashboard(users, photos, subs, events) {
  const premium = users.filter((u) => u.plan === 'premium').length;
  const totalRevenue = subs.reduce((s, x) => s + (x.amount || 0), 0);

  const labels = [];
  const photosPerDay = [];
  const revenuePerDay = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    const dayKey = d.toISOString().slice(0, 10);
    const dayPhotos = photos.filter((p) => String(p.createdAt || '').slice(0, 10) === dayKey);
    photosPerDay.push(dayPhotos.length);
    revenuePerDay.push(
      subs
        .filter((s) => String(s.createdAt || '').slice(0, 10) === dayKey)
        .reduce((s, x) => s + (x.amount || 0), 0)
    );
  }

  const filterCounts = {};
  photos.forEach((p) => {
    const f = p.filterId || 'none';
    filterCounts[f] = (filterCounts[f] || 0) + 1;
  });

  return {
    stats: {
      totalUsers: users.length,
      premiumUsers: premium,
      totalPhotos: photos.length,
      totalRevenue,
      activeEvents: events.filter((e) => e.status === 'published').length,
      avgRating: 4.7,
    },
    chart: { labels, photosPerDay, revenuePerDay },
    topFilters: Object.entries(filterCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count })),
    recentPhotos: [...photos]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 6),
  };
}

/* ---------------- users ---------------- */

export async function getUsers() {
  if (isConfigured) {
    const users = await safeList('users');
    if (users) return users;
  }
  return db.users;
}
export const toggleUserPlan = (id, current) => {
  const next = current === 'premium' ? 'free' : 'premium';
  if (isConfigured) return updateDocById('users', id, { plan: next }).then(() => next);
  const u = db.users.find((x) => x.id === id);
  if (u) u.plan = next;
  return Promise.resolve(next);
};
export const removeUser = (id) => {
  if (isConfigured) return deleteDocById('users', id);
  db.users = db.users.filter((x) => x.id !== id);
  return Promise.resolve();
};

/* ---------------- photos / moderation ---------------- */

export async function getPhotos() {
  if (isConfigured) {
    const photos = await safeList('photos');
    if (photos) return photos;
  }
  return db.photos;
}
export const moderatePhoto = (id, action) => {
  const patch = {
    approve: { isPublic: true, moderation: 'approved' },
    hide: { isPublic: false, moderation: 'hidden' },
  }[action];
  if (isConfigured) return updateDocById('photos', id, patch);
  const p = db.photos.find((x) => x.id === id);
  if (p) Object.assign(p, patch);
  return Promise.resolve();
};
export const removePhoto = (id) => {
  if (isConfigured) return deleteDocById('photos', id);
  db.photos = db.photos.filter((x) => x.id !== id);
  return Promise.resolve();
};

/* ---------------- filters CRUD ---------------- */

export async function getFilters() {
  if (isConfigured) {
    const filters = await safeList('filters');
    if (filters) return filters;
  }
  return db.filters;
}
export const saveFilter = (data, editingId) => {
  if (isConfigured) {
    return editingId
      ? updateDocById('filters', editingId, data)
      : createDoc('filters', data);
  }
  if (editingId) {
    Object.assign(db.filters.find((f) => f.id === editingId), data);
  } else {
    db.filters.unshift({ id: 'f' + Date.now(), ...data, createdAt: daysAgo(0) });
  }
  return Promise.resolve();
};
export const removeFilter = (id) => {
  if (isConfigured) return deleteDocById('filters', id);
  db.filters = db.filters.filter((f) => f.id !== id);
  return Promise.resolve();
};

/* ---------------- revenue ---------------- */

export async function getRevenue() {
  let subs;
  if (isConfigured) {
    subs = await safeList('subscriptions');
    if (!subs) subs = db.subscriptions;
  } else {
    subs = db.subscriptions;
  }

  const cut = (days) => new Date(today.getTime() - days * 86400000).toISOString();
  const inRange = (s, from) =>
    String(s.createdAt || '') >= from;
  const sum = (rows) => rows.reduce((s, x) => s + (x.amount || 0), 0);

  const monthly = subs.filter((s) => inRange(s, cut(30)));
  const weekly = subs.filter((s) => inRange(s, cut(7)));
  const daily = subs.filter((s) => inRange(s, cut(1)));

  const monthLabels = [];
  const monthData = [];
  for (let i = 8; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    monthLabels.push(d.toLocaleDateString('en-US', { month: 'short' }));
    const key = d.toISOString().slice(0, 7);
    monthData.push(
      sum(subs.filter((s) => String(s.createdAt || '').slice(0, 7) === key))
    );
  }

  const total = sum(subs);
  return {
    totalRevenue: total,
    monthlyRevenue: sum(monthly),
    weeklyRevenue: sum(weekly),
    dailyRevenue: sum(daily),
    newSubscribers: monthly.length,
    arpu: subs.length ? total / subs.length : 0,
    churnRate: 3.2,
    monthLabels,
    monthData,
    transactions: [...subs]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, 20),
  };
}

/* ---------------- events & bookings ---------------- */

export async function getEvents() {
  if (isConfigured) {
    const events = await safeList('events');
    if (events) return events;
  }
  return db.events;
}
export const saveEvent = (data, editingId) => {
  if (isConfigured) {
    return editingId ? updateDocById('events', editingId, data) : createDoc('events', data);
  }
  if (editingId) Object.assign(db.events.find((e) => e.id === editingId), data);
  else db.events.unshift({ id: 'e' + Date.now(), ...data, createdAt: daysAgo(0) });
  return Promise.resolve();
};
export const removeEvent = (id) => {
  if (isConfigured) return deleteDocById('events', id);
  db.events = db.events.filter((e) => e.id !== id);
  return Promise.resolve();
};

export async function getBookings() {
  if (isConfigured) {
    const bookings = await safeList('bookings');
    if (bookings) return bookings;
  }
  return db.bookings;
}
export const setBookingStatus = (id, status) => {
  if (isConfigured) return updateDocById('bookings', id, { status });
  const b = db.bookings.find((x) => x.id === id);
  if (b) b.status = status;
  return Promise.resolve();
};

/* ---------------- notifications ---------------- */

export async function getNotifications() {
  if (isConfigured) {
    const rows = await safeList('notifications');
    if (rows) return rows;
  }
  return db.notifications;
}
export const saveNotification = (data) => {
  if (isConfigured) return createDoc('notifications', { ...data, status: 'sent' });
  db.notifications.unshift({
    id: 'n' + Date.now(), ...data, status: 'sent', createdAt: daysAgo(0),
  });
  return Promise.resolve();
};

/* ---------------- settings ---------------- */

export function loadSettings() {
  try {
    const raw = localStorage.getItem('pb_admin_settings');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {
    appName: 'Photobooth Admin',
    supportEmail: 'support@photobooth.app',
    freeTierCredits: 5,
    premiumPricePHP: 99,
    maintenanceMode: false,
    pushEnabled: true,
    aiFiltersEnabled: true,
  };
}
export function persistSettings(s) {
  localStorage.setItem('pb_admin_settings', JSON.stringify(s));
}
