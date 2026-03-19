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

import { MockSyncAdapterV2 } from "../MockSyncAdapterV2";
import { runAdapterConformanceTests } from "../../../datacollect/src/interfaces/__tests__/adapterConformance";

describe("MockSyncAdapterV2", () => {
  let adapter: MockSyncAdapterV2;

  beforeEach(() => {
    adapter = new MockSyncAdapterV2();
  });

  describe("descriptor()", () => {
    it("returns correct metadata", () => {
      const descriptor = adapter.descriptor();

      expect(descriptor.type).toBe("mock");
      expect(descriptor.version).toBe("2.0.0");
      expect(descriptor.capabilities).toEqual(["push", "pull"]);
      expect(descriptor.configSchema).toBeDefined();
    });
  });

  describe("initialize()", () => {
    it("succeeds with valid config", async () => {
      await expect(
        adapter.initialize({ type: "mock" }),
      ).resolves.not.toThrow();
    });

    it("succeeds with valid config including latencyMs", async () => {
      await expect(
        adapter.initialize({ type: "mock", latencyMs: 50 }),
      ).resolves.not.toThrow();
    });

    it("throws with invalid type", async () => {
      await expect(
        adapter.initialize({ type: "invalid" }),
      ).rejects.toThrow("Invalid mock config");
    });

    it("throws with missing type", async () => {
      await expect(
        adapter.initialize({}),
      ).rejects.toThrow("Invalid mock config");
    });

    it("throws with non-numeric latencyMs", async () => {
      await expect(
        adapter.initialize({ type: "mock", latencyMs: "fast" }),
      ).rejects.toThrow("Invalid mock config");
    });
  });

  describe("healthCheck()", () => {
    it("returns healthy when initialized", async () => {
      await adapter.initialize({ type: "mock" });

      const result = await adapter.healthCheck();
      expect(result.healthy).toBe(true);
      expect(result.message).toBe("Mock adapter healthy");
    });

    it("returns not healthy when not initialized", async () => {
      const result = await adapter.healthCheck();
      expect(result.healthy).toBe(false);
      expect(result.message).toBe("Not initialized");
    });

    it("reports latency", async () => {
      await adapter.initialize({ type: "mock" });

      const result = await adapter.healthCheck();
      expect(typeof result.latency).toBe("number");
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });
  });

  describe("push()", () => {
    it("stores entities in memory", async () => {
      await adapter.initialize({ type: "mock" });

      const result = await adapter.push([
        {
          guid: "entity-1",
          type: "individual",
          data: { name: "Alice" },
          version: 1,
        },
        {
          guid: "entity-2",
          type: "group",
          data: { name: "Household A" },
          version: 1,
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(2);
      expect(result.failed).toBe(0);
      expect(adapter.getStoredEntityCount()).toBe(2);
    });

    it("returns correct SyncResult counts", async () => {
      await adapter.initialize({ type: "mock" });

      const result = await adapter.push([
        {
          guid: "entity-1",
          type: "individual",
          data: { name: "Alice" },
          version: 1,
        },
      ]);

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(1);
      expect(result.pulled).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.errors).toEqual([]);
      expect(typeof result.duration).toBe("number");
    });

    it("returns success with empty entities", async () => {
      await adapter.initialize({ type: "mock" });

      const result = await adapter.push([]);

      expect(result.success).toBe(true);
      expect(result.pushed).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("updates existing entity when pushed again", async () => {
      await adapter.initialize({ type: "mock" });

      await adapter.push([
        {
          guid: "entity-1",
          type: "individual",
          data: { name: "Alice" },
          version: 1,
        },
      ]);

      await adapter.push([
        {
          guid: "entity-1",
          type: "individual",
          data: { name: "Alice Updated" },
          version: 2,
        },
      ]);

      expect(adapter.getStoredEntityCount()).toBe(1);
      const stored = adapter.getStoredEntity("entity-1");
      expect(stored?.data.name).toBe("Alice Updated");
      expect(stored?.version).toBe(2);
    });

    it("returns error when not initialized", async () => {
      const result = await adapter.push([
        {
          guid: "entity-1",
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
    it("retrieves pushed data", async () => {
      await adapter.initialize({ type: "mock" });

      await adapter.push([
        {
          guid: "entity-1",
          type: "individual",
          data: { name: "Alice" },
          version: 1,
        },
        {
          guid: "entity-2",
          type: "individual",
          data: { name: "Bob" },
          version: 1,
        },
      ]);

      const result = await adapter.pull();

      expect(result.success).toBe(true);
      expect(result.pulled).toBe(2);
      expect(result.pushed).toBe(0);
      expect(result.failed).toBe(0);
    });

    it("returns empty when nothing has been pushed", async () => {
      await adapter.initialize({ type: "mock" });

      const result = await adapter.pull();

      expect(result.success).toBe(true);
      expect(result.pulled).toBe(0);
    });

    it("accepts an optional since parameter", async () => {
      await adapter.initialize({ type: "mock" });

      await adapter.push([
        {
          guid: "entity-1",
          type: "individual",
          data: { name: "Alice" },
          version: 1,
        },
      ]);

      const result = await adapter.pull("2099-01-01T00:00:00.000Z");

      expect(result.success).toBe(true);
      // All entities were pushed before the 'since' date in the far future
      expect(result.pulled).toBe(0);
    });

    it("returns error when not initialized", async () => {
      const result = await adapter.pull();

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe("NOT_INITIALIZED");
    });
  });

  describe("disconnect()", () => {
    it("cleans up state", async () => {
      await adapter.initialize({ type: "mock" });
      await adapter.disconnect();

      // After disconnect, operations should return NOT_INITIALIZED
      const result = await adapter.push([]);
      expect(result.success).toBe(false);
      expect(result.errors[0].code).toBe("NOT_INITIALIZED");
    });

    it("is callable without initialization", async () => {
      await expect(adapter.disconnect()).resolves.not.toThrow();
    });
  });

  describe("test helpers", () => {
    it("getStoredEntity returns correct entity", async () => {
      await adapter.initialize({ type: "mock" });

      await adapter.push([
        {
          guid: "entity-1",
          type: "individual",
          data: { name: "Alice" },
          version: 1,
        },
      ]);

      const stored = adapter.getStoredEntity("entity-1");
      expect(stored).toBeDefined();
      expect(stored?.guid).toBe("entity-1");
      expect(stored?.data.name).toBe("Alice");
    });

    it("getStoredEntity returns undefined for missing entity", async () => {
      await adapter.initialize({ type: "mock" });
      expect(adapter.getStoredEntity("nonexistent")).toBeUndefined();
    });

    it("getAllStoredEntities returns all entities", async () => {
      await adapter.initialize({ type: "mock" });

      await adapter.push([
        { guid: "a", type: "individual", data: {}, version: 1 },
        { guid: "b", type: "group", data: {}, version: 1 },
      ]);

      const all = adapter.getAllStoredEntities();
      expect(all).toHaveLength(2);
    });

    it("clearStorage removes all entities", async () => {
      await adapter.initialize({ type: "mock" });

      await adapter.push([
        { guid: "a", type: "individual", data: {}, version: 1 },
      ]);

      adapter.clearStorage();
      expect(adapter.getStoredEntityCount()).toBe(0);
    });
  });
});

// Run conformance tests
runAdapterConformanceTests(
  "MockSyncAdapterV2",
  () => ({
    adapter: new MockSyncAdapterV2(),
    validConfig: { type: "mock" },
  }),
  { type: "invalid" },
);
