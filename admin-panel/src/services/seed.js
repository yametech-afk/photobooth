/**
 * Seeded mock data — used ONLY when VITE_FIREBASE_* env vars are absent.
 * Makes every admin screen fully renderable during development/demo.
 * Dates are generated relative to "now" so charts/trends look live.
 */
const now = Date.now();
const DAY = 86400000;
const iso = (daysAgo, hour = 12) => {
  const d = new Date(now - daysAgo * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

const users = [
  { id: 'u1', uid: 'u1', email: 'juan.delacruz@gmail.com', displayName: 'Juan Dela Cruz', plan: 'premium', creditsRemaining: 9999, totalPhotosTaken: 142, createdAt: iso(90) },
  { id: 'u2', uid: 'u2', email: 'maria.santos@yahoo.com', displayName: 'Maria Santos', plan: 'free', creditsRemaining: 3, totalPhotosTaken: 27, createdAt: iso(75) },
  { id: 'u3', uid: 'u3', email: 'carlo.reyes@outlook.com', displayName: 'Carlo Reyes', plan: 'premium', creditsRemaining: 9999, totalPhotosTaken: 98, createdAt: iso(60) },
  { id: 'u4', uid: 'u4', email: 'ana.lim@gmail.com', displayName: 'Ana Lim', plan: 'free', creditsRemaining: 0, totalPhotosTaken: 55, createdAt: iso(45) },
  { id: 'u5', uid: 'u5', email: 'paolo.mendoza@gmail.com', displayName: 'Paolo Mendoza', plan: 'premium', creditsRemaining: 9999, totalPhotosTaken: 210, createdAt: iso(30) },
  { id: 'u6', uid: 'u6', email: 'grace.tan@gmail.com', displayName: 'Grace Tan', plan: 'free', creditsRemaining: 5, totalPhotosTaken: 12, createdAt: iso(14) },
  { id: 'u7', uid: 'u7', email: 'migz.villanueva@gmail.com', displayName: 'Migz Villanueva', plan: 'free', creditsRemaining: 2, totalPhotosTaken: 8, createdAt: iso(6) },
  { id: 'u8', uid: 'u8', email: 'kristine.aquino@gmail.com', displayName: 'Kristine Aquino', plan: 'premium', creditsRemaining: 9999, totalPhotosTaken: 76, createdAt: iso(2) },
];

const FILTERS = ['anime', 'cyberpunk', 'vintage', 'oil-painting', 'pop-art', 'none'];
const filterCounts = [18, 15, 12, 9, 7, 11];
const photos = [];
let pid = 1;
for (let d = 6; d >= 0; d--) {
  const perDay = [4, 7, 5, 9, 6, 8, 10][6 - d];
  for (let i = 0; i < perDay; i++) {
    const fi = (pid + i) % FILTERS.length;
    photos.push({
      id: 'p' + pid++,
      uid: users[pid % users.length].uid,
      ownerName: users[pid % users.length].displayName,
      url: '',
      filterId: FILTERS[fi],
      eventId: pid % 5 === 0 ? 'e1' : null,
      isPublic: pid % 3 !== 0,
      moderation: pid % 3 !== 0 ? 'approved' : 'pending',
      likes: (pid * 7) % 40,
      shares: (pid * 3) % 15,
      createdAt: iso(d, 8 + (i % 12)),
    });
  }
}

const filters = [
  { id: 'f1', name: 'Anime Dream', description: 'Studio Ghibli inspired painterly look', prompt: 'anime style, vibrant colors, studio ghibli inspired, highly detailed', isPremium: true, price: 49, category: 'artistic', color: '#FF4DA6', createdAt: iso(80) },
  { id: 'f2', name: 'Cyberpunk Neon', description: 'Futuristic neon-lit night look', prompt: 'cyberpunk neon lights, futuristic, blade runner style', isPremium: true, price: 49, category: 'artistic', color: '#7B61FF', createdAt: iso(70) },
  { id: 'f3', name: 'Vintage Film', description: '1950s sepia film grain', prompt: '1950s vintage photograph, sepia tones, retro film grain', isPremium: false, price: 0, category: 'basic', color: '#B8860B', createdAt: iso(65) },
  { id: 'f4', name: 'Pop Art', description: 'Andy Warhol bold pop colors', prompt: 'andy warhol pop art style, bold primary colors', isPremium: true, price: 99, category: 'premium', color: '#FFD600', createdAt: iso(40) },
  { id: 'f5', name: 'Sketch', description: 'Hand-drawn pencil sketch', prompt: 'pencil sketch, black and white, hand-drawn linework', isPremium: false, price: 0, category: 'basic', color: '#00BCD4', createdAt: iso(20) },
  { id: 'f6', name: 'Watercolor', description: 'Soft watercolor brushwork', prompt: 'watercolor painting, soft colors, artistic brushwork', isPremium: true, price: 49, category: 'artistic', color: '#00E676', createdAt: iso(8) },
];

const subscriptions = [
  { id: 's1', uid: 'u1', subscriptionId: 'sub_9f2ka81m', platform: 'android', status: 'active', amount: 99, createdAt: iso(1) },
  { id: 's2', uid: 'u3', subscriptionId: 'sub_2mz8qp4x', platform: 'ios', status: 'active', amount: 99, createdAt: iso(2) },
  { id: 's3', uid: 'u5', subscriptionId: 'sub_7hq1lv0r', platform: 'android', status: 'active', amount: 99, createdAt: iso(3) },
  { id: 's4', uid: 'u8', subscriptionId: 'sub_5ty3bn6e', platform: 'ios', status: 'active', amount: 99, createdAt: iso(5) },
  { id: 's5', uid: 'u1', subscriptionId: 'sub_3kd9wq2s', platform: 'android', status: 'active', amount: 99, createdAt: iso(8) },
  { id: 's6', uid: 'u3', subscriptionId: 'sub_8nb4vx1c', platform: 'ios', status: 'active', amount: 99, createdAt: iso(12) },
  { id: 's7', uid: 'u5', subscriptionId: 'sub_1pl6mc9t', platform: 'android', status: 'active', amount: 99, createdAt: iso(15) },
  { id: 's8', uid: 'u8', subscriptionId: 'sub_6rt0ez8y', platform: 'web', status: 'active', amount: 149, createdAt: iso(18) },
  { id: 's9', uid: 'u1', subscriptionId: 'sub_4yu7hg3j', platform: 'android', status: 'active', amount: 99, createdAt: iso(22) },
  { id: 's10', uid: 'u3', subscriptionId: 'sub_9io2pk5l', platform: 'ios', status: 'active', amount: 99, createdAt: iso(28) },
  { id: 's11', uid: 'u5', subscriptionId: 'sub_2wa5sd7f', platform: 'android', status: 'expired', amount: 99, createdAt: iso(35) },
  { id: 's12', uid: 'u8', subscriptionId: 'sub_7cx3vb9n', platform: 'ios', status: 'active', amount: 99, createdAt: iso(41) },
  { id: 's13', uid: 'u1', subscriptionId: 'sub_5zm1ql6p', platform: 'android', status: 'active', amount: 99, createdAt: iso(55) },
  { id: 's14', uid: 'u3', subscriptionId: 'sub_3jm8ne2r', platform: 'web', status: 'expired', amount: 149, createdAt: iso(62) },
  { id: 's15', uid: 'u5', subscriptionId: 'sub_8kq4tb7w', platform: 'android', status: 'active', amount: 99, createdAt: iso(70) },
];

const events = [
  { id: 'e1', organizerId: 'u1', title: 'Birthday Booth — SQL Fashion Cafe', status: 'published', eventDate: iso(-3), photoCount: 64, packageType: 'birthday', createdAt: iso(9) },
  { id: 'e2', organizerId: 'u3', title: 'Corporate Year-End Party — Acme Corp', status: 'published', eventDate: iso(-20), photoCount: 180, packageType: 'corporate', createdAt: iso(35) },
  { id: 'e3', organizerId: 'u5', title: 'Wedding — Santos & Reyes', status: 'published', eventDate: iso(10), photoCount: 0, packageType: 'wedding', createdAt: iso(5) },
  { id: 'e4', organizerId: 'u1', title: 'Mall Kiosk — SM North EDSA', status: 'draft', eventDate: iso(25), photoCount: 0, packageType: 'kiosk', createdAt: iso(3) },
];

const bookings = [
  { id: 'b1', eventId: 'e3', customerName: 'Maria Santos', eventType: 'wedding', packageType: 'premium', eventDate: iso(10), amount: 15000, status: 'confirmed', createdAt: iso(6) },
  { id: 'b2', eventId: 'e4', customerName: 'SM Supermalls', eventType: 'kiosk', packageType: 'monthly', eventDate: iso(25), amount: 20000, status: 'pending', createdAt: iso(2) },
  { id: 'b3', eventId: 'e1', customerName: 'Juan Dela Cruz', eventType: 'birthday', packageType: 'standard', eventDate: iso(-3), amount: 5000, status: 'completed', createdAt: iso(9) },
  { id: 'b4', eventId: 'e2', customerName: 'Acme Corp HR', eventType: 'corporate', packageType: 'premium', eventDate: iso(-20), amount: 35000, status: 'completed', createdAt: iso(35) },
  { id: 'b5', eventId: null, customerName: 'Grace Tan', eventType: 'birthday', packageType: 'standard', eventDate: iso(18), amount: 4500, status: 'pending', createdAt: iso(1) },
];

const notifications = [
  { id: 'n1', title: 'New premium subscriber 🎉', body: 'Kristine Aquino just upgraded to Premium via iOS.', audience: 'admins', status: 'sent', createdAt: iso(0, 9) },
  { id: 'n2', title: 'Monthly revenue milestone', body: 'You crossed ₱50,000 monthly revenue this month.', audience: 'admins', status: 'sent', createdAt: iso(2) },
  { id: 'n3', title: 'Seasonal promo: Christmas filters', body: 'Push notification sent to all free users — 12.4% conversion.', audience: 'all-users', status: 'sent', createdAt: iso(6) },
];

export function seedDB() {
  return { users, photos, filters, subscriptions, events, bookings, notifications };
}
