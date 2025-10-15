module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  setupFilesAfterEnv: ["jest-fetch-mock"],
  moduleNameMapper: {
    "^@idpass/data-collect-core$": "<rootDir>/../datacollect/src",
  },
};
