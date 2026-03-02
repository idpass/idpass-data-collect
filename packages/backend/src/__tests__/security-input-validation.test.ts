/**
 * Security tests: Input validation and CORS configuration
 *
 * Tests cover:
 * 7. CORS defaults to wide open when CORS_ORIGINS is unset (HIGH)
 *
 * These tests MUST FAIL against the current codebase.
 */
import "dotenv/config";
import request from "supertest";
import { Client } from "pg";
import { run } from "../syncServer";
import { SyncServerInstance } from "../types";

jest.mock("../utils/logger", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pino = require("pino");
  const silentLogger = pino({ level: "silent" });
  return {
    createLogger: () => silentLogger.child({ component: "test" }),
    logger: silentLogger,
  };
});

const getConnectionString = () => {
  const url = process.env.POSTGRES_TEST;
  if (!url) return "";
  const parsed = new URL(url.replace(/ /g, "%20"));
  const baseName = parsed.pathname.replace(/^\//, "");
  const dbName = baseName ? `${baseName}_sec_input` : "datacollect_sec_input";
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
};

const postgresUrl = getConnectionString();
const describeIfPostgres = process.env.POSTGRES_TEST ? describe : describe.skip;

const ensureDatabaseExists = async (connectionString: string) => {
  if (!connectionString) return;
  const parsed = new URL(connectionString);
  const dbName = parsed.pathname.replace(/^\//, "");
  if (!dbName) return;

  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";

  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (result.rowCount === 0) {
    const escapedName = dbName.replace(/"/g, '""');
    await client.query(`CREATE DATABASE "${escapedName}"`);
  }
  await client.end();
};

describeIfPostgres("SECURITY: CORS configuration", () => {
  let app: SyncServerInstance | null = null;

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = "cors-test-secret";
    }
    await ensureDatabaseExists(postgresUrl);
  });

  afterEach(async () => {
    if (app) {
      await app.clearStore();
      await app.closeConnection();
      app = null;
    }
  });

  test("CORS should NOT allow arbitrary origins when CORS_ORIGINS is unset", async () => {
    // Ensure CORS_ORIGINS is not set
    const originalCorsOrigins = process.env.CORS_ORIGINS;
    delete process.env.CORS_ORIGINS;

    try {
      app = await run({
        port: 0,
        adminPassword: "admin-cors-1@",
        adminEmail: "admin-cors@example.com",
        postgresUrl,
      });

      // Send a preflight request from a malicious origin
      const response = await request(app.httpServer)
        .options("/api/users/login")
        .set("Origin", "https://evil-attacker.com")
        .set("Access-Control-Request-Method", "POST");

      // EXPECTED (secure): The response should NOT include
      // "Access-Control-Allow-Origin: https://evil-attacker.com"
      // because CORS should default to restrictive when unset.
      //
      // ACTUAL (vulnerable): The response includes
      // "Access-Control-Allow-Origin: *" because cors() with undefined
      // options defaults to allowing all origins.
      const allowOrigin = response.headers["access-control-allow-origin"];
      expect(allowOrigin).not.toBe("*");
      expect(allowOrigin).not.toBe("https://evil-attacker.com");
    } finally {
      if (originalCorsOrigins !== undefined) {
        process.env.CORS_ORIGINS = originalCorsOrigins;
      }
    }
  });

  test("CORS should reject cross-origin requests from unlisted origins when CORS_ORIGINS is set", async () => {
    const originalCorsOrigins = process.env.CORS_ORIGINS;
    process.env.CORS_ORIGINS = "https://trusted-app.example.com";

    try {
      app = await run({
        port: 0,
        adminPassword: "admin-cors-2@",
        adminEmail: "admin-cors2@example.com",
        postgresUrl,
      });

      // Send a request from an untrusted origin
      const response = await request(app.httpServer)
        .get("/health")
        .set("Origin", "https://evil-attacker.com");

      // When CORS_ORIGINS is set, the untrusted origin should NOT appear
      // in the Access-Control-Allow-Origin header
      const allowOrigin = response.headers["access-control-allow-origin"];
      expect(allowOrigin).not.toBe("https://evil-attacker.com");
      expect(allowOrigin).not.toBe("*");
    } finally {
      if (originalCorsOrigins !== undefined) {
        process.env.CORS_ORIGINS = originalCorsOrigins;
      } else {
        delete process.env.CORS_ORIGINS;
      }
    }
  });
});
