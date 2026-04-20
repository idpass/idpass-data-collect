module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  setupFilesAfterEnv: ["jest-fetch-mock"],
  moduleNameMapper: {
    "^@idpass/data-collect-core$": "<rootDir>/../datacollect/src",
    "^@idpass/adapter-openspp$": "<rootDir>/../adapter-openspp/src",
    "^@idpass/adapter-openfn$": "<rootDir>/../adapter-openfn/src",
    "^@idpass/adapter-mock$": "<rootDir>/../adapter-mock/src",
  },
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "/__tests__/helpers/", "/__tests__/e2e/setup\\.ts$"],
  // Run tests sequentially to avoid race conditions: multiple test suites
  // share the same PostgreSQL server and the public/artifacts/ directory on disk.
  maxWorkers: 1,
};
