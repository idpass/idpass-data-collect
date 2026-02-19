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

// Mock the pino logger from datacollect. The moduleNameMapper resolves
// @idpass/data-collect-core to ../../datacollect/src/index.ts, so the
// logger module path must be relative to the datacollect source tree.
jest.mock("../../../datacollect/src/utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn().mockReturnThis(),
  }),
}));

import type { EventStore, ExternalSyncConfig, EntityPair } from "@idpass/data-collect-core";
import { EntityType } from "@idpass/data-collect-core";
import { EventApplierService } from "@idpass/data-collect-core";
import { OpenSppSyncAdapterV2 } from "../OpenSppSyncAdapterV2";
import { runAdapterConformanceTests } from "../../../datacollect/src/interfaces/__tests__/adapterConformance";

const mockOdooClientImplementation = {
  login: jest.fn(),
  addMembersToGroup: jest.fn(),
  createHousehold: jest.fn().mockResolvedValue(200),
  createIndividual: jest.fn().mockResolvedValue(300),
  create: jest.fn().mockResolvedValue(400),
  fetchHouseholdsSince: jest.fn().mockResolvedValue([]),
  fetchIndividualsSince: jest.fn().mockResolvedValue([]),
  write: jest.fn().mockResolvedValue(true),
  isAuthenticated: jest.fn().mockReturnValue(true),
};

jest.mock("../OdooClient", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockOdooClientImplementation),
  };
});

function createMocks() {
  const eventStore = {
    getAllEvents: jest.fn(),
    getEventsSince: jest.fn(),
    getLastPushExternalSyncTimestamp: jest.fn().mockResolvedValue("1970-01-01T00:00:00.000Z"),
    setLastPushExternalSyncTimestamp: jest.fn(),
    getLastPullExternalSyncTimestamp: jest.fn().mockResolvedValue("1970-01-01T00:00:00.000Z"),
    setLastPullExternalSyncTimestamp: jest.fn(),
  } as unknown as jest.Mocked<EventStore>;

  const mockEntityStore = {
    getEntityByExternalId: jest.fn().mockResolvedValue(null),
    getAllEntities: jest.fn().mockResolvedValue([]),
    getEntity: jest.fn().mockResolvedValue(null),
    saveEntity: jest.fn(),
  };

  const eventApplierService = {
    submitForm: jest.fn(),
    getEntityStore: jest.fn().mockReturnValue(mockEntityStore),
  } as unknown as jest.Mocked<EventApplierService>;

  const config: ExternalSyncConfig = {
    type: "openspp",
    url: "http://openspp.example.com",
    extraFields: [
      { name: "database", value: "openspp" },
      { name: "username", value: "test" },
      { name: "password", value: "secret" },
      { name: "registrarGroup", value: "g2p.group.registrar" },
    ],
  };

  return { eventStore, eventApplierService, mockEntityStore, config };
}

