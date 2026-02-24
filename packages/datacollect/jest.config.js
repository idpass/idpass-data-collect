module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
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
