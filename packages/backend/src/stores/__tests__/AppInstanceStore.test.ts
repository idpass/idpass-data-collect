import "dotenv/config";

import { Pool } from "pg";
import { AppConfigStoreImpl } from "../AppConfigStore";
import { AppInstanceStoreImpl } from "../AppInstanceStore";
import { AppConfig } from "../../types";

const getConnectionString = () => {
  const url = process.env.POSTGRES_TEST;
  if (!url) return "";
  const parsed = new URL(url.replace(/ /g, "%20"));
  const baseName = parsed.pathname.replace(/^\//, "");
  const dbName = baseName ? `${baseName}_app_instance_store` : "datacollect_app_instance_store";
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
};

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

const describeIfPostgres = process.env.POSTGRES_TEST ? describe : describe.skip;

describeIfPostgres("AppInstanceStore", () => {
  let appInstanceStore: AppInstanceStoreImpl;
  let appConfigStore: AppConfigStoreImpl;
  let pool: Pool;

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
    await ensureDatabaseExists(getConnectionString());
    pool = new Pool({
      connectionString: getConnectionString(),
    });
    appConfigStore = new AppConfigStoreImpl(getConnectionString());
    await appConfigStore.initialize();
    await appConfigStore.saveConfig(mockConfig);

    appInstanceStore = new AppInstanceStoreImpl(appConfigStore, getConnectionString());
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
