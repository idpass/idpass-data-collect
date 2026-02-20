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

import {
  ConflictService,
  InMemoryConflictStore,
} from "../ConflictService";

describe("ConflictService", () => {
  let store: InMemoryConflictStore;
  let service: ConflictService;

  beforeEach(() => {
    store = new InMemoryConflictStore();
    service = new ConflictService(store);
  });

  describe("recordConflict()", () => {
    it("creates a conflict record and returns its GUID", async () => {
      const guid = await service.recordConflict({
        entityGuid: "entity-1",
        tenantId: "tenant-1",
        localVersion: { name: "Alice" },
        remoteVersion: { name: "Bob" },
        localEventGuid: "event-local-1",
        remoteEventGuid: "event-remote-1",
      });

      expect(guid).toBeDefined();
      expect(typeof guid).toBe("string");
      expect(guid.length).toBeGreaterThan(0);
    });

    it("stores the conflict with correct fields", async () => {
      const guid = await service.recordConflict({
        entityGuid: "entity-1",
        tenantId: "tenant-1",
        localVersion: { name: "Alice" },
        remoteVersion: { name: "Bob" },
        localEventGuid: "event-local-1",
        remoteEventGuid: "event-remote-1",
      });

      const conflict = await service.getConflict(guid);

      expect(conflict).not.toBeNull();
      expect(conflict!.guid).toBe(guid);
      expect(conflict!.entityGuid).toBe("entity-1");
      expect(conflict!.tenantId).toBe("tenant-1");
      expect(conflict!.localVersion).toEqual({ name: "Alice" });
      expect(conflict!.remoteVersion).toEqual({ name: "Bob" });
      expect(conflict!.localEventGuid).toBe("event-local-1");
      expect(conflict!.remoteEventGuid).toBe("event-remote-1");
      expect(conflict!.detectedAt).toBeDefined();
      expect(conflict!.resolvedAt).toBeNull();
      expect(conflict!.resolution).toBeNull();
      expect(conflict!.resolvedBy).toBeNull();
      expect(conflict!.mergedData).toBeNull();
    });
  });

  describe("getConflict()", () => {
    it("retrieves a recorded conflict", async () => {
      const guid = await service.recordConflict({
        entityGuid: "entity-1",
        tenantId: "tenant-1",
        localVersion: { name: "Alice" },
        remoteVersion: { name: "Bob" },
        localEventGuid: "evt-l",
        remoteEventGuid: "evt-r",
      });

      const conflict = await service.getConflict(guid);
      expect(conflict).not.toBeNull();
      expect(conflict!.entityGuid).toBe("entity-1");
    });

    it("returns null for non-existent conflict", async () => {
      const conflict = await service.getConflict("nonexistent");
      expect(conflict).toBeNull();
    });
  });

  describe("getUnresolvedConflicts()", () => {
    it("returns only unresolved conflicts for the tenant", async () => {
      // Two conflicts for tenant-1
      const guid1 = await service.recordConflict({
        entityGuid: "entity-1",
        tenantId: "tenant-1",
        localVersion: { a: 1 },
        remoteVersion: { a: 2 },
        localEventGuid: "el1",
        remoteEventGuid: "er1",
      });

      await service.recordConflict({
        entityGuid: "entity-2",
        tenantId: "tenant-1",
        localVersion: { b: 1 },
        remoteVersion: { b: 2 },
        localEventGuid: "el2",
        remoteEventGuid: "er2",
      });

      // One conflict for tenant-2
      await service.recordConflict({
        entityGuid: "entity-3",
        tenantId: "tenant-2",
        localVersion: { c: 1 },
        remoteVersion: { c: 2 },
        localEventGuid: "el3",
        remoteEventGuid: "er3",
      });

      // Resolve one conflict for tenant-1
      await service.resolveConflict(guid1, "local", "admin");

      const unresolved = await service.getUnresolvedConflicts("tenant-1");
      expect(unresolved).toHaveLength(1);
      expect(unresolved[0].entityGuid).toBe("entity-2");
    });

    it("returns empty array when no unresolved conflicts", async () => {
      const unresolved = await service.getUnresolvedConflicts("tenant-1");
      expect(unresolved).toEqual([]);
    });
  });

  describe("resolveConflict() with 'local'", () => {
    it("marks the conflict as resolved with local strategy", async () => {
      const guid = await service.recordConflict({
        entityGuid: "entity-1",
        tenantId: "tenant-1",
        localVersion: { name: "Local" },
        remoteVersion: { name: "Remote" },
        localEventGuid: "el",
        remoteEventGuid: "er",
      });

      await service.resolveConflict(guid, "local", "admin-user");

      const conflict = await service.getConflict(guid);
      expect(conflict!.resolution).toBe("local");
      expect(conflict!.resolvedBy).toBe("admin-user");
      expect(conflict!.resolvedAt).toBeDefined();
      expect(conflict!.mergedData).toBeNull();
    });
  });

  describe("resolveConflict() with 'remote'", () => {
    it("marks the conflict as resolved with remote strategy", async () => {
      const guid = await service.recordConflict({
        entityGuid: "entity-1",
        tenantId: "tenant-1",
        localVersion: { name: "Local" },
        remoteVersion: { name: "Remote" },
        localEventGuid: "el",
        remoteEventGuid: "er",
      });

      await service.resolveConflict(guid, "remote", "supervisor");

      const conflict = await service.getConflict(guid);
      expect(conflict!.resolution).toBe("remote");
      expect(conflict!.resolvedBy).toBe("supervisor");
      expect(conflict!.resolvedAt).toBeDefined();
      expect(conflict!.mergedData).toBeNull();
    });
  });

  describe("resolveConflict() with 'merged'", () => {
    it("marks the conflict as resolved with merged data", async () => {
      const guid = await service.recordConflict({
        entityGuid: "entity-1",
        tenantId: "tenant-1",
        localVersion: { name: "Local", age: 30 },
        remoteVersion: { name: "Remote", age: 25 },
        localEventGuid: "el",
        remoteEventGuid: "er",
      });

      const mergedData = { name: "Local", age: 25 };
      await service.resolveConflict(guid, "merged", "admin", mergedData);

      const conflict = await service.getConflict(guid);
      expect(conflict!.resolution).toBe("merged");
      expect(conflict!.resolvedBy).toBe("admin");
      expect(conflict!.resolvedAt).toBeDefined();
      expect(conflict!.mergedData).toEqual({ name: "Local", age: 25 });
    });

    it("throws when mergedData is not provided for merged resolution", async () => {
      const guid = await service.recordConflict({
        entityGuid: "entity-1",
        tenantId: "tenant-1",
        localVersion: { name: "Local" },
        remoteVersion: { name: "Remote" },
        localEventGuid: "el",
        remoteEventGuid: "er",
      });

      await expect(
        service.resolveConflict(guid, "merged", "admin"),
      ).rejects.toThrow("mergedData is required when resolution is 'merged'");
    });
  });

  describe("resolveConflict() error cases", () => {
    it("throws when conflict does not exist", async () => {
      await expect(
        service.resolveConflict("nonexistent", "local", "admin"),
      ).rejects.toThrow("Conflict not found: nonexistent");
    });

    it("throws when conflict is already resolved", async () => {
      const guid = await service.recordConflict({
        entityGuid: "entity-1",
        tenantId: "tenant-1",
        localVersion: { name: "Local" },
        remoteVersion: { name: "Remote" },
        localEventGuid: "el",
        remoteEventGuid: "er",
      });

      await service.resolveConflict(guid, "local", "admin");

      await expect(
        service.resolveConflict(guid, "remote", "another-admin"),
      ).rejects.toThrow(`Conflict already resolved: ${guid}`);
    });
  });

  describe("getConflictCount()", () => {
    it("returns the number of unresolved conflicts for a tenant", async () => {
      await service.recordConflict({
        entityGuid: "e1",
        tenantId: "t1",
        localVersion: {},
        remoteVersion: {},
        localEventGuid: "el1",
        remoteEventGuid: "er1",
      });

      await service.recordConflict({
        entityGuid: "e2",
        tenantId: "t1",
        localVersion: {},
        remoteVersion: {},
        localEventGuid: "el2",
        remoteEventGuid: "er2",
      });

      await service.recordConflict({
        entityGuid: "e3",
        tenantId: "t2",
        localVersion: {},
        remoteVersion: {},
        localEventGuid: "el3",
        remoteEventGuid: "er3",
      });

      expect(await service.getConflictCount("t1")).toBe(2);
      expect(await service.getConflictCount("t2")).toBe(1);
      expect(await service.getConflictCount("nonexistent")).toBe(0);
    });

    it("decreases after resolving a conflict", async () => {
      const guid = await service.recordConflict({
        entityGuid: "e1",
        tenantId: "t1",
        localVersion: {},
        remoteVersion: {},
        localEventGuid: "el",
        remoteEventGuid: "er",
      });

      expect(await service.getConflictCount("t1")).toBe(1);

      await service.resolveConflict(guid, "local", "admin");

      expect(await service.getConflictCount("t1")).toBe(0);
    });
  });

  describe("detectConflict()", () => {
    it("returns true for different data", () => {
      expect(
        service.detectConflict(
          { name: "Alice", age: 30 },
          { name: "Bob", age: 30 },
        ),
      ).toBe(true);
    });

    it("returns false for identical data", () => {
      expect(
        service.detectConflict(
          { name: "Alice", age: 30 },
          { name: "Alice", age: 30 },
        ),
      ).toBe(false);
    });

    it("returns true when keys differ", () => {
      expect(
        service.detectConflict(
          { name: "Alice" },
          { name: "Alice", age: 30 },
        ),
      ).toBe(true);
    });

    it("returns false for empty objects", () => {
      expect(service.detectConflict({}, {})).toBe(false);
    });

    it("handles nested objects", () => {
      expect(
        service.detectConflict(
          { address: { city: "Boston" } },
          { address: { city: "Boston" } },
        ),
      ).toBe(false);

      expect(
        service.detectConflict(
          { address: { city: "Boston" } },
          { address: { city: "New York" } },
        ),
      ).toBe(true);
    });

    it("handles arrays", () => {
      expect(
        service.detectConflict(
          { tags: ["a", "b"] },
          { tags: ["a", "b"] },
        ),
      ).toBe(false);

      expect(
        service.detectConflict(
          { tags: ["a", "b"] },
          { tags: ["a", "c"] },
        ),
      ).toBe(true);

      expect(
        service.detectConflict(
          { tags: ["a", "b"] },
          { tags: ["a"] },
        ),
      ).toBe(true);
    });

    it("handles null and undefined values", () => {
      expect(
        service.detectConflict(
          { name: null as unknown as string },
          { name: null as unknown as string },
        ),
      ).toBe(false);

      expect(
        service.detectConflict(
          { name: null as unknown as string },
          { name: "Alice" },
        ),
      ).toBe(true);
    });
  });
});
