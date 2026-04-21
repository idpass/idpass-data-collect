module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  // Run tests serially to avoid Postgres race conditions when multiple
  // test suites create tables/indexes on the same shared database.
  maxWorkers: 1,
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.test.json",
      },
    ],
  },
  testMatch: ["**/*.spec.ts", "**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "\\.integration\\.test\\.ts$"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  setupFilesAfterEnv: ["jest-fetch-mock"],
};
