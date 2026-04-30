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

import axios, { type AxiosInstance } from "axios";
import MockAdapter from "axios-mock-adapter";
import { createActor } from "xstate";
import { createSyncMachine } from "../internalSync/syncMachine";
import type { SyncMachineInput } from "../internalSync/types";
import type {
  EventStore,
  EntityStore,
  AuthStorageAdapter,
  FormSubmission,
} from "../../interfaces/types";
import type { EventApplierService } from "../../services/EventApplierService";

function createMockEventStore(): EventStore {
  return {
    initialize: jest.fn(),
    saveEvent: jest.fn().mockResolvedValue("event-id"),
    getEvents: jest.fn().mockResolvedValue([]),
    getAllEvents: jest.fn().mockResolvedValue([]),
    getLatestHash: jest.fn().mockReturnValue(""),
    verifyHashChain: jest.fn().mockResolvedValue(true),
    logAuditEntry: jest.fn(),
    saveAuditLogs: jest.fn(),
    updateEventSyncLevel: jest.fn(),
    updateAuditLogSyncLevel: jest.fn(),
    getAuditLogsSince: jest.fn().mockResolvedValue([]),
    getEventsSince: jest.fn().mockResolvedValue([]),
    getEventsSincePagination: jest.fn().mockResolvedValue({ events: [], nextCursor: null }),
    updateSyncLevelFromEvents: jest.fn(),
    getLastRemoteSyncTimestamp: jest.fn().mockResolvedValue(""),
    setLastRemoteSyncTimestamp: jest.fn().mockResolvedValue(undefined),
    getLastLocalSyncTimestamp: jest.fn().mockResolvedValue(""),
    setLastLocalSyncTimestamp: jest.fn().mockResolvedValue(undefined),
    getLastPullExternalSyncTimestamp: jest.fn().mockResolvedValue(""),
    setLastPullExternalSyncTimestamp: jest.fn().mockResolvedValue(undefined),
    getLastPushExternalSyncTimestamp: jest.fn().mockResolvedValue(""),
    setLastPushExternalSyncTimestamp: jest.fn().mockResolvedValue(undefined),
    isEventExisted: jest.fn().mockResolvedValue(false),
    getAuditTrailByEntityGuid: jest.fn().mockResolvedValue([]),
    deleteEventsForEntity: jest.fn().mockResolvedValue(0),
    getLastScopeHash: jest.fn().mockResolvedValue(null),
    setLastScopeHash: jest.fn().mockResolvedValue(undefined),
    clearStore: jest.fn(),
    closeConnection: jest.fn(),
  };
}

function createMockEntityStore(): EntityStore {
  return {
    initialize: jest.fn(),
    saveEntity: jest.fn(),
    getEntity: jest.fn().mockResolvedValue(null),
    getEntityByExternalId: jest.fn().mockResolvedValue(null),
    searchEntities: jest.fn().mockResolvedValue([]),
    getAllEntities: jest.fn().mockResolvedValue([]),
    getModifiedEntitiesSince: jest.fn().mockResolvedValue([]),
    markEntityAsSynced: jest.fn(),
    deleteEntity: jest.fn(),
    savePotentialDuplicates: jest.fn(),
    getPotentialDuplicates: jest.fn().mockResolvedValue([]),
    resolvePotentialDuplicates: jest.fn(),
    clearStore: jest.fn(),
    closeConnection: jest.fn(),
  };
}

function createMockEventApplierService(): EventApplierService {
  return {
    submitForm: jest.fn(),
    registerEventApplier: jest.fn(),
    getEventApplier: jest.fn(),
    getEntityStore: jest.fn(),
    searchEntities: jest.fn(),
    getDuplicateDetectionService: jest.fn(),
  } as unknown as EventApplierService;
}

function makeValidJwt(): string {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({ sub: "user1", exp: Math.floor(Date.now() / 1000) + 3600 }),
  );
  return `${header}.${payload}.fakesignature`;
}

