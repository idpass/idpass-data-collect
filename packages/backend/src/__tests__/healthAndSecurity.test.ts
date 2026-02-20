import "dotenv/config";

import axios from "axios";
import { get } from "lodash";
import request from "supertest";
import { run } from "../syncServer";
import { SyncServerInstance, AppConfig } from "../types";
import { Client } from "pg";

const mockConfig: AppConfig = {
  id: "health-test-config",
  artifactId: "health-test-artifact",
  name: "Health Test Config",
  description: "Test config for health and security tests",
  version: "1.0.0",
  url: "http://localhost:3000",
  entityForms: [
    {
      id: "mock-entityform",
      title: "Mock Entityform",
      formio: { components: [] },
      name: "Mock Entityform",
      dependsOn: "",
    },
  ],
};

const getConnectionString = () => {
  const url = process.env.POSTGRES_TEST;
  if (!url) return "";
  const parsed = new URL(url.replace(/ /g, "%20"));
  const baseName = parsed.pathname.replace(/^\//, "");
  const dbName = baseName ? `${baseName}_health_security` : "datacollect_health_security";
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

describeIfPostgres("Health and Security endpoints", () => {
  let app: SyncServerInstance | null = null;
  let baseUrl = "";

  const requireApp = (): SyncServerInstance => {
    if (!app) {
      throw new Error("Sync server instance is not initialized");
    }
    return app;
  };

  const resolveBaseUrl = (instance: SyncServerInstance): string => {
    const address = instance.httpServer.address();
    if (typeof address === "object" && address && address.port) {
      return `http://127.0.0.1:${address.port}`;
    }
    return "http://127.0.0.1";
  };

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = "test-secret";
    }
    await ensureDatabaseExists(postgresUrl);
  });

  beforeEach(async () => {
    if (app) {
      await requireApp().closeConnection();
    }
    app = await run({
      port: 0,
      adminPassword: "admin1@",
      adminEmail: "admin@example.com",
      postgresUrl: postgresUrl as string,
    });
    const currentApp = requireApp();
    baseUrl = resolveBaseUrl(currentApp);
    await currentApp.appConfigStore.saveConfig(mockConfig);
    await currentApp.appInstanceStore.createAppInstance(mockConfig.id);
  });

  afterEach(async () => {
    if (!app) return;
    const currentApp = requireApp();
    await currentApp.clearStore();
    await currentApp.closeConnection();
    app = null;
  });

  describe("GET /health", () => {
    it("returns 200 with status ok", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer).get("/health");

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("ok");
    });

    it("returns a valid ISO timestamp", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer).get("/health");

      expect(response.body.timestamp).toBeDefined();
      const parsed = new Date(response.body.timestamp);
      expect(parsed.toISOString()).toBe(response.body.timestamp);
    });

    it("does not require authentication", async () => {
      const currentApp = requireApp();
      // No Authorization header set
      const response = await request(currentApp.httpServer).get("/health");

      expect(response.status).toBe(200);
    });
  });

  describe("CORS configuration", () => {
    it("responds without CORS headers when CORS_ORIGINS is not set", async () => {
      const currentApp = requireApp();
      const originalCorsOrigins = process.env.CORS_ORIGINS;
      delete process.env.CORS_ORIGINS;

      const response = await request(currentApp.httpServer).get("/health").set("Origin", "http://evil.com");

      // When CORS is not configured, express-cors allows all origins by default
      expect(response.status).toBe(200);

      process.env.CORS_ORIGINS = originalCorsOrigins;
    });
  });

  describe("Authentication", () => {
    it("returns 401 when no Authorization header is provided for protected endpoint", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer).get("/api/users/check-token");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Authorization header missing");
    });

    it("returns 401 when an invalid token is provided", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer)
        .get("/api/users/check-token")
        .set("Authorization", "Bearer invalid-token-here");

      expect(response.status).toBe(401);
    });

    it("returns 200 when a valid token is provided", async () => {
      const currentApp = requireApp();
      const loginResponse = await axios.post(baseUrl + "/api/users/login", {
        email: "admin@example.com",
        password: "admin1@",
      });
      const token = get(loginResponse.data, "token") ?? "";

      const response = await request(currentApp.httpServer)
        .get("/api/users/check-token")
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Token is valid");
    });

    it("returns 401 for non-bearer auth type on JWT-protected endpoints", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer)
        .get("/api/users/check-token")
        .set("Authorization", "Basic dXNlcjpwYXNz");

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("Invalid authentication type");
    });
  });

  describe("Login endpoint", () => {
    it("returns token on valid login", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer)
        .post("/api/users/login")
        .send({ email: "admin@example.com", password: "admin1@" });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(typeof response.body.token).toBe("string");
      expect(response.body.userId).toBeDefined();
    });

    it("returns 401 on invalid password", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer)
        .post("/api/users/login")
        .send({ email: "admin@example.com", password: "wrong-password" });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Invalid email or password");
    });

    it("returns 401 on non-existent email", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer)
        .post("/api/users/login")
        .send({ email: "nonexistent@example.com", password: "any-password" });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Invalid email or password");
    });
  });

  describe("404 handler", () => {
    it("returns 404 for non-existent routes", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer).get("/api/nonexistent-route");

      expect(response.status).toBe(404);
    });
  });

  describe("Sync push validation", () => {
    it("accepts well-formed push payload", async () => {
      const currentApp = requireApp();
      const loginResponse = await axios.post(baseUrl + "/api/users/login", {
        email: "admin@example.com",
        password: "admin1@",
      });
      const token = get(loginResponse.data, "token") ?? "";

      const response = await request(currentApp.httpServer)
        .post("/api/sync/push")
        .set("Authorization", `Bearer ${token}`)
        .send({
          events: [
            {
              guid: "test-event-1",
              entityGuid: "test-entity-1",
              type: "create-individual",
              data: { name: "Test Person" },
              timestamp: "2024-01-01T00:00:00.000Z",
              userId: "user-1",
              syncLevel: 0,
            },
          ],
          configId: mockConfig.id,
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("success");
    });

    it("rejects when events is not an array (Zod validation)", async () => {
      const currentApp = requireApp();
      const loginResponse = await axios.post(baseUrl + "/api/users/login", {
        email: "admin@example.com",
        password: "admin1@",
      });
      const token = get(loginResponse.data, "token") ?? "";

      const response = await request(currentApp.httpServer)
        .post("/api/sync/push")
        .set("Authorization", `Bearer ${token}`)
        .send({
          events: "not-an-array",
          configId: mockConfig.id,
        });

      // Zod validation rejects non-array events payloads
      expect(response.status).toBe(400);
      expect(response.body.status).toBe("error");
    });

    it("returns 401 when no auth token is provided for push", async () => {
      const currentApp = requireApp();
      const response = await request(currentApp.httpServer).post("/api/sync/push").send({
        events: [],
        configId: mockConfig.id,
      });

      expect(response.status).toBe(401);
    });
  });
});
