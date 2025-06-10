import "dotenv/config";

import axios from "axios";
import { get } from "lodash";
import request from "supertest";
import { v4 as uuidv4 } from "uuid";
import { FormSubmission, SyncLevel } from "idpass-data-collect";
import { run } from "../syncServer";
import { SyncServerInstance, AppConfig } from "../types";

const mockConfig: AppConfig = {
  id: "mock-config",
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

describe("Sync Server", () => {
  let app: SyncServerInstance;

  const internalUrl = "http://localhost:3000";
  // const externalUrl = "http://localhost:3001";
  const userId = "sync-server-test";

  beforeAll(async () => {});

  beforeEach(async () => {
    app = await run({
      port: 3000,
      initialPassword: "admin1@",
      userId,
      postgresUrl: process.env.POSTGRES_TEST || "",
    });
    await app.appConfigStore.saveConfig(mockConfig);
    await app.appInstanceStore.createAppInstance(mockConfig.id);
  });

  afterEach(async () => {
    await app.clearStore();
    await app.closeConnection();
  });

  describe("GET /sync/pull", () => {
    it("should return events since the given timestamp", async () => {
      const adminLoginResponse = await axios.post(internalUrl + "/api/users/login", {
        email: "admin@hdm.com",
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

      console.log(app.appInstanceStore.getAppInstance(mockConfig.id));
      const manager = (await app.appInstanceStore.getAppInstance(mockConfig.id))?.edm;
      await manager?.submitForm(formData1);
      await manager?.submitForm(formData2);

      const since = "2023-02-01T00:00:00.000Z";
      const response = await request(app.httpServer)
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
      const adminLoginResponse = await axios.post(internalUrl + "/api/users/login", {
        email: "admin@hdm.com",
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

      const manager = (await app.appInstanceStore.getAppInstance(mockConfig.id))?.edm;
      await manager?.submitForm(formData1);

      const since = "2023-01-01T00:00:00.000Z";
      const response = await request(app.httpServer)
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

      const response2 = await request(app.httpServer)
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
      const adminLoginResponse = await axios.post(internalUrl + "/api/users/login", {
        email: "admin@hdm.com",
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

      const response = await request(app.httpServer)
        .post("/api/sync/push")
        .send({ events, configId: mockConfig.id })
        .set("Authorization", `Bearer ${adminToken}`);

      const manager = (await app.appInstanceStore.getAppInstance(mockConfig.id))?.edm;
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

  describe("Has admin user", () => {
    it("should return true if there is an admin user", async () => {
      const hasAdmin = await app.userStore.hasAtLeastOneAdmin();
      expect(hasAdmin).toBe(true);
    });

    it("should return false if there is no admin user", async () => {
      await app.userStore.clearStore();
      const hasAdmin = await app.userStore.hasAtLeastOneAdmin();
      expect(hasAdmin).toBe(false);
    });
  });

  describe("POST /potential-duplicates/resolve", () => {
    it("should resolve potential duplicates and delete the new item", async () => {
      const adminLoginResponse = await axios.post(internalUrl + "/api/users/login", {
        email: "admin@hdm.com",
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
      const manager = (await app.appInstanceStore.getAppInstance(mockConfig.id))?.edm;
      await manager?.submitForm({ ...formData1, guid: uuidv4(), entityGuid: entityGuid1 });
      await manager?.submitForm({ ...formData1, guid: uuidv4(), entityGuid: entityGuid2 });

      const potentialDuplicates = await manager?.getPotentialDuplicates();
      expect(potentialDuplicates).toEqual([
        {
          entityGuid: entityGuid2,
          duplicateGuid: entityGuid1,
        },
      ]);

      const response = await request(app.httpServer)
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
