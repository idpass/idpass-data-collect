module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", {}],
    // uuid v14 ships ESM-only .js; transpile it to CJS for the ts-jest/CJS runtime.
    "^.+\\.jsx?$": ["babel-jest", { presets: [["@babel/preset-env", { targets: { node: "current" } }]] }],
  },
  // Allow uuid (ESM-only) to be transformed instead of ignored. pnpm stores
  // packages under node_modules/.pnpm/<name>@<version>, so target that layout.
  transformIgnorePatterns: ["/node_modules/\\.pnpm/(?!uuid@)"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
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
