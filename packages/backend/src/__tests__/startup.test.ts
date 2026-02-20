/**
 * Tests for server startup validation and configuration.
 *
 * These tests verify that the server entry point correctly validates
 * required environment variables before starting.
 */

describe("Server startup validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("throws error when ADMIN_PASSWORD is missing", () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.POSTGRES = "postgresql://admin:admin@localhost:5432/postgres";
    process.env.JWT_SECRET = "test-secret";
    delete process.env.ADMIN_PASSWORD;

    expect(() => {
      require("../index");
    }).toThrow("Initial admin credentials must be set");
  });

  test("throws error when ADMIN_EMAIL is missing", () => {
    process.env.ADMIN_PASSWORD = "password123";
    process.env.POSTGRES = "postgresql://admin:admin@localhost:5432/postgres";
    process.env.JWT_SECRET = "test-secret";
    delete process.env.ADMIN_EMAIL;

    expect(() => {
      require("../index");
    }).toThrow("Initial admin credentials must be set");
  });

  test("throws error when JWT_SECRET is missing", () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "password123";
    process.env.POSTGRES = "postgresql://admin:admin@localhost:5432/postgres";
    delete process.env.JWT_SECRET;

    expect(() => {
      require("../index");
    }).toThrow("JWT_SECRET must be set");
  });

  test("throws error when JWT_SECRET is too short", () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "password123";
    process.env.JWT_SECRET = "too-short";
    process.env.POSTGRES = "postgresql://admin:admin@localhost:5432/postgres";

    expect(() => {
      require("../index");
    }).toThrow("JWT_SECRET must be at least 32 characters long");
  });

  test("throws error when POSTGRES connection string is missing", () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.ADMIN_PASSWORD = "password123";
    process.env.JWT_SECRET = "a-very-long-secret-that-is-at-least-32-chars";
    delete process.env.POSTGRES;
    delete process.env.DATABASE_URL;

    expect(() => {
      require("../index");
    }).toThrow("PostgreSQL connection string must be set");
  });
});
