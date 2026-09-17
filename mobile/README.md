# Photobooth App — Mobile Core (React Native + Firebase)

Production-ready mobile core para sa photobooth app: navigation, auth, onboarding, home/dashboard, gallery, settings, theme system, UI primitives, Firebase bootstrap, at app state management.

## Quick start

```bash
cd mobile
cp .env.example .env        # punan ng Firebase config values
npm install
npx expo start
```

## File tree

```
mobile/
├── App.tsx                       # Root: SafeArea > Theme > Auth > Photo providers + navigator
├── app.json                      # Expo config (permissions, bundle ids)
├── package.json
├── tsconfig.json
├── .env.example                  # Dummy keys — palitan ng totoong Firebase values
├── INTEGRATION.md                # Contracts para sa camera/editor/premium/backend modules
└── src/
    ├── config/env.ts             # Env var reader + configured checks
    ├── theme/
    │   ├── tokens.ts             # COLORS, GRADIENT, SPACING, RADIUS, fonts
    │   └── ThemeContext.tsx      # ThemeProvider + useTheme (Poppins auto-load)
    ├── services/
    │   ├── firebase.ts           # Firebase app/auth/firestore/storage bootstrap
    │   └── auth.ts               # signUp/signIn/signOut + users doc creation
    ├── contexts/
    │   ├── AuthContext.tsx       # User + live profile subscription
    │   └── PhotoContext.tsx      # Pending photos, selected filter, recent photos
    ├── hooks/
    │   ├── useAuth.ts
    │   └── usePhotosState.ts
    ├── navigation/
    │   ├── types.ts              # Typed route params (Auth/Main/Premium/Camera/Preview)
    │   └── RootNavigator.tsx     # Auth gating + bottom tabs
    ├── components/ui/
    │   ├── GradientButton.tsx
    │   ├── Input.tsx
    │   ├── Screen.tsx
    │   ├── Card.tsx
    │   └── index.ts
    └── screens/
        ├── onboarding/OnboardingScreen.tsx
        ├── auth/LoginScreen.tsx
        ├── auth/SignUpScreen.tsx
        ├── home/HomeScreen.tsx
        ├── gallery/GalleryScreen.tsx
        └── settings/SettingsScreen.tsx
```

## Security notes

- Walang hardcoded secrets — lahat ng keys ay nasa `.env` (gitignored).
- Firestore/Storage security rules ay nasa root ng monorepo (DevOps workstream).
