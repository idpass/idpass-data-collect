import "dotenv/config";

import { Pool } from "pg";
import { AppConfigStoreImpl } from "../AppConfigStore";
import { AppInstanceStoreImpl } from "../AppInstanceStore";
import { AppConfig } from "../../types";

describe("AppInstanceStore", () => {
  let appInstanceStore: AppInstanceStoreImpl;
  let appConfigStore: AppConfigStoreImpl;
  let pool: Pool;
  const userId = "test-user";

  const mockConfig: AppConfig = {
    id: "test-config-1",
    name: "Test Config",
    description: "Test configuration",
    version: "1.0.0",
    url: "http://test.com",
    entityForms: [
      {
        id: "form1",
        name: "testForm",
        title: "Test Form",
        dependsOn: "",
        formio: { components: [] },
      },
      {
        id: "form2",
        name: "testForm2",
        title: "Test Form 2",
        dependsOn: "form1",
        formio: { components: [] },
      },
    ],
    entityData: [
      {
        name: "testForm",
        data: [
          {
            id: "1",
            name: "Test Entity",
          },
        ],
      },
      {
        name: "testForm2",
        data: [
          {
            id: "2",
            name: "Test Entity 2",
          },
        ],
      },
    ],
  };

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.POSTGRES_TEST || "",
    });
    appConfigStore = new AppConfigStoreImpl(process.env.POSTGRES_TEST || "");
    await appConfigStore.initialize();
    await appConfigStore.saveConfig(mockConfig);

    appInstanceStore = new AppInstanceStoreImpl(appConfigStore, userId, process.env.POSTGRES_TEST || "");
  });

  afterEach(async () => {
    await appInstanceStore.clearStore();
  });

  afterAll(async () => {
    await appInstanceStore.closeConnection();
    await appConfigStore.clearStore();
    await appConfigStore.closeConnection();
    await pool.end();
  });

  describe("initialize", () => {
    it("should initialize and create app instances for all configs", async () => {
      await appInstanceStore.initialize();
      const instance = await appInstanceStore.getAppInstance(mockConfig.id);
      expect(instance).not.toBeNull();
      expect(instance?.configId).toBe(mockConfig.id);
    });
  });

  describe("createAppInstance", () => {
    it("should create a new app instance with the given config", async () => {
      const instance = await appInstanceStore.createAppInstance(mockConfig.id);
      expect(instance).not.toBeNull();
      expect(instance.configId).toBe(mockConfig.id);
      expect(instance.edm).toBeDefined();
    });

    it("should throw error when config does not exist", async () => {
      await expect(appInstanceStore.createAppInstance("non-existent")).rejects.toThrow();
    });
  });

  describe("loadEntityData", () => {
    it("should load entity data from config into the instance", async () => {
      await appConfigStore.saveConfig(mockConfig);
      await appInstanceStore.createAppInstance(mockConfig.id);
      await appInstanceStore.loadEntityData(mockConfig.id);

      const instance = await appInstanceStore.getAppInstance(mockConfig.id);
      expect(instance).not.toBeNull();
      const data = await instance?.edm.getAllEntities();
      console.log(data);
      expect(data?.length).toBe(2);
    });
  });

  describe("getAppInstance", () => {
    it("should return null for non-existent instance", async () => {
      const instance = await appInstanceStore.getAppInstance("non-existent");
      expect(instance).toBeNull();
    });

    it("should return the correct instance", async () => {
      await appInstanceStore.createAppInstance(mockConfig.id);
      const instance = await appInstanceStore.getAppInstance(mockConfig.id);
      expect(instance).not.toBeNull();
      expect(instance?.configId).toBe(mockConfig.id);
    });
  });

  describe("clearAppInstance", () => {
    it("should clear a specific app instance", async () => {
      await appInstanceStore.createAppInstance(mockConfig.id);
      await appInstanceStore.clearAppInstance(mockConfig.id);
      const instance = await appInstanceStore.getAppInstance(mockConfig.id);
      expect(instance).toBeNull();
    });
  });

  describe("clearStore", () => {
    it("should clear all app instances", async () => {
      await appInstanceStore.createAppInstance(mockConfig.id);
      await appInstanceStore.clearStore();
      const instance = await appInstanceStore.getAppInstance(mockConfig.id);
      const data = await instance?.edm.getAllEntities();
      expect(data).toEqual([]);
    });
  });
});
