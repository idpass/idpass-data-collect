import "dotenv/config";

import axios from "axios";
import { get } from "lodash";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import { FormSubmission, SyncLevel } from "@idpass/data-collect-core";
import { run } from "../syncServer";
import { SyncServerInstance, AppConfig } from "../types";
import { Client } from "pg";

const mockConfig: AppConfig = {
  id: "entities-search-test",
  artifactId: "entities-search-artifact",
  name: "Entities Search Test Config",
  description: "Config for entities search/members testing",
  version: "1.0.0",
  url: "http://localhost:3000",
  entityForms: [
    {
      id: "household",
      title: "Household",
      formio: { components: [] },
      name: "household",
      dependsOn: "",
    },
    {
      id: "individual",
      title: "Individual",
      formio: { components: [] },
      name: "individual",
      dependsOn: "household",
    },
  ],
};

const getConnectionString = () => {
  const url = process.env.POSTGRES_TEST;
  if (!url) return "";
  const parsed = new URL(url.replace(/ /g, "%20"));
  const baseName = parsed.pathname.replace(/^\//, "");
  const dbName = baseName ? `${baseName}_entities_search` : "datacollect_entities_search";
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

/** Helper to submit a form via the review endpoint and auto-apply it */
async function submitAndApply(httpServer: unknown, adminToken: string, configId: string, submission: FormSubmission) {
  const response = await request(httpServer)
    .post("/api/reviews/submit")
    .send({ tenantId: configId, formData: submission })
    .set("Authorization", `Bearer ${adminToken}`);
  return response;
}

describeIfPostgres("Entities Search & Members Routes", () => {
  let app: SyncServerInstance | null = null;
  let baseUrl = "";
  let adminToken = "";

  const requireApp = (): SyncServerInstance => {
    if (!app) throw new Error("Sync server instance is not initialized");
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
      adminEmail: "admin@entities-search-test.com",
      postgresUrl: postgresUrl as string,
    });
    const currentApp = requireApp();
    baseUrl = resolveBaseUrl(currentApp);
    await currentApp.appConfigStore.saveConfig(mockConfig);
    await currentApp.appInstanceStore.createAppInstance(mockConfig.id);

    try {
      const loginResponse = await axios.post(baseUrl + "/api/users/login", {
        email: "admin@entities-search-test.com",
        password: "admin1@",
      });
      adminToken = get(loginResponse.data, "token") ?? "";
    } catch {
      // Rate limiter may reject rapid logins in large test suites;
      // tests that require auth will fail explicitly if token is empty
      adminToken = "";
    }
  });

  afterEach(async () => {
    if (!app) return;
    const currentApp = requireApp();
    await currentApp.clearStore();
    await currentApp.closeConnection();
    app = null;
  });

  describe("POST /api/entities/search", () => {
    it("returns matching entities for regex name search", async () => {
      const currentApp = requireApp();

      // Create a group entity
      const groupGuid = uuidv4();
      await submitAndApply(currentApp.httpServer, adminToken, mockConfig.id, {
        guid: uuidv4(),
        entityGuid: groupGuid,
        type: "create-group",
        data: { name: "Smith Family", entityName: "household" },
        timestamp: new Date().toISOString(),
        userId: "admin@entities-search-test.com",
        syncLevel: SyncLevel.SYNCED,
      });

      // Search for it
      const response = await request(currentApp.httpServer)
        .post("/api/entities/search")
        .send({
          configId: mockConfig.id,
          criteria: [{ name: { $regex: "Smith" } }],
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      expect(response.body[0].name).toContain("Smith");
    });

    it("returns empty array when no entities match", async () => {
      const currentApp = requireApp();

      const response = await request(currentApp.httpServer)
        .post("/api/entities/search")
        .send({
          configId: mockConfig.id,
          criteria: [{ name: { $regex: "Nonexistent" } }],
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("returns results with empty criteria", async () => {
      const currentApp = requireApp();

      const response = await request(currentApp.httpServer)
        .post("/api/entities/search")
        .send({
          configId: mockConfig.id,
          criteria: [],
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("validates criteria array length", async () => {
      const currentApp = requireApp();

      // Create an array with more than 10 criteria items
      const criteria = Array.from({ length: 11 }, (_, i) => ({ [`field${i}`]: { $eq: "val" } }));

      const response = await request(currentApp.httpServer)
        .post("/api/entities/search")
        .send({
          configId: mockConfig.id,
          criteria,
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
    });

    it("respects limit parameter", async () => {
      const currentApp = requireApp();

      // Create two entities
      for (let i = 0; i < 2; i++) {
        await submitAndApply(currentApp.httpServer, adminToken, mockConfig.id, {
          guid: uuidv4(),
          entityGuid: uuidv4(),
          type: "create-group",
          data: { name: `Family ${i}`, entityName: "household" },
          timestamp: new Date().toISOString(),
          userId: "admin@entities-search-test.com",
          syncLevel: SyncLevel.SYNCED,
        });
      }

      const response = await request(currentApp.httpServer)
        .post("/api/entities/search")
        .send({
          configId: mockConfig.id,
          criteria: [],
          limit: 1,
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.length).toBeLessThanOrEqual(1);
    });

    it("returns 404 for unknown tenant", async () => {
      const currentApp = requireApp();

      const response = await request(currentApp.httpServer)
        .post("/api/entities/search")
        .send({
          configId: "nonexistent-tenant",
          criteria: [],
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });

    it("requires authentication", async () => {
      const currentApp = requireApp();

      const response = await request(currentApp.httpServer).post("/api/entities/search").send({
        configId: mockConfig.id,
        criteria: [],
      });

      expect(response.status).toBe(401);
    });

    it("rejects criteria with string values exceeding 200 characters", async () => {
      const currentApp = requireApp();
      const longString = "a".repeat(201);

      const response = await request(currentApp.httpServer)
        .post("/api/entities/search")
        .send({
          configId: mockConfig.id,
          criteria: [{ name: { $regex: longString } }],
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("200 characters");
    });

    it("rejects non-array criteria", async () => {
      const currentApp = requireApp();

      const response = await request(currentApp.httpServer)
        .post("/api/entities/search")
        .send({
          configId: mockConfig.id,
          criteria: "not-an-array",
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
    });

    it("clamps limit to 1 when 0 is provided", async () => {
      const currentApp = requireApp();

      // Create one entity
      await submitAndApply(currentApp.httpServer, adminToken, mockConfig.id, {
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-group",
        data: { name: "Limit Test Family", entityName: "household" },
        timestamp: new Date().toISOString(),
        userId: "admin@entities-search-test.com",
        syncLevel: SyncLevel.SYNCED,
      });

      const response = await request(currentApp.httpServer)
        .post("/api/entities/search")
        .send({
          configId: mockConfig.id,
          criteria: [],
          limit: 0,
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      // limit=0 should clamp to 1, so at most 1 result
      expect(response.body.length).toBeLessThanOrEqual(1);
    });

    it("defaults limit to 50 for non-numeric values", async () => {
      const currentApp = requireApp();

      const response = await request(currentApp.httpServer)
        .post("/api/entities/search")
        .send({
          configId: mockConfig.id,
          criteria: [],
          limit: "abc",
        })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe("GET /api/entities/:guid/members", () => {
    it("returns members of a group entity", async () => {
      const currentApp = requireApp();

      // Create a group
      const groupGuid = uuidv4();
      await submitAndApply(currentApp.httpServer, adminToken, mockConfig.id, {
        guid: uuidv4(),
        entityGuid: groupGuid,
        type: "create-group",
        data: { name: "Jones Family", entityName: "household" },
        timestamp: new Date().toISOString(),
        userId: "admin@entities-search-test.com",
        syncLevel: SyncLevel.SYNCED,
      });

      // Create an individual member
      const memberGuid = uuidv4();
      await submitAndApply(currentApp.httpServer, adminToken, mockConfig.id, {
        guid: uuidv4(),
        entityGuid: memberGuid,
        type: "create-individual",
        data: { name: "John Jones", entityName: "individual" },
        timestamp: new Date().toISOString(),
        userId: "admin@entities-search-test.com",
        syncLevel: SyncLevel.SYNCED,
      });

      // Link the individual to the group via add-member event
      await submitAndApply(currentApp.httpServer, adminToken, mockConfig.id, {
        guid: uuidv4(),
        entityGuid: groupGuid,
        type: "add-member",
        data: { members: [{ guid: memberGuid, name: "John Jones", type: "individual" }] },
        timestamp: new Date().toISOString(),
        userId: "admin@entities-search-test.com",
        syncLevel: SyncLevel.SYNCED,
      });

      // Fetch members
      const response = await request(currentApp.httpServer)
        .get(`/api/entities/${groupGuid}/members?configId=${mockConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(1);
      const member = response.body.find((m: { guid: string }) => m.guid === memberGuid);
      expect(member).toBeDefined();
      expect(member.name).toBe("John Jones");
    });

    it("returns empty array for entity with no members", async () => {
      const currentApp = requireApp();

      // Create a group with no members
      const groupGuid = uuidv4();
      await submitAndApply(currentApp.httpServer, adminToken, mockConfig.id, {
        guid: uuidv4(),
        entityGuid: groupGuid,
        type: "create-group",
        data: { name: "Empty Family", entityName: "household" },
        timestamp: new Date().toISOString(),
        userId: "admin@entities-search-test.com",
        syncLevel: SyncLevel.SYNCED,
      });

      const response = await request(currentApp.httpServer)
        .get(`/api/entities/${groupGuid}/members?configId=${mockConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("returns 404 for non-existent entity", async () => {
      const currentApp = requireApp();

      const response = await request(currentApp.httpServer)
        .get(`/api/entities/${uuidv4()}/members?configId=${mockConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });

    it("returns 404 for non-group entity", async () => {
      const currentApp = requireApp();

      // Create a group first (needed for individual to have a parent)
      const groupGuid = uuidv4();
      await submitAndApply(currentApp.httpServer, adminToken, mockConfig.id, {
        guid: uuidv4(),
        entityGuid: groupGuid,
        type: "create-group",
        data: { name: "Parent Family", entityName: "household" },
        timestamp: new Date().toISOString(),
        userId: "admin@entities-search-test.com",
        syncLevel: SyncLevel.SYNCED,
      });

      // Create an individual entity
      const individualGuid = uuidv4();
      await submitAndApply(currentApp.httpServer, adminToken, mockConfig.id, {
        guid: uuidv4(),
        entityGuid: individualGuid,
        type: "create-individual",
        data: { name: "Jane Doe", entityName: "individual", parentId: groupGuid },
        timestamp: new Date().toISOString(),
        userId: "admin@entities-search-test.com",
        syncLevel: SyncLevel.SYNCED,
      });

      const response = await request(currentApp.httpServer)
        .get(`/api/entities/${individualGuid}/members?configId=${mockConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });

    it("requires authentication", async () => {
      const currentApp = requireApp();

      const response = await request(currentApp.httpServer).get(
        `/api/entities/${uuidv4()}/members?configId=${mockConfig.id}`,
      );

      expect(response.status).toBe(401);
    });
  });
});
