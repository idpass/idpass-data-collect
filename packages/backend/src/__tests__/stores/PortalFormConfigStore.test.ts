/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { PortalFormConfigStoreImpl } from "../../stores/PortalFormConfigStore";

// Mock the pg module so no real database connection is needed
jest.mock("pg", () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };
  const mockPool = {
    connect: jest.fn().mockResolvedValue(mockClient),
    end: jest.fn().mockResolvedValue(undefined),
  };
  return { Pool: jest.fn(() => mockPool) };
});

function getMockClient() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require("pg");
  const pool = new Pool();
  return pool.connect() as Promise<{ query: jest.Mock; release: jest.Mock }>;
}

function getMockPool() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require("pg");
  return new Pool() as { connect: jest.Mock; end: jest.Mock };
}

const NOW = new Date("2024-06-01T12:00:00.000Z");

const baseRow = {
  id: 1,
  app_config_id: "urn:openspp:registrant",
  change_request_type: "address-change",
  formio_schema: { components: [] },
  source_json_schema_hash: "abc123hashvalue",
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
};

describe("PortalFormConfigStoreImpl", () => {
  let store: PortalFormConfigStoreImpl;
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    store = new PortalFormConfigStoreImpl("postgresql://fake/db");
    mockClient = await getMockClient();
  });

  describe("initialize()", () => {
    it("creates the portal_form_configs table", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.initialize();

      expect(mockClient.query).toHaveBeenCalledTimes(1);
      const queryText: string = mockClient.query.mock.calls[0][0];
      expect(queryText).toContain("CREATE TABLE IF NOT EXISTS portal_form_configs");
      expect(queryText).toContain("app_config_id TEXT NOT NULL");
      expect(queryText).toContain("change_request_type TEXT NOT NULL");
      expect(queryText).toContain("formio_schema JSONB NOT NULL");
      expect(queryText).toContain("UNIQUE(app_config_id, change_request_type)");
    });

    it("releases the client after initialization", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.initialize();

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("findByType()", () => {
    it("returns the matching PortalFormConfig when found", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      const result = await store.findByType("urn:openspp:registrant", "address-change");

      expect(result).not.toBeNull();
      expect(result!.id).toBe(1);
      expect(result!.appConfigId).toBe("urn:openspp:registrant");
      expect(result!.changeRequestType).toBe("address-change");
      expect(result!.sourceJsonSchemaHash).toBe("abc123hashvalue");
      expect(result!.createdAt).toEqual(NOW);
    });

    it("returns null when no matching row is found", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await store.findByType("urn:openspp:registrant", "unknown-type");

      expect(result).toBeNull();
    });

    it("uses both app_config_id and change_request_type in WHERE clause", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.findByType("urn:openspp:registrant", "address-change");

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("app_config_id = $1"),
          values: ["urn:openspp:registrant", "address-change"],
        }),
      );
    });

    it("releases the client after findByType", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.findByType("urn:openspp:registrant", "address-change");

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("upsert()", () => {
    it("inserts a new row and returns the mapped PortalFormConfig", async () => {
      const formioSchema = { components: [{ type: "textfield", key: "street", label: "Street" }] };
      mockClient.query.mockResolvedValue({ rows: [{ ...baseRow, formio_schema: formioSchema }] });

      const result = await store.upsert("urn:openspp:registrant", "address-change", formioSchema, "abc123hashvalue");

      expect(result.id).toBe(1);
      expect(result.formioSchema).toEqual(formioSchema);
      expect(result.sourceJsonSchemaHash).toBe("abc123hashvalue");
    });

    it("uses ON CONFLICT ... DO UPDATE for upsert semantics", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      await store.upsert("urn:openspp:registrant", "address-change", {}, "hash1");

      const queryText: string = mockClient.query.mock.calls[0][0].text;
      expect(queryText).toContain("ON CONFLICT");
      expect(queryText).toContain("DO UPDATE SET");
    });

    it("passes formioSchema as JSON string to the query", async () => {
      const formioSchema = { components: [] };
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      await store.upsert("urn:openspp:registrant", "address-change", formioSchema, null);

      const queryValues = mockClient.query.mock.calls[0][0].values;
      expect(queryValues[2]).toBe(JSON.stringify(formioSchema));
    });

    it("accepts null for sourceJsonSchemaHash", async () => {
      mockClient.query.mockResolvedValue({ rows: [{ ...baseRow, source_json_schema_hash: null }] });

      const result = await store.upsert("urn:openspp:registrant", "address-change", {}, null);

      expect(result.sourceJsonSchemaHash).toBeNull();
    });

    it("releases the client after upsert", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      await store.upsert("urn:openspp:registrant", "address-change", {}, "hash");

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("delete()", () => {
    it("removes the matching row by app_config_id and change_request_type", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

      await store.delete("urn:openspp:registrant", "address-change");

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("DELETE FROM portal_form_configs"),
          values: ["urn:openspp:registrant", "address-change"],
        }),
      );
    });

    it("releases the client after delete", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

      await store.delete("urn:openspp:registrant", "address-change");

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("clearStore()", () => {
    it("truncates the portal_form_configs table", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.clearStore();

      expect(mockClient.query).toHaveBeenCalledWith("TRUNCATE TABLE portal_form_configs");
    });

    it("releases the client after clearStore", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.clearStore();

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("findAll()", () => {
    it("returns all PortalFormConfigs for the given appConfigId", async () => {
      const secondRow = {
        ...baseRow,
        id: 2,
        change_request_type: "name-change",
      };
      mockClient.query.mockResolvedValue({ rows: [baseRow, secondRow] });

      const results = await store.findAll("urn:openspp:registrant");

      expect(results).toHaveLength(2);
      expect(results[0].changeRequestType).toBe("address-change");
      expect(results[1].changeRequestType).toBe("name-change");
    });

    it("returns an empty array when no configs exist for the appConfigId", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const results = await store.findAll("urn:openspp:registrant");

      expect(results).toEqual([]);
    });

    it("queries by app_config_id only", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.findAll("urn:openspp:registrant");

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("app_config_id = $1"),
          values: ["urn:openspp:registrant"],
        }),
      );
    });

    it("maps each row to a PortalFormConfig with correct fields", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      const results = await store.findAll("urn:openspp:registrant");

      expect(results[0]).toMatchObject({
        id: 1,
        appConfigId: "urn:openspp:registrant",
        changeRequestType: "address-change",
        sourceJsonSchemaHash: "abc123hashvalue",
        createdAt: NOW,
      });
    });

    it("releases the client after findAll", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.findAll("urn:openspp:registrant");

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("closeConnection()", () => {
    it("ends the pool connection", async () => {
      const mockPool = getMockPool();

      await store.closeConnection();

      expect(mockPool.end).toHaveBeenCalledTimes(1);
    });
  });
});
