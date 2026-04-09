/**
 * @jest-environment jsdom
 *
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

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { ExportImportManagerImpl } from "../ExportImportManager";
import { EntityStoreImpl } from "../EntityStore";
import { EventStoreImpl } from "../EventStore";
import { IndexedDbEntityStorageAdapter } from "../../storage/IndexedDbEntityStorageAdapter";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";
import { EntityDoc, EntityType, FormSubmission, SyncLevel } from "../../interfaces/types";

describe("ExportImportManager", () => {
  let entityStore: EntityStoreImpl;
  let eventStore: EventStoreImpl;
  let manager: ExportImportManagerImpl;

  const mockEntity: EntityDoc = {
    id: "entity-1",
    guid: "entity-1",
    type: EntityType.Individual,
    version: 1,
    data: { name: "Jane Doe", dateOfBirth: "1990-05-15" },
    lastUpdated: "2025-01-01T00:00:00Z",
  };

  const mockEvent: FormSubmission = {
    guid: "event-1",
    entityGuid: "entity-1",
    type: "create-individual",
    data: { name: "Jane Doe", dateOfBirth: "1990-05-15" },
    timestamp: "1735689600",
    userId: "user-1",
    syncLevel: SyncLevel.LOCAL,
  };

  beforeEach(async () => {
    entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
    eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter());
    await entityStore.initialize();
    await eventStore.initialize();
    manager = new ExportImportManagerImpl(entityStore, eventStore);
  });

  afterEach(async () => {
    await entityStore.clearStore();
    await eventStore.clearStore();
  });

  describe("exportData", () => {
    test("json export produces valid JSON with entities and events", async () => {
      await entityStore.saveEntity(null, mockEntity);
      await eventStore.saveEvent(mockEvent);

      const buffer = await manager.exportData("json");
      const parsed = JSON.parse(buffer.toString());

      expect(parsed).toHaveProperty("entities");
      expect(parsed).toHaveProperty("events");
      expect(parsed.entities).toHaveLength(1);
      expect(parsed.events).toHaveLength(1);
      expect(parsed.entities[0].modified.data.name).toBe("Jane Doe");
      expect(parsed.events[0].type).toBe("create-individual");
    });

    test("json export from empty stores produces empty arrays", async () => {
      const buffer = await manager.exportData("json");
      const parsed = JSON.parse(buffer.toString());

      expect(parsed.entities).toEqual([]);
      expect(parsed.events).toEqual([]);
    });

    test("json export includes multiple entities and events", async () => {
      const secondEntity: EntityDoc = {
        ...mockEntity,
        id: "entity-2",
        guid: "entity-2",
        data: { name: "John Smith" },
      };
      const secondEvent: FormSubmission = {
        ...mockEvent,
        guid: "event-2",
        entityGuid: "entity-2",
        data: { name: "John Smith" },
      };

      await entityStore.saveEntity(null, mockEntity);
      await entityStore.saveEntity(null, secondEntity);
      await eventStore.saveEvent(mockEvent);
      await eventStore.saveEvent(secondEvent);

      const buffer = await manager.exportData("json");
      const parsed = JSON.parse(buffer.toString());

      expect(parsed.entities).toHaveLength(2);
      expect(parsed.events).toHaveLength(2);
    });

    test("binary export throws not implemented error", async () => {
      await expect(manager.exportData("binary")).rejects.toThrow("Binary format not implemented");
    });
  });

  describe("importData", () => {
    test("imports entities and events into empty stores", async () => {
      const data = {
        entities: [{ guid: "entity-1", initial: null, modified: mockEntity }],
        events: [{ ...mockEvent, id: 1 }],
      };
      const buffer = Buffer.from(JSON.stringify(data));

      const result = await manager.importData(buffer);

      expect(result.status).toBe("success");
      expect(result.importedEntities).toBe(1);

      const entities = await entityStore.getAllEntities();
      expect(entities).toHaveLength(1);
      expect(entities[0].modified.data.name).toBe("Jane Doe");

      const events = await eventStore.getAllEvents();
      expect(events).toHaveLength(1);
    });

    test("returns error status for invalid JSON", async () => {
      const buffer = Buffer.from("not valid json{{{");
      const result = await manager.importData(buffer);

      expect(result.status).toBe("error");
      expect(result.importedEntities).toBe(0);
    });

    test("returns error status for malformed data", async () => {
      const buffer = Buffer.from(JSON.stringify({ noEntities: true }));
      const result = await manager.importData(buffer);

      expect(result.status).toBe("error");
      expect(result.importedEntities).toBe(0);
    });
  });

  describe("round-trip", () => {
    test("export then import preserves entity data", async () => {
      await entityStore.saveEntity(null, mockEntity);
      await eventStore.saveEvent(mockEvent);

      const exported = await manager.exportData("json");

      // Import into fresh stores
      const freshEntityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter("round-trip-test"));
      const freshEventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter("round-trip-test"));
      await freshEntityStore.initialize();
      await freshEventStore.initialize();
      const freshManager = new ExportImportManagerImpl(freshEntityStore, freshEventStore);

      const result = await freshManager.importData(exported);
      expect(result.status).toBe("success");
      expect(result.importedEntities).toBe(1);

      const importedEntities = await freshEntityStore.getAllEntities();
      expect(importedEntities).toHaveLength(1);
      expect(importedEntities[0].modified.data).toEqual(mockEntity.data);
      expect(importedEntities[0].modified.guid).toBe(mockEntity.guid);

      const importedEvents = await freshEventStore.getAllEvents();
      expect(importedEvents).toHaveLength(1);
      expect(importedEvents[0].entityGuid).toBe(mockEvent.entityGuid);
      expect(importedEvents[0].type).toBe(mockEvent.type);

      await freshEntityStore.clearStore();
      await freshEventStore.clearStore();
    });

    test("round-trip preserves entity with initial and modified versions", async () => {
      const modifiedEntity: EntityDoc = { ...mockEntity, version: 2, data: { name: "Jane Smith" } };
      await entityStore.saveEntity(mockEntity, modifiedEntity);
      await eventStore.saveEvent(mockEvent);
      await eventStore.saveEvent({
        ...mockEvent,
        guid: "event-2",
        type: "update-individual",
        data: { name: "Jane Smith" },
        timestamp: "1735776000",
      });

      const exported = await manager.exportData("json");

      const freshEntityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter("round-trip-test-2"));
      const freshEventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter("round-trip-test-2"));
      await freshEntityStore.initialize();
      await freshEventStore.initialize();
      const freshManager = new ExportImportManagerImpl(freshEntityStore, freshEventStore);

      const result = await freshManager.importData(exported);
      expect(result.status).toBe("success");

      const importedEntities = await freshEntityStore.getAllEntities();
      expect(importedEntities[0].initial?.data.name).toBe("Jane Doe");
      expect(importedEntities[0].modified.data.name).toBe("Jane Smith");

      const importedEvents = await freshEventStore.getAllEvents();
      expect(importedEvents).toHaveLength(2);

      await freshEntityStore.clearStore();
      await freshEventStore.clearStore();
    });
  });
});
