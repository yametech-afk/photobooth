/**
 * Jest config para sa security rules tests + backend unit tests.
 * Kabilang ng `test:rules` script sa functions/package.json (QA pack).
 */
module.exports = {
  testEnvironment: "node",
  transform: { "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/../tsconfig.json" }] },
  roots: ["<rootDir>"],
  testMatch: ["**/test/**/*.test.(ts|js)"],
  moduleFileExtensions: ["ts", "js", "json"],
  verbose: true,
  testTimeout: 30000,
};
