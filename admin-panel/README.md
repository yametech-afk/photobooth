# 📸 Photobooth Admin Panel

Production-ready React (Vite) + Firebase web admin for the photobooth platform:
secure admin login, dashboard metrics, user management, photo moderation, AI-filter
CRUD, revenue analytics, events, bookings, notifications, and settings.

Runs in two modes with **zero code changes**:

| Mode | When | Behavior |
|------|------|----------|
| **Demo** | No `VITE_FIREBASE_*` env vars | Seeded mock data, any credentials log in |
| **Live** | Env vars set | Real Firebase Auth + Firestore reads/writes |

---

## Quick start

```bash
cd admin-panel
npm install
cp .env.example .env      # optional — leave empty for demo mode
npm run dev               # http://localhost:5173
```

Demo login: any email + any password.

## Environment variables

Create `admin-panel/.env` (see `.env.example`):

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

These are Firebase **web** config values — public by design; real security is
enforced by Security Rules, not by hiding these keys.

## Admin access (security model)

1. In Firebase Console → Authentication, create the admin's email/password user.
2. Add a document at `admins/{uid}`:
   ```json
   { "name": "Main Admin", "email": "admin@yourapp.com", "role": "superadmin" }
   ```
3. Login flow (`src/services/firebase.js → adminSignIn`) verifies the account is
   in `admins` (or has a `role` custom claim) and signs out non-admins immediately.

> ⚠️ **Client-side role checks are UX only.** Real authorization comes from
> `firestore.rules` (shipped at project root) and, ideally, custom claims:
> ```js
> admin.auth().setCustomUserClaims(uid, { role: 'superadmin' });
> ```

## Project structure

```
admin-panel/
├── index.html
├── package.json
├── vite.config.js               # outDir "build" → matches firebase.json hosting
├── .env.example
├── firestore.rules              # role-based security rules
├── storage.rules                # image size/type limits
└── src/
    ├── main.jsx
    ├── App.jsx                  # routes + route guard
    ├── styles.css               # dark photobooth theme (design tokens)
    ├── auth/AuthContext.jsx     # session + RequireAdmin guard
    ├── services/
    │   ├── firebase.js          # ONLY file touching the Firebase SDK
    │   ├── dataAdapter.js       # pages call this; mock fallback built in
    │   └── seed.js              # demo dataset
    ├── components/UI.jsx        # StatCard, BarChart, Modal, SideNav…
    ├── utils/formatters.js
    └── pages/
        ├── Login.jsx            # admin login + role verification
        ├── Dashboard.jsx        # KPI cards, 7-day charts, top filters, recent photos
        ├── Users.jsx            # search, plan filter, upgrade/downgrade, delete
        ├── Photos.jsx           # gallery, approve/hide moderation, delete
        ├── Filters.jsx          # full CRUD + AI prompt config + pricing
        ├── Revenue.jsx          # totals, ARPU, churn, monthly trend, transactions
        ├── Events.jsx           # CRUD + status workflow
        ├── Bookings.jsx         # confirm / complete / cancel workflow
        ├── Notifications.jsx    # send push campaigns (FCM), admin alerts
        └── Settings.jsx         # app config + monetization defaults
```

## Deploy the admin panel to Firebase Hosting

The Vite build outputs to `build/`, which is what the root `firebase.json`
hosting config points at:

```bash
npm run build
firebase deploy --only hosting          # from project root
```

Root `firebase.json` (already provided in the parent project):

```json
{
  "hosting": {
    "public": "build",
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  }
}
```

Deploy rules separately (do this **before** going live):

```bash
firebase deploy --only firestore:rules
firebase deploy --only storage
```

## Firestore collections expected

`users`, `photos`, `filters`, `subscriptions`, `events`, `events/{id}/bookings`
(or top-level `bookings`), `notifications`, `admins`, `config`.
Field names match the mobile app's Cloud Functions schema
(`plan`, `creditsRemaining`, `filterId`, `isPublic`, `amount`, `status`, …).
