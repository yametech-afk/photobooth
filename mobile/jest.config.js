/**
 * Jest config — mobile (Expo 50 / RN 0.73).
 *
 * Wired in devops v4 so CI has a real `npm test` target (Gate 0 expects one).
 * Suites land in mobile/__tests__/ ; the Detox E2E directory is excluded here
 * because device tests belong to Gate 2, not to PR checks.
 *
 * The pure-logic suites from the QA pack (monetization quota/entitlement parity,
 * the static callable-contract test) are owned by QA and are NOT copied in by
 * this patch — see devops/docs/CI-CHANGELOG-v4.md for the exact import-path fix
 * they need first, otherwise `npm test` would fail on a path that no longer exists.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.(js|jsx|ts|tsx)'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/android/', '/ios/'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.{js,ts}',
  ],
  clearMocks: true,
};