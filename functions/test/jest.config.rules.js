/**
 * Jest config — Cloud Functions: security-rules suites + unit suites.
 *
 * Used by two scripts in functions/package.json:
 *   npm run test         → unit suites only   (rules folder excluded)
 *   npm run test:rules   → rules suites only, wrapped in
 *                          `firebase emulators:exec --only firestore,storage,auth`
 *
 * The rules suites load the CANONICAL rules from the repository root
 * (firestore.rules / storage.rules), never the reference copies under devops/.
 */
module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.rules.json' }],
  },
  roots: ['<rootDir>'],
  testMatch: ['**/rules/*.test.ts', '**/unit/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  verbose: true,
  testTimeout: 60000,
  clearMocks: true,
  forceExit: true,
};