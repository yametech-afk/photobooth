/**
 * Public barrel for the monetization module.
 *
 * WHY THIS FILE EXISTS (runtime fix): the module ships its code under
 * `src/monetization/**` while this folder only had `index.d.ts`. The app imports
 * `../modules/monetization` (RootNavigator, App.tsx), and Metro resolves a
 * directory import to `index.js` — a types-only file does not exist at runtime,
 * so the bundler failed to resolve the module. This barrel is the real entry
 * point; `index.d.ts` next to it keeps the TypeScript surface.
 *
 * NOTE ON NESTING: the inner `src/monetization/src/services/firebase.js` bridge is
 * what makes `src/monetization/**` resolve `db`/`auth`/`functions` to the ONE
 * Firebase bootstrap in `mobile/src/services/firebase.ts`. Do not move the inner
 * tree without updating that bridge (it climbs four levels).
 */

export * from './src/monetization';