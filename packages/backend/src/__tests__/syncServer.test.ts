import "dotenv/config";

import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { get } from "lodash";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import { FormSubmission, SyncLevel } from "@idpass/data-collect-core";
import { run } from "../syncServer";
import { SyncServerInstance, AppConfig } from "../types";

const mockConfig: AppConfig = {
  id: "mock-config",
  artifactId: "mock-config-artifact",
  name: "Mock Config",
  description: "Mock Config Description",
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
  const dbName = baseName ? `${baseName}_sync_server` : "datacollect_sync_server";
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
};

const postgresUrl = getConnectionString();
const describeIfPostgres = process.env.POSTGRES_TEST ? describe : describe.skip;

const ensureDatabaseExists = async (connectionString: string) => {
  if (!connectionString) return;
  const { Client } = require("pg");
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

describeIfPostgres("Sync Server", () => {
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
    if (!app) {
      return;
    }
    const currentApp = requireApp();
    await currentApp.clearStore();
    await currentApp.closeConnection();
    app = null;
  });

  describe("GET /sync/pull", () => {
    it("should return events since the given timestamp", async () => {
      const currentApp = requireApp();
      const adminLoginResponse = await axios.post(baseUrl + "/api/users/login", {
        email: "admin@example.com",
        password: "admin1@",
      });
      const adminToken = get(adminLoginResponse.data, "token") ?? "";

      const formData1: FormSubmission = {
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: "John Doe", age: 30, email: "john.doe@example.com" },
        timestamp: "2023-01-01T00:00:00.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      };

      const formData2: FormSubmission = {
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: "Jane Smith", age: 40, email: "jane.smith@test.com" },
        timestamp: "2023-03-01T00:00:00.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      };

      const manager = (await currentApp.appInstanceStore.getAppInstance(mockConfig.id))?.edm;
      await manager?.submitForm(formData1);
      await manager?.submitForm(formData2);

      const since = "2023-02-01T00:00:00.000Z";
      const response = await request(currentApp.httpServer)
        .get(`/api/sync/pull?since=${since}&configId=${mockConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        events: [
          {
            guid: expect.any(String),
            entityGuid: expect.any(String),
            type: "create-individual",
            data: { name: "Jane Smith", age: 40, email: "jane.smith@test.com" },
            timestamp: expect.any(String),
            userId: "user-1",
            syncLevel: SyncLevel.LOCAL,
          },
        ],
        nextCursor: null,
      });
    });

    it("should return an empty array if duplicates exist", async () => {
      const currentApp = requireApp();
      const adminLoginResponse = await axios.post(baseUrl + "/api/users/login", {
        email: "admin@example.com",
        password: "admin1@",
      });
      const adminToken = get(adminLoginResponse.data, "token") ?? "";

      const formData1: FormSubmission = {
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: "John Doe", age: 30, email: "john.doe@example.com" },
        timestamp: "2023-02-01T00:00:00.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      };

      const manager = (await currentApp.appInstanceStore.getAppInstance(mockConfig.id))?.edm;
      await manager?.submitForm(formData1);

      const since = "2023-01-01T00:00:00.000Z";
      const response = await request(currentApp.httpServer)
        .get(`/api/sync/pull?since=${since}&configId=${mockConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        events: [
          {
            guid: expect.any(String),
            entityGuid: expect.any(String),
            type: "create-individual",
            data: { name: "John Doe", age: 30, email: "john.doe@example.com" },
            timestamp: expect.any(String),
            userId: "user-1",
            syncLevel: SyncLevel.LOCAL,
          },
        ],
        nextCursor: null,
      });

      const formData2: FormSubmission = {
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: "John Doe", age: 30, email: "john.doe@example.com" },
        timestamp: "2023-02-01T00:00:00.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      };

      await manager?.submitForm(formData2);

      const response2 = await request(currentApp.httpServer)
        .get(`/api/sync/pull?since=${since}&configId=${mockConfig.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response2.body).toEqual({
        events: [],
        nextCursor: null,
        error: "Duplicates exist! Please resolve them on admin page.",
      });
    });
  });

  describe("POST /sync/push", () => {
    it("should push events to the event store", async () => {
      const currentApp = requireApp();
      const adminLoginResponse = await axios.post(baseUrl + "/api/users/login", {
        email: "admin@example.com",
        password: "admin1@",
      });
      const adminToken = get(adminLoginResponse.data, "token") ?? "";

      const events: FormSubmission[] = [
        {
          guid: uuidv4(),
          entityGuid: uuidv4(),
          type: "create-individual",
          data: { name: "John Doe", age: 30, email: "john.doe@example.com" },
          timestamp: "2023-01-01T00:00:00.000Z",
          userId: "user-1",
          syncLevel: SyncLevel.LOCAL,
        },
        {
          guid: uuidv4(),
          entityGuid: uuidv4(),
          type: "create-individual",
          data: { name: "Jane Smith", age: 40, email: "jane.smith@test.com" },
          timestamp: "2023-01-01T00:00:00.000Z",
          userId: "user-1",
          syncLevel: SyncLevel.LOCAL,
        },
      ];

      const response = await request(currentApp.httpServer)
        .post("/api/sync/push")
        .send({ events, configId: mockConfig.id })
        .set("Authorization", `Bearer ${adminToken}`);

      const manager = (await currentApp.appInstanceStore.getAppInstance(mockConfig.id))?.edm;
      const pushedEntities = await manager?.getAllEntities();
      const pushedEvents = await manager?.getAllEvents();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "success" });
      expect(pushedEntities).toEqual([
        {
          guid: expect.any(String),
          initial: {
            id: expect.any(String),
            guid: expect.any(String),
            type: "individual",
            name: "John Doe",
            version: 1,
            data: { name: "John Doe", age: 30, email: "john.doe@example.com" },
            lastUpdated: expect.any(String),
          },
          modified: {
            id: expect.any(String),
            guid: expect.any(String),
            type: "individual",
            name: "John Doe",
            version: 1,
            data: { name: "John Doe", age: 30, email: "john.doe@example.com" },
            lastUpdated: expect.any(String),
          },
        },
        {
          guid: expect.any(String),
          initial: {
            id: expect.any(String),
            guid: expect.any(String),
            type: "individual",
            name: "Jane Smith",
            version: 1,
            data: { name: "Jane Smith", age: 40, email: "jane.smith@test.com" },
            lastUpdated: expect.any(String),
          },
          modified: {
            id: expect.any(String),
            guid: expect.any(String),
            type: "individual",
            name: "Jane Smith",
            version: 1,
            data: { name: "Jane Smith", age: 40, email: "jane.smith@test.com" },
            lastUpdated: expect.any(String),
          },
        },
      ]);
      expect(pushedEvents).toEqual([
        {
          guid: expect.any(String),
          entityGuid: expect.any(String),
          type: "create-individual",
          data: { name: "John Doe", age: 30, email: "john.doe@example.com" },
          timestamp: expect.any(String),
          userId: "user-1",
          syncLevel: SyncLevel.REMOTE,
        },
        {
          guid: expect.any(String),
          entityGuid: expect.any(String),
          type: "create-individual",
          data: { name: "Jane Smith", age: 40, email: "jane.smith@test.com" },
          timestamp: expect.any(String),
          userId: "user-1",
          syncLevel: SyncLevel.REMOTE,
        },
      ]);
    });
  });

  describe("Public artifacts fallback", () => {
    const artifactPaths = () => {
      const publicFolder = path.join(__dirname, "..", "public", "artifacts");
      return {
        json: path.join(publicFolder, `${mockConfig.artifactId}.json`),
        png: path.join(publicFolder, `${mockConfig.artifactId}.png`),
      };
    };

    it("regenerates the config JSON when it is missing", async () => {
      const currentApp = requireApp();
      const { json, png } = artifactPaths();
      await fs.unlink(json).catch(() => {});
      await fs.unlink(png).catch(() => {});

      const response = await request(currentApp.httpServer).get(`/artifacts/${mockConfig.artifactId}.json`);

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("application/json");
      expect(response.headers["content-disposition"]).toContain("attachment");
      const payload = JSON.parse(response.text);
      expect(payload.id).toBe(mockConfig.id);
      expect(payload.syncServerUrl).toBe(baseUrl);

      await expect(fs.access(json)).resolves.toBeUndefined();
      await expect(fs.access(png)).resolves.toBeUndefined();
    });

    it("regenerates the QR code when it is missing", async () => {
      const currentApp = requireApp();
      const { png } = artifactPaths();
      await fs.unlink(png).catch(() => {});

      const response = await request(currentApp.httpServer).get(`/artifacts/${mockConfig.artifactId}.png`);

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toBe("image/png");
      await expect(fs.access(png)).resolves.toBeUndefined();
    });
  });

  describe("Has admin user", () => {
    it("should return true if there is an admin user", async () => {
      const currentApp = requireApp();
      const hasAdmin = await currentApp.userStore.hasAtLeastOneAdmin();
      expect(hasAdmin).toBe(true);
    });

    it("should return false if there is no admin user", async () => {
      const currentApp = requireApp();
      await currentApp.userStore.clearStore();
      const hasAdmin = await currentApp.userStore.hasAtLeastOneAdmin();
      expect(hasAdmin).toBe(false);
    });
  });

  describe("POST /potential-duplicates/resolve", () => {
    it("should resolve potential duplicates and delete the new item", async () => {
      const currentApp = requireApp();
      const adminLoginResponse = await axios.post(baseUrl + "/api/users/login", {
        email: "admin@example.com",
        password: "admin1@",
      });
      const adminToken = get(adminLoginResponse.data, "token") ?? "";

      const entityGuid1 = uuidv4();
      const entityGuid2 = uuidv4();

      const formData1: FormSubmission = {
        guid: uuidv4(),
        entityGuid: uuidv4(),
        type: "create-individual",
        data: { name: "John Doe", age: 30, email: "john.doe@example.com" },
        timestamp: "2023-01-01T00:00:00.000Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      };
      const manager = (await currentApp.appInstanceStore.getAppInstance(mockConfig.id))?.edm;
      await manager?.submitForm({ ...formData1, guid: uuidv4(), entityGuid: entityGuid1 });
      await manager?.submitForm({ ...formData1, guid: uuidv4(), entityGuid: entityGuid2 });

      const potentialDuplicates = await manager?.getPotentialDuplicates();
      expect(potentialDuplicates).toEqual([
        {
          entityGuid: entityGuid2,
          duplicateGuid: entityGuid1,
        },
      ]);

      const response = await request(currentApp.httpServer)
        .post("/api/potential-duplicates/resolve")
        .send({ newItem: entityGuid2, existingItem: entityGuid1, shouldDeleteNewItem: true, configId: mockConfig.id })
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "success" });

      const potentialDuplicatesAfter = await manager?.getPotentialDuplicates();
      expect(potentialDuplicatesAfter).toEqual([]);

      const entitiesAfter = await manager?.getAllEntities();
      expect(entitiesAfter).toEqual([
        {
          guid: entityGuid1,
          initial: {
            id: expect.any(String),
            guid: expect.any(String),
            type: "individual",
            name: "John Doe",
            version: 1,
            data: { name: "John Doe", age: 30, email: "john.doe@example.com" },
            lastUpdated: expect.any(String),
          },
          modified: {
            id: expect.any(String),
            guid: expect.any(String),
            type: "individual",
            name: "John Doe",
            version: 1,
            data: { name: "John Doe", age: 30, email: "john.doe@example.com" },
            lastUpdated: expect.any(String),
          },
        },
      ]);
    });
  });
});
