module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  setupFilesAfterEnv: ["jest-fetch-mock"],
  moduleNameMapper: {
    "^@idpass/data-collect-core$": "<rootDir>/../datacollect/src",
  },
  // Run tests sequentially to avoid race conditions: multiple test suites
  // share the same PostgreSQL server and the public/artifacts/ directory on disk.
  maxWorkers: 1,
};
