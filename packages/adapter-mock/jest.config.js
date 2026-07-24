module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.test.json",
        // Disable ts-jest diagnostics because this package compiles datacollect
        // source via moduleNameMapper, and those files use browser APIs (IndexedDB)
        // that aren't available in a Node-only tsconfig. The datacollect package
        // has its own test suite for type-checking.
        diagnostics: false,
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
  moduleNameMapper: {
    "^@idpass/data-collect-core$": "<rootDir>/../datacollect/src/index.ts",
  },
};
