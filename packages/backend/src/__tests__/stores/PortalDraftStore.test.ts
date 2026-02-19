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

import { PortalDraftStoreImpl } from "../../stores/PortalDraftStore";

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

const NOW = new Date("2024-07-10T14:00:00.000Z");

const baseRow = {
  id: "draft-uuid-001",
  beneficiary_account_id: 42,
  change_request_type: "address-change",
  form_data: { street: "123 Main St", city: "Anytown" },
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
};

describe("PortalDraftStoreImpl", () => {
  let store: PortalDraftStoreImpl;
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    store = new PortalDraftStoreImpl("postgresql://fake/db");
    mockClient = await getMockClient();
  });

  describe("initialize()", () => {
    it("creates the portal_drafts table", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.initialize();

      expect(mockClient.query).toHaveBeenCalledTimes(2);
      const firstCall: string = mockClient.query.mock.calls[0][0];
      expect(firstCall).toContain("CREATE TABLE IF NOT EXISTS portal_drafts");
      expect(firstCall).toContain("id TEXT PRIMARY KEY");
      expect(firstCall).toContain("beneficiary_account_id INTEGER NOT NULL");
      expect(firstCall).toContain("change_request_type TEXT NOT NULL");
      expect(firstCall).toContain("form_data JSONB NOT NULL");
    });

    it("creates the account index", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.initialize();

      const secondCall: string = mockClient.query.mock.calls[1][0];
      expect(secondCall).toContain("CREATE INDEX IF NOT EXISTS idx_portal_drafts_account");
      expect(secondCall).toContain("beneficiary_account_id");
    });

    it("includes ON DELETE CASCADE for the foreign key constraint", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.initialize();

      const firstCall: string = mockClient.query.mock.calls[0][0];
      expect(firstCall).toContain("ON DELETE CASCADE");
    });

    it("releases the client after initialization", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.initialize();

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("findByAccountId()", () => {
    it("returns an array of drafts for the given account", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      const result = await store.findByAccountId(42);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("draft-uuid-001");
      expect(result[0].beneficiaryAccountId).toBe(42);
      expect(result[0].changeRequestType).toBe("address-change");
      expect(result[0].formData).toEqual({ street: "123 Main St", city: "Anytown" });
      expect(result[0].createdAt).toEqual(NOW);
      expect(result[0].updatedAt).toEqual(NOW);
    });

    it("returns an empty array when no drafts exist for the account", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await store.findByAccountId(99);

      expect(result).toEqual([]);
    });

    it("queries by beneficiary_account_id", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.findByAccountId(42);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("beneficiary_account_id = $1"),
          values: [42],
        }),
      );
    });

    it("releases the client after findByAccountId", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.findByAccountId(42);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("findById()", () => {
    it("returns the draft when found", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      const result = await store.findById("draft-uuid-001");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("draft-uuid-001");
      expect(result!.beneficiaryAccountId).toBe(42);
    });

    it("returns null when no draft matches the id", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await store.findById("nonexistent-id");

      expect(result).toBeNull();
    });

    it("queries by id", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      await store.findById("draft-uuid-001");

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("WHERE id = $1"),
          values: ["draft-uuid-001"],
        }),
      );
    });

    it("releases the client after findById", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.findById("draft-uuid-001");

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("upsert()", () => {
    it("inserts a new draft and returns the mapped PortalDraft", async () => {
      const formData = { street: "456 Oak Ave" };
      mockClient.query.mockResolvedValue({ rows: [{ ...baseRow, form_data: formData }] });

      const result = await store.upsert("draft-uuid-001", 42, "address-change", formData);

      expect(result.id).toBe("draft-uuid-001");
      expect(result.beneficiaryAccountId).toBe(42);
      expect(result.changeRequestType).toBe("address-change");
      expect(result.formData).toEqual(formData);
    });

    it("uses ON CONFLICT for upsert semantics", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      await store.upsert("draft-uuid-001", 42, "address-change", {});

      const queryText: string = mockClient.query.mock.calls[0][0].text;
      expect(queryText).toContain("ON CONFLICT");
      expect(queryText).toContain("DO UPDATE SET");
    });

    it("passes formData as JSON string to the query", async () => {
      const formData = { name: "Alice" };
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      await store.upsert("draft-uuid-001", 42, "name-change", formData);

      const queryValues = mockClient.query.mock.calls[0][0].values;
      expect(queryValues[3]).toBe(JSON.stringify(formData));
    });

    it("updates updated_at on conflict", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      await store.upsert("draft-uuid-001", 42, "address-change", {});

      const queryText: string = mockClient.query.mock.calls[0][0].text;
      expect(queryText).toContain("updated_at = NOW()");
    });

    it("releases the client after upsert", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      await store.upsert("draft-uuid-001", 42, "address-change", {});

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("delete()", () => {
    it("removes the draft with the given id", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

      await store.delete("draft-uuid-001");

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("DELETE FROM portal_drafts"),
          values: ["draft-uuid-001"],
        }),
      );
    });

    it("releases the client after delete", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

      await store.delete("draft-uuid-001");

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteExpired()", () => {
    it("deletes drafts older than the given TTL in days", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 3, rows: [] });

      const count = await store.deleteExpired(30);

      expect(count).toBe(3);
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("DELETE FROM portal_drafts"),
          values: [30],
        }),
      );
    });

    it("uses an interval based on the ttlDays parameter", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });

      await store.deleteExpired(7);

      const queryText: string = mockClient.query.mock.calls[0][0].text;
      expect(queryText).toContain("updated_at < NOW()");
      expect(mockClient.query.mock.calls[0][0].values).toContain(7);
    });

    it("returns 0 when no rows were deleted", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });

      const count = await store.deleteExpired(30);

      expect(count).toBe(0);
    });

    it("handles null rowCount from pg by returning 0", async () => {
      mockClient.query.mockResolvedValue({ rowCount: null, rows: [] });

      const count = await store.deleteExpired(30);

      expect(count).toBe(0);
    });

    it("releases the client after deleteExpired", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 0, rows: [] });

      await store.deleteExpired(30);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("clearStore()", () => {
    it("truncates the portal_drafts table", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.clearStore();

      expect(mockClient.query).toHaveBeenCalledWith("TRUNCATE TABLE portal_drafts");
    });

    it("releases the client after clearStore", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.clearStore();

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

  describe("data mapping", () => {
    it("correctly maps all snake_case columns to camelCase properties", async () => {
      const row = {
        id: "draft-xyz",
        beneficiary_account_id: 7,
        change_request_type: "name-change",
        form_data: { firstName: "Bob" },
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-02-01T00:00:00.000Z",
      };
      mockClient.query.mockResolvedValue({ rows: [row] });

      const result = await store.findById("draft-xyz");

      expect(result!.id).toBe("draft-xyz");
      expect(result!.beneficiaryAccountId).toBe(7);
      expect(result!.changeRequestType).toBe("name-change");
      expect(result!.formData).toEqual({ firstName: "Bob" });
      expect(result!.createdAt).toEqual(new Date("2024-01-01T00:00:00.000Z"));
      expect(result!.updatedAt).toEqual(new Date("2024-02-01T00:00:00.000Z"));
    });
  });
});
