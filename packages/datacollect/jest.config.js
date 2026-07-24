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
    // uuid v14 ships ESM-only .js; transpile it to CJS for the ts-jest/CJS runtime.
    "^.+\\.jsx?$": [
      "babel-jest",
      { presets: [["@babel/preset-env", { targets: { node: "current" } }]] },
    ],
  },
  // Allow uuid (ESM-only) to be transformed instead of ignored. pnpm stores
  // packages under node_modules/.pnpm/<name>@<version>, so target that layout.
  transformIgnorePatterns: ["/node_modules/\\.pnpm/(?!uuid@)"],
  testMatch: ["**/*.spec.ts", "**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "\\.integration\\.test\\.ts$"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
};
