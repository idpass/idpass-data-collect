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
  },
  testMatch: ["**/*.spec.ts", "**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "\\.integration\\.test\\.ts$"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    "^@idpass/data-collect-core$": "<rootDir>/../datacollect/src/index.ts",
  },
  setupFilesAfterEnv: ["jest-fetch-mock"],
};