describe("OpenSppSyncAdapterV2", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("descriptor()", () => {
    it("returns correct metadata", () => {
      const { eventStore, eventApplierService, config } = createMocks();
      const adapter = new OpenSppSyncAdapterV2(eventStore, eventApplierService, config);
      const descriptor = adapter.descriptor();

      expect(descriptor.type).toBe("openspp");
      expect(descriptor.version).toBe("2.0.0");
      expect(descriptor.capabilities).toEqual(["push", "pull"]);
      expect(descriptor.configSchema).toBeDefined();
    });
  });

  describe("initialize()", () => {
    it("succeeds with valid config", async () => {
      const { eventStore, eventApplierService, config } = createMocks();
      const adapter = new OpenSppSyncAdapterV2(eventStore, eventApplierService, config);

      await expect(
        adapter.initialize({
          url: "http://openspp.example.com",
          database: "openspp",
          username: "test",
          password: "secret",
        }),
      ).resolves.not.toThrow();

      expect(mockOdooClientImplementation.login).toHaveBeenCalled();
    });

    it("throws with missing required fields", async () => {
      const { eventStore, eventApplierService, config } = createMocks();
      const adapter = new OpenSppSyncAdapterV2(eventStore, eventApplierService, config);

      await expect(
        adapter.initialize({ url: "http://example.com" }),
      ).rejects.toThrow("Invalid OpenSPP config");
    });

    it("throws with empty strings", async () => {
      const { eventStore, eventApplierService, config } = createMocks();
      const adapter = new OpenSppSyncAdapterV2(eventStore, eventApplierService, config);

      await expect(
        adapter.initialize({
          url: "",
          database: "",
          username: "",
          password: "",
        }),
      ).rejects.toThrow("Invalid OpenSPP config");
    });
  });

  describe("healthCheck()", () => {
    it("returns healthy when authenticated", async () => {
      const { eventStore, eventApplierService, config } = createMocks();
      const adapter = new OpenSppSyncAdapterV2(eventStore, eventApplierService, config);

      await adapter.initialize({
        url: "http://openspp.example.com",
        database: "openspp",
        username: "test",
        password: "secret",
      });

      const result = await adapter.healthCheck();
      expect(result.healthy).toBe(true);
      expect(result.message).toBe("Connected to OpenSPP");
    });

    it("returns not healthy when not initialized", async () => {
      const { eventStore, eventApplierService, config } = createMocks();
      const adapter = new OpenSppSyncAdapterV2(eventStore, eventApplierService, config);

      const result = await adapter.healthCheck();
      expect(result.healthy).toBe(false);
      expect(result.message).toBe("Not initialized");
    });
  });

  describe("push()", () => {
    it("returns success with empty entities", async () => {
      const { eventStore, eventApplierService, config } = createMocks();
      const adapter = new OpenSppSyncAdapterV2(eventStore, eventApplierService, config);

      await adapter.initialize({
        url: "http://openspp.example.com",
        database: "openspp",
        username: "test",
        password: "secret",
      });

      const result = await adapter.push([]);

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("pushes individual entities", async () => {
      const { eventStore, eventApplierService, config, mockEntityStore } = createMocks();
      const adapter = new OpenSppSyncAdapterV2(eventStore, eventApplierService, config);

      mockOdooClientImplementation.createIndividual.mockResolvedValue(300);
      mockEntityStore.getEntity.mockResolvedValue(null);

      await adapter.initialize({
        url: "http://openspp.example.com",
        database: "openspp",
        username: "test",
        password: "secret",
      });

      const result = await adapter.push([
        {
          guid: "individual-1",
          type: "individual",
          data: { first_name: "Jane", last_name: "Doe" },
          version: 1,
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockOdooClientImplementation.createIndividual).toHaveBeenCalled();
    });

    it("skips non-individual entity types", async () => {
      const { eventStore, eventApplierService, config } = createMocks();
      const adapter = new OpenSppSyncAdapterV2(eventStore, eventApplierService, config);

      await adapter.initialize({
        url: "http://openspp.example.com",
        database: "openspp",
        username: "test",
        password: "secret",
      });

      const result = await adapter.push([
        {
          guid: "group-1",
          type: "group",
          data: { name: "Test Group" },
          version: 1,
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(0);
      expect(result.skipped).toBe(1);
    });

    it("returns error when not initialized", async () => {
      const { eventStore, eventApplierService, config } = createMocks();
      const adapter = new OpenSppSyncAdapterV2(eventStore, eventApplierService, config);

      const result = await adapter.push([
        {
          guid: "individual-1",
          type: "individual",
          data: {},
          version: 1,
        },
      ]);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe("NOT_INITIALIZED");
    });
  });

  describe("pull()", () => {
    it("pulls and transforms individuals", async () => {
      const { eventStore, eventApplierService, config } = createMocks();
      const adapter = new OpenSppSyncAdapterV2(eventStore, eventApplierService, config);

      const mockIndividuals = [
        {
          id: 201,
          given_name: "John",
          family_name: "Doe",
          name: "John Doe",
          is_group: false,
          is_registrant: true,
          gender: "male",
          birthdate: "1990-01-01",
          write_date: "2024-01-15T10:00:00.000Z",
        },
      ];

      mockOdooClientImplementation.fetchIndividualsSince.mockResolvedValue(mockIndividuals);

      await adapter.initialize({
        url: "http://openspp.example.com",
        database: "openspp",
        username: "test",
        password: "secret",
      });

      const result = await adapter.pull();

      expect(result.success).toBe(true);
      expect(result.pulled).toBe(1);
      expect(result.failed).toBe(0);
      expect(eventApplierService.submitForm).toHaveBeenCalled();
    });

    it("returns error when not initialized", async () => {
      const { eventStore, eventApplierService, config } = createMocks();
      const adapter = new OpenSppSyncAdapterV2(eventStore, eventApplierService, config);

      const result = await adapter.pull();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe("NOT_INITIALIZED");
    });

    it("handles fetch errors gracefully", async () => {
      const { eventStore, eventApplierService, config } = createMocks();
      const adapter = new OpenSppSyncAdapterV2(eventStore, eventApplierService, config);

      mockOdooClientImplementation.fetchIndividualsSince.mockRejectedValue(new Error("Network error"));

      await adapter.initialize({
        url: "http://openspp.example.com",
        database: "openspp",
        username: "test",
        password: "secret",
      });

      const result = await adapter.pull();

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.code === "PULL_FETCH_FAILED")).toBe(true);
    });
  });

  describe("disconnect()", () => {
    it("cleans up resources", async () => {
      const { eventStore, eventApplierService, config } = createMocks();
      const adapter = new OpenSppSyncAdapterV2(eventStore, eventApplierService, config);

      await adapter.initialize({
        url: "http://openspp.example.com",
        database: "openspp",
        username: "test",
        password: "secret",
      });

      await adapter.disconnect();

      // After disconnect, push should return NOT_INITIALIZED
      const result = await adapter.push([]);
      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe("NOT_INITIALIZED");
    });
  });
});

// Run conformance tests
runAdapterConformanceTests(
  "OpenSppSyncAdapterV2",
  () => {
    const { eventStore, eventApplierService, config } = createMocks();
    return {
      adapter: new OpenSppSyncAdapterV2(eventStore, eventApplierService, config),
      validConfig: {
        url: "http://openspp.example.com",
        database: "openspp",
        username: "test",
        password: "secret",
      },
    };
  },
  { url: "" },
);
