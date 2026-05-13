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
import { v4 as uuidv4 } from "uuid";
import { EntityDataManager } from "../EntityDataManager";
import { EventStoreImpl } from "../EventStore";
import { EntityStoreImpl } from "../EntityStore";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";
import { IndexedDbEntityStorageAdapter } from "../../storage/IndexedDbEntityStorageAdapter";
import { EventApplierService } from "../../services/EventApplierService";
import { SyncLevel } from "../../interfaces/types";

describe("EntityDataManager.purgeEntitiesNotIn", () => {
  let edm: EntityDataManager;
  let eventStore: EventStoreImpl;
  let entityStore: EntityStoreImpl;

  beforeEach(async () => {
    const tenant = `purge-test-${Date.now()}-${Math.random()}`;
    eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter(tenant));
    await eventStore.initialize();
    entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter(tenant));
    await entityStore.initialize();
    const applier = new EventApplierService(eventStore, entityStore);
    edm = new EntityDataManager(eventStore, entityStore, applier);

    // Seed 3 entities
    for (const name of ["alpha", "bravo", "charlie"]) {
      await edm.submitForm({
        guid: uuidv4(),
        entityGuid: `entity-${name}`,
        type: "create-individual",
        data: { name, area_id: "A1" },
        timestamp: new Date().toISOString(),
        userId: "u1",
        syncLevel: SyncLevel.LOCAL,
      });
    }
  });

  afterEach(async () => {
    await entityStore.clearStore();
    await eventStore.clearStore();
  });

  test("purges entities outside the keep set", async () => {
    const result = await edm.purgeEntitiesNotIn(["entity-alpha"]);
    expect(result.purgedEntities).toBe(2);
    expect(result.purgedEvents).toBeGreaterThanOrEqual(2);

    const remaining = await edm.getAllEntities();
    expect(remaining.map((p) => p.modified.guid)).toEqual(["entity-alpha"]);
  });

  test("empty keep set purges everything", async () => {
    const result = await edm.purgeEntitiesNotIn([]);
    expect(result.purgedEntities).toBe(3);
    expect((await edm.getAllEntities()).length).toBe(0);
  });

  test("keep set covering all entities is a no-op", async () => {
    const result = await edm.purgeEntitiesNotIn(["entity-alpha", "entity-bravo", "entity-charlie"]);
    expect(result.purgedEntities).toBe(0);
    expect((await edm.getAllEntities()).length).toBe(3);
  });
});
