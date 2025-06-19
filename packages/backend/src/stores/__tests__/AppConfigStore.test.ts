import dotenv from "dotenv";

import { Pool } from "pg";
import { AppConfigStoreImpl } from "../AppConfigStore";
import { AppConfig } from "../../types";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

describe("AppConfigStore", () => {
  let adapter: AppConfigStoreImpl;
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.POSTGRES_TEST || "",
    });
    adapter = new AppConfigStoreImpl(process.env.POSTGRES_TEST || "");
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.clearStore();
  });

  afterAll(async () => {
    await adapter.clearStore();
    await adapter.closeConnection();
    await pool.end();
  });

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
    authConfigs: [
      {
        type: "jwt",
        secret: "test-secret",
        expiresIn: "1h",
      },
    ],
  };

  describe("saveConfig", () => {
    it("should save a config successfully", async () => {
      await adapter.saveConfig(mockConfig);
      const configs = await adapter.getConfigs();
      expect(configs).toHaveLength(1);
      expect(configs[0]).toMatchObject(mockConfig);
      expect(configs[0].id).toMatch("test-config-1");
      expect(configs[0].authConfigs).toEqual(mockConfig.authConfigs);
    });

    it("should update an existing config", async () => {
      await adapter.saveConfig(mockConfig);
      const configs = await adapter.getConfigs();
      const savedConfig = configs[0];

      const updatedConfig = {
        ...savedConfig,
        name: "Updated Config",
        version: "2.0.0",
      };

      await adapter.saveConfig(updatedConfig);
      const updatedConfigs = await adapter.getConfigs();
      expect(updatedConfigs).toHaveLength(1);
      expect(updatedConfigs[0].name).toBe("Updated Config");
      expect(updatedConfigs[0].version).toBe("2.0.0");
      expect(updatedConfigs[0].id).toBe(savedConfig.id);
    });

    it("should handle configs with null optional fields", async () => {
      const configWithNulls = {
        ...mockConfig,
        description: undefined,
        version: undefined,
        url: undefined,
      };

      await adapter.saveConfig(configWithNulls);
      const configs = await adapter.getConfigs();
      expect(configs[0].description).toBeNull();
      expect(configs[0].version).toBeNull();
      expect(configs[0].url).toBeNull();
    });
  });

  describe("getConfig", () => {
    it("should retrieve a saved config by id", async () => {
      await adapter.saveConfig(mockConfig);
      const configs = await adapter.getConfigs();
      const savedConfig = configs[0];

      const config = await adapter.getConfig(savedConfig.id);
      expect(config).toEqual(savedConfig);
    });

    it("should throw error when config not found", async () => {
      await expect(adapter.getConfig("non-existent-id")).rejects.toThrow("Config with id non-existent-id not found");
    });

    it("should properly handle JSON fields", async () => {
      await adapter.saveConfig(mockConfig);
      const configs = await adapter.getConfigs();
      const savedConfig = configs[0];
      expect(savedConfig.entityForms).toEqual(mockConfig.entityForms);
    });
  });

  describe("getConfigs", () => {
    it("should return empty array when no configs exist", async () => {
      const configs = await adapter.getConfigs();
      expect(configs).toEqual([]);
    });

    it("should return all saved configs", async () => {
      const mockConfig2 = {
        ...mockConfig,
        name: "Test Config 2",
        id: "test-config-2",
      };

      await adapter.saveConfig(mockConfig);
      await adapter.saveConfig(mockConfig2);

      const configs = await adapter.getConfigs();
      expect(configs).toHaveLength(2);
      expect(configs.map((c) => c.id)).toEqual(expect.arrayContaining(["test-config-1", "test-config-2"]));
    });
  });

  describe("deleteConfig", () => {
    it("should delete an existing config", async () => {
      await adapter.saveConfig(mockConfig);
      const configs = await adapter.getConfigs();
      const savedConfig = configs[0];

      await adapter.deleteConfig(savedConfig.id);
      await expect(adapter.getConfig(savedConfig.id)).rejects.toThrow(`Config with id ${savedConfig.id} not found`);
    });

    it("should not throw when deleting non-existent config", async () => {
      await expect(adapter.deleteConfig("non-existent-id")).resolves.not.toThrow();
    });
  });

  describe("clearStore", () => {
    it("should remove all configs from store", async () => {
      await adapter.saveConfig(mockConfig);
      await adapter.saveConfig({ ...mockConfig, name: "Test Config 2" });

      await adapter.clearStore();
      const configs = await adapter.getConfigs();
      expect(configs).toHaveLength(0);
    });
  });

  describe("error handling", () => {
    it("should handle database connection errors", async () => {
      const badAdapter = new AppConfigStoreImpl("postgresql://bad:connection@string");
      await expect(badAdapter.initialize()).rejects.toThrow();
    }, 10000);
  });

  describe("initialization", () => {
    it("should create table if it doesn't exist", async () => {
      // Drop the table if it exists
      await pool.query("DROP TABLE IF EXISTS app_configs");

      // Create a new adapter and initialize
      const newAdapter = new AppConfigStoreImpl(process.env.POSTGRES_TEST || "");
      await newAdapter.initialize();

      // Try to save a config to verify table exists
      await expect(newAdapter.saveConfig(mockConfig)).resolves.not.toThrow();

      await newAdapter.clearStore();
      await newAdapter.closeConnection();
    });
  });
});
