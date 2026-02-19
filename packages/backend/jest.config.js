module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  setupFilesAfterEnv: ["jest-fetch-mock"],
  moduleNameMapper: {
    "^@idpass/data-collect-core$": "<rootDir>/../datacollect/src",
    // Map jose to a mock so ESM-only builds don't break Jest's CommonJS transformer
    "^jose$": "<rootDir>/src/__mocks__/jose.ts",
  },
};