function createMockAuthStorage(): AuthStorageAdapter {
  return {
    initialize: jest.fn(),
    getUsername: jest.fn().mockResolvedValue("testuser"),
    getToken: jest.fn().mockResolvedValue({ provider: "default", token: makeValidJwt() }),
    getTokenByProvider: jest.fn().mockResolvedValue(makeValidJwt()),
    setUsername: jest.fn(),
    setToken: jest.fn(),
    removeToken: jest.fn(),
    removeAllTokens: jest.fn(),
    closeConnection: jest.fn(),
    clearStore: jest.fn(),
  };
}

interface ScopeTestInput extends SyncMachineInput {
  axiosInstance: AxiosInstance;
}

function createInput(overrides?: Partial<ScopeTestInput>): ScopeTestInput {
  const axiosInstance = axios.create({ baseURL: "http://test" });
  return {
    eventStore: createMockEventStore(),
    entityStore: createMockEntityStore(),
    eventApplierService: createMockEventApplierService(),
    authStorage: createMockAuthStorage(),
    axiosInstance,
    configId: "test-config",
    ...overrides,
  };
}

describe("syncMachine scope handling", () => {
  let resolvedIds: string[];
  let rejectedIds: Map<string, Error>;
  let onResolve: (id: string) => void;
  let onReject: (id: string, err: Error) => void;

  beforeEach(() => {
    resolvedIds = [];
    rejectedIds = new Map();
    onResolve = (id: string) => resolvedIds.push(id);
    onReject = (id: string, err: Error) => rejectedIds.set(id, err);
  });

  function startActor(input: ScopeTestInput) {
    const machine = createSyncMachine(onResolve, onReject);
    const actor = createActor(machine, { input });
    actor.start();
    return actor;
  }

  function waitFor(syncId: string, target: "resolve" | "reject"): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const check = setInterval(() => {
        if (target === "resolve" && resolvedIds.includes(syncId)) {
          clearInterval(check);
          resolve();
        } else if (target === "reject" && rejectedIds.has(syncId)) {
          clearInterval(check);
          resolve();
        } else if (Date.now() - start > 5000) {
          clearInterval(check);
          reject(new Error(`waitFor(${syncId}, ${target}) timed out`));
        }
      }, 5);
    });
  }

  test("first pull: persists scope.hash from response", async () => {
    const input = createInput();
    // No prior remote cursor → loadRemoteCursor returns "" so download proceeds.
    (input.eventStore.getLastRemoteSyncTimestamp as jest.Mock).mockResolvedValue("");
    (input.eventStore.getLastScopeHash as jest.Mock).mockResolvedValue(null);

    const mock = new MockAdapter(input.axiosInstance);
    mock.onGet(/\/api\/sync\/pull/).reply(200, {
      events: [],
      nextCursor: null,
      scope: { hash: "sha256:abc", areaIds: null, entityTypes: null, timeWindow: null },
    });

    const actor = startActor(input);
    actor.send({ type: "SYNC", syncId: "first-pull" });
    await waitFor("first-pull", "resolve");

    expect(input.eventStore.setLastScopeHash).toHaveBeenCalledWith("sha256:abc");
    expect(input.entityStore.deleteEntity).not.toHaveBeenCalled();
    actor.stop();
  });

  test("second pull with same hash: does NOT call purge", async () => {
    const input = createInput();
    (input.eventStore.getLastRemoteSyncTimestamp as jest.Mock).mockResolvedValue("");
    (input.eventStore.getLastScopeHash as jest.Mock).mockResolvedValue("sha256:abc");

    const mock = new MockAdapter(input.axiosInstance);
    mock.onGet(/\/api\/sync\/pull/).reply(200, {
      events: [],
      nextCursor: null,
      scope: { hash: "sha256:abc", areaIds: null, entityTypes: null, timeWindow: null },
    });

    const actor = startActor(input);
    actor.send({ type: "SYNC", syncId: "same-hash" });
    await waitFor("same-hash", "resolve");

    expect(input.entityStore.deleteEntity).not.toHaveBeenCalled();
    expect(input.eventStore.deleteEventsForEntity).not.toHaveBeenCalled();
    // Hash unchanged so no need to persist again — but it's harmless if we do.
    actor.stop();
  });

  test("second pull with different hash: re-pulls and purges out-of-scope entities", async () => {
    // Build a purge callback that mimics EntityDataManager.purgeEntitiesNotIn:
    // delete entities whose guid is not in `keepGuids`.
    const seeded = [
      {
        guid: "entity-keep",
        initial: null,
        modified: { id: "entity-keep", guid: "entity-keep", type: "individual", version: 1, data: {}, lastUpdated: "2025-01-01T00:00:00Z" },
      },
      {
        guid: "entity-drop",
        initial: null,
        modified: { id: "entity-drop", guid: "entity-drop", type: "individual", version: 1, data: {}, lastUpdated: "2025-01-01T00:00:00Z" },
      },
    ];

    const eventStore = createMockEventStore();
    const entityStore = createMockEntityStore();
    (eventStore.getLastRemoteSyncTimestamp as jest.Mock).mockResolvedValue("2025-01-01T00:00:00Z");
    (eventStore.getLastScopeHash as jest.Mock).mockResolvedValue("sha256:old");
    (entityStore.getAllEntities as jest.Mock).mockResolvedValue(seeded);

    const purgeOutOfScope = jest.fn(async (keep: readonly string[]) => {
      const keepSet = new Set(keep);
      for (const pair of seeded) {
        if (!keepSet.has(pair.modified.guid)) {
          await eventStore.deleteEventsForEntity(pair.modified.guid);
          await entityStore.deleteEntity(pair.modified.guid);
        }
      }
    });

    const input = createInput({ eventStore, entityStore, purgeOutOfScope });

    const event: FormSubmission = {
      guid: "evt-1",
      entityGuid: "entity-keep",
      type: "create-individual",
      data: { name: "Keep" },
      timestamp: "2025-02-01T00:00:00Z",
      userId: "u1",
      syncLevel: 0,
    };

    const mock = new MockAdapter(input.axiosInstance);
    mock.onGet(/\/api\/sync\/pull/).reply(200, {
      events: [event],
      nextCursor: null,
      scope: { hash: "sha256:new", areaIds: null, entityTypes: null, timeWindow: null },
    });

    const actor = startActor(input);
    actor.send({ type: "SYNC", syncId: "rotate-hash" });
    await waitFor("rotate-hash", "resolve");

    // The purge callback was invoked with the keep set including entity-keep.
    expect(purgeOutOfScope).toHaveBeenCalledTimes(1);
    const keepArg = purgeOutOfScope.mock.calls[0][0] as string[];
    expect(keepArg).toContain("entity-keep");

    // entity-drop must be purged; entity-keep must NOT be deleted.
    const deleteEntityCalls = (entityStore.deleteEntity as jest.Mock).mock.calls.map((c) => c[0]);
    expect(deleteEntityCalls).toContain("entity-drop");
    expect(deleteEntityCalls).not.toContain("entity-keep");

    const deleteEventsCalls = (eventStore.deleteEventsForEntity as jest.Mock).mock.calls.map((c) => c[0]);
    expect(deleteEventsCalls).toContain("entity-drop");
    expect(deleteEventsCalls).not.toContain("entity-keep");

    expect(eventStore.setLastScopeHash).toHaveBeenCalledWith("sha256:new");
    actor.stop();
  });

  test("response without scope field is backwards-compat (no purge, no hash change)", async () => {
    const input = createInput();
    (input.eventStore.getLastRemoteSyncTimestamp as jest.Mock).mockResolvedValue("");
    (input.eventStore.getLastScopeHash as jest.Mock).mockResolvedValue(null);

    const mock = new MockAdapter(input.axiosInstance);
    mock.onGet(/\/api\/sync\/pull/).reply(200, {
      events: [],
      nextCursor: null,
      // NO scope field — older / unscoped server
    });

    const actor = startActor(input);
    actor.send({ type: "SYNC", syncId: "no-scope" });
    await waitFor("no-scope", "resolve");

    expect(input.eventStore.setLastScopeHash).not.toHaveBeenCalled();
    expect(input.entityStore.deleteEntity).not.toHaveBeenCalled();
    expect(input.eventStore.deleteEventsForEntity).not.toHaveBeenCalled();
    actor.stop();
  });
});
