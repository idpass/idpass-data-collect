import request from "supertest";
import { describeIfPostgres, ensureDatabaseExists, getConnectionString } from "./helpers/testDb";
import { run } from "../syncServer";
import { SyncServerInstance } from "../types";

describeIfPostgres("Sync Event Routes", () => {
  let app: SyncServerInstance;
  let adminToken: string;
  const connectionString = getConnectionString("sync_event_routes");
  const adminEmail = "admin@example.com";
  const adminPassword = "admin1@";

  beforeAll(async () => {
    if (!process.env.JWT_SECRET) {
      process.env.JWT_SECRET = "test-secret";
    }
    await ensureDatabaseExists(connectionString);
    app = await run({ port: 0, postgresUrl: connectionString, adminEmail, adminPassword });

    // Create admin user and get token
    const loginRes = await request(app.httpServer)
      .post("/api/users/login")
      .send({ email: adminEmail, password: adminPassword });
    adminToken = loginRes.body.token;
  });

  afterAll(async () => {
    await app.closeConnection();
  });

  describe("GET /api/sync/status", () => {
    it("returns 400 without configId", async () => {
      const res = await request(app.httpServer)
        .get("/api/sync/status")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });

    it("returns status with null lastEvent when no history", async () => {
      const res = await request(app.httpServer)
        .get("/api/sync/status?configId=nonexistent")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.isSyncing).toBe(false);
      expect(res.body.lastEvent).toBeNull();
    });
  });

  describe("GET /api/sync/events", () => {
    it("returns 400 without configId", async () => {
      const res = await request(app.httpServer)
        .get("/api/sync/events")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });

    it("returns empty events array when no history", async () => {
      const res = await request(app.httpServer)
        .get("/api/sync/events?configId=nonexistent")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.events).toEqual([]);
    });
  });
});
