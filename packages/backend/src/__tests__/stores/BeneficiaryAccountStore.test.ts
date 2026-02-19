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

import { BeneficiaryAccountStoreImpl } from "../../stores/BeneficiaryAccountStore";

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

const NOW = new Date("2024-01-15T10:00:00.000Z");

const baseRow = {
  id: 1,
  app_config_id: "config-1",
  keycloak_subject: "sub-abc123",
  email: "alice@example.com",
  display_name: "Alice Smith",
  registrant_system: null,
  registrant_value: null,
  consent_accepted_at: null,
  linked_at: null,
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
};

describe("BeneficiaryAccountStoreImpl", () => {
  let store: BeneficiaryAccountStoreImpl;
  let mockClient: { query: jest.Mock; release: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    store = new BeneficiaryAccountStoreImpl("postgresql://fake/db");
    mockClient = await getMockClient();
  });

  describe("initialize()", () => {
    it("creates the beneficiary_accounts table", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.initialize();

      expect(mockClient.query).toHaveBeenCalledTimes(2);
      const firstCall: string = mockClient.query.mock.calls[0][0];
      expect(firstCall).toContain("CREATE TABLE IF NOT EXISTS beneficiary_accounts");
      expect(firstCall).toContain("app_config_id TEXT NOT NULL");
      expect(firstCall).toContain("keycloak_subject TEXT NOT NULL");
      expect(firstCall).toContain("UNIQUE(app_config_id, keycloak_subject)");
    });

    it("creates the registrant index", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.initialize();

      const secondCall: string = mockClient.query.mock.calls[1][0];
      expect(secondCall).toContain("CREATE INDEX IF NOT EXISTS idx_beneficiary_registrant");
      expect(secondCall).toContain("registrant_system, registrant_value");
    });

    it("releases the client after initialization", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.initialize();

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("create()", () => {
    it("inserts a new account and returns the mapped BeneficiaryAccount", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      const result = await store.create({
        appConfigId: "config-1",
        keycloakSubject: "sub-abc123",
        email: "alice@example.com",
        displayName: "Alice Smith",
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("INSERT INTO beneficiary_accounts"),
          values: ["config-1", "sub-abc123", "alice@example.com", "Alice Smith"],
        }),
      );
      expect(result.id).toBe(1);
      expect(result.appConfigId).toBe("config-1");
      expect(result.keycloakSubject).toBe("sub-abc123");
      expect(result.email).toBe("alice@example.com");
      expect(result.displayName).toBe("Alice Smith");
      expect(result.registrantSystem).toBeNull();
      expect(result.registrantValue).toBeNull();
      expect(result.consentAcceptedAt).toBeNull();
      expect(result.linkedAt).toBeNull();
      expect(result.createdAt).toEqual(NOW);
      expect(result.updatedAt).toEqual(NOW);
    });

    it("uses null for optional fields when not provided", async () => {
      mockClient.query.mockResolvedValue({ rows: [{ ...baseRow, email: null, display_name: null }] });

      await store.create({
        appConfigId: "config-1",
        keycloakSubject: "sub-abc123",
      });

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          values: ["config-1", "sub-abc123", null, null],
        }),
      );
    });

    it("releases the client after create", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      await store.create({ appConfigId: "config-1", keycloakSubject: "sub-abc123" });

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("findByKeycloakSubject()", () => {
    it("returns the account when found", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      const result = await store.findByKeycloakSubject("config-1", "sub-abc123");

      expect(result).not.toBeNull();
      expect(result?.id).toBe(1);
      expect(result?.appConfigId).toBe("config-1");
      expect(result?.keycloakSubject).toBe("sub-abc123");
    });

    it("includes app_config_id in the WHERE clause for multi-tenancy isolation", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      await store.findByKeycloakSubject("config-1", "sub-abc123");

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("app_config_id = $1"),
          values: ["config-1", "sub-abc123"],
        }),
      );
    });

    it("returns null when no account matches", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await store.findByKeycloakSubject("config-1", "unknown-sub");

      expect(result).toBeNull();
    });

    it("releases the client after findByKeycloakSubject", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.findByKeycloakSubject("config-1", "sub-abc123");

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("findById()", () => {
    it("returns the account when found by id", async () => {
      mockClient.query.mockResolvedValue({ rows: [baseRow] });

      const result = await store.findById(1);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(1);
    });

    it("returns null when no account matches the id", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await store.findById(999);

      expect(result).toBeNull();
    });

    it("releases the client after findById", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.findById(1);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("updateConsent()", () => {
    it("sets consent_accepted_at and updated_at on the matching account", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

      await store.updateConsent(1);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("consent_accepted_at = NOW()"),
          values: [1],
        }),
      );
    });

    it("also updates updated_at during consent update", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

      await store.updateConsent(1);

      const queryText: string = mockClient.query.mock.calls[0][0].text;
      expect(queryText).toContain("updated_at = NOW()");
    });

    it("releases the client after updateConsent", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

      await store.updateConsent(1);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("linkRegistrant()", () => {
    it("sets registrant fields and linked_at on the matching account", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

      await store.linkRegistrant(1, "openspp", "REG-001");

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("registrant_system = $2"),
          values: [1, "openspp", "REG-001"],
        }),
      );
    });

    it("sets linked_at and updated_at during registrant link", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

      await store.linkRegistrant(1, "openspp", "REG-001");

      const queryText: string = mockClient.query.mock.calls[0][0].text;
      expect(queryText).toContain("linked_at = NOW()");
      expect(queryText).toContain("updated_at = NOW()");
    });

    it("releases the client after linkRegistrant", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

      await store.linkRegistrant(1, "openspp", "REG-001");

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("delete()", () => {
    it("removes the account with the given id", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

      await store.delete(1);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("DELETE FROM beneficiary_accounts"),
          values: [1],
        }),
      );
    });

    it("releases the client after delete", async () => {
      mockClient.query.mockResolvedValue({ rowCount: 1, rows: [] });

      await store.delete(1);

      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe("clearStore()", () => {
    it("truncates the beneficiary_accounts table", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.clearStore();

      expect(mockClient.query).toHaveBeenCalledWith("TRUNCATE TABLE beneficiary_accounts");
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

  describe("multi-tenancy isolation", () => {
    it("findByKeycloakSubject scopes by app_config_id preventing cross-tenant access", async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      await store.findByKeycloakSubject("tenant-a", "sub-shared");
      await store.findByKeycloakSubject("tenant-b", "sub-shared");

      const firstCallValues = mockClient.query.mock.calls[0][0].values;
      const secondCallValues = mockClient.query.mock.calls[1][0].values;

      // Both queries include the app_config_id as the first parameter
      expect(firstCallValues[0]).toBe("tenant-a");
      expect(secondCallValues[0]).toBe("tenant-b");
    });
  });
});
