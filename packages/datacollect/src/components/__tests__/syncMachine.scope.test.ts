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

  test("rotation: second page request uses since='' after rotation detected (multi-page re-pull)", async () => {
    // Pre-state: an old hash + a non-empty cursor on disk. Server advertises
    // a different hash → rotation. The first page must be discarded, cursor
    // reset to "", and the SECOND request must carry since="" (epoch).
    const eventStore = createMockEventStore();
    const entityStore = createMockEntityStore();
    (eventStore.getLastRemoteSyncTimestamp as jest.Mock).mockResolvedValue(
      "2026-04-29T00:00:00Z|prior-event",
    );
    (eventStore.getLastScopeHash as jest.Mock).mockResolvedValue("sha256:old");

    const purgeOutOfScope = jest.fn(async (_keep: readonly string[]) => {
      /* intentionally inert — only inspecting query strings + purge call */
    });

    const input = createInput({ eventStore, entityStore, purgeOutOfScope });

    const firstPageEvent: FormSubmission = {
      guid: "evt-first-page",
      entityGuid: "entity-from-old-cursor",
      type: "create-individual",
      data: { name: "Old cursor result" },
      timestamp: "2026-04-29T12:00:00Z",
      userId: "u1",
      syncLevel: 0,
    };
    const repullPageEvent: FormSubmission = {
      guid: "evt-repull",
      entityGuid: "entity-in-new-scope",
      type: "create-individual",
      data: { name: "Re-pull result" },
      timestamp: "2026-01-01T00:00:00Z",
      userId: "u1",
      syncLevel: 0,
    };

    const mock = new MockAdapter(input.axiosInstance);
    let callCount = 0;
    mock.onGet(/\/api\/sync\/pull/).reply(() => {
      callCount += 1;
      if (callCount === 1) {
        // First request — uses the OLD cursor. Server already advertises new hash.
        return [
          200,
          {
            events: [firstPageEvent],
            nextCursor: "page-2-from-old-cursor",
            scope: { hash: "sha256:new", areaIds: null, entityTypes: null, timeWindow: null },
          },
        ];
      }
      // Second request — must carry since="" (epoch) because the machine
      // reset the cursor after detecting rotation. Single page suffices.
      return [
        200,
        {
          events: [repullPageEvent],
          nextCursor: null,
          scope: { hash: "sha256:new", areaIds: null, entityTypes: null, timeWindow: null },
        },
      ];
    });

    const actor = startActor(input);
    actor.send({ type: "SYNC", syncId: "rotate-multipage" });
    await waitFor("rotate-multipage", "resolve");

    // Two requests issued: first with the stale cursor, second from epoch.
    expect(mock.history.get).toHaveLength(2);
    const firstUrl = mock.history.get[0].url ?? "";
    const secondUrl = mock.history.get[1].url ?? "";

    // First request carries the old persisted cursor.
    expect(firstUrl).toContain(
      `since=${encodeURIComponent("2026-04-29T00:00:00Z|prior-event")}`,
    );
    // Second request — after rotation detection — must have an empty `since`
    // value, indicating the cursor was reset to epoch.
    expect(secondUrl).toContain("since=&");

    // Events from the FIRST (stale) page must be discarded — only the
    // re-pull event should be applied to the EventApplierService.
    const submitFormCalls = (input.eventApplierService.submitForm as jest.Mock).mock.calls;
    const submittedGuids = submitFormCalls.map((c) => c[0].guid);
    expect(submittedGuids).toContain("evt-repull");
    expect(submittedGuids).not.toContain("evt-first-page");

    // Purge ran with only the re-pulled entity in the keep set.
    expect(purgeOutOfScope).toHaveBeenCalledTimes(1);
    const keepArg = purgeOutOfScope.mock.calls[0][0] as readonly string[];
    expect(keepArg).toContain("entity-in-new-scope");
    expect(keepArg).not.toContain("entity-from-old-cursor");

    // New hash persisted exactly once at end of pagination.
    expect(eventStore.setLastScopeHash).toHaveBeenCalledWith("sha256:new");

    actor.stop();
  });

  test("rotation with empty in-scope set: no purge, hash persisted, warning logged", async () => {
    // Rotation detected, but the server returns no events on the re-pull —
    // empty in-scope set. We must NOT purge (would wipe the local store) and
    // we MUST persist the new hash so the next sync treats it as same-hash.
    const eventStore = createMockEventStore();
    const entityStore = createMockEntityStore();
    (eventStore.getLastRemoteSyncTimestamp as jest.Mock).mockResolvedValue(
      "2026-04-29T00:00:00Z|some-event",
    );
    (eventStore.getLastScopeHash as jest.Mock).mockResolvedValue("sha256:old");

    // Local store has entities from a prior assignment — these must survive.
    (entityStore.getAllEntities as jest.Mock).mockResolvedValue([
      {
        guid: "stale-entity-1",
        initial: null,
        modified: {
          id: "stale-entity-1",
          guid: "stale-entity-1",
          type: "individual",
          version: 1,
          data: {},
          lastUpdated: "2026-01-01T00:00:00Z",
        },
      },
    ]);

    const purgeOutOfScope = jest.fn(async (_keep: readonly string[]) => {
      /* must NEVER be called in this scenario */
    });

    const input = createInput({ eventStore, entityStore, purgeOutOfScope });

    const mock = new MockAdapter(input.axiosInstance);
    let callCount = 0;
    mock.onGet(/\/api\/sync\/pull/).reply(() => {
      callCount += 1;
      if (callCount === 1) {
        // First page: rotation signalled, but we still return some events
        // (which will be discarded) so the rotation flow exercises end-to-end.
        return [
          200,
          {
            events: [],
            nextCursor: null,
            scope: { hash: "sha256:new", areaIds: null, entityTypes: null, timeWindow: null },
          },
        ];
      }
      // Re-pull from epoch returns nothing — empty scope.
      return [
        200,
        {
          events: [],
          nextCursor: null,
          scope: { hash: "sha256:new", areaIds: null, entityTypes: null, timeWindow: null },
        },
      ];
    });

    const actor = startActor(input);
    actor.send({ type: "SYNC", syncId: "rotate-empty" });
    await waitFor("rotate-empty", "resolve");

    // Purge MUST NOT be called when the keep set is empty.
    expect(purgeOutOfScope).not.toHaveBeenCalled();
    // New hash persisted — next sync treats it as same-hash, not another rotation.
    expect(eventStore.setLastScopeHash).toHaveBeenCalledWith("sha256:new");
    // Local entities untouched.
    expect(entityStore.deleteEntity).not.toHaveBeenCalled();
    expect(eventStore.deleteEventsForEntity).not.toHaveBeenCalled();

    actor.stop();
  });

  test("first sync ever: hash establishes, no purge", async () => {
    // No persisted hash on disk — establishment, not rotation.
    // Local store may already contain entities (e.g., from a prior import or
    // legacy state). Establishment must NOT purge those.
    const eventStore = createMockEventStore();
    const entityStore = createMockEntityStore();
    (eventStore.getLastRemoteSyncTimestamp as jest.Mock).mockResolvedValue("");
    (eventStore.getLastScopeHash as jest.Mock).mockResolvedValue(null);
    (entityStore.getAllEntities as jest.Mock).mockResolvedValue([
      {
        guid: "preexisting-entity",
        initial: null,
        modified: {
          id: "preexisting-entity",
          guid: "preexisting-entity",
          type: "individual",
          version: 1,
          data: {},
          lastUpdated: "2026-01-01T00:00:00Z",
        },
      },
    ]);

    const purgeOutOfScope = jest.fn(async (_keep: readonly string[]) => {
      /* must NEVER be called on first establishment */
    });

    const input = createInput({ eventStore, entityStore, purgeOutOfScope });

    const event: FormSubmission = {
      guid: "evt-init",
      entityGuid: "entity-from-server",
      type: "create-individual",
      data: { name: "Initial" },
      timestamp: "2026-04-30T00:00:00Z",
      userId: "u1",
      syncLevel: 0,
    };

    const mock = new MockAdapter(input.axiosInstance);
    mock.onGet(/\/api\/sync\/pull/).reply(200, {
      events: [event],
      nextCursor: null,
      scope: { hash: "sha256:initial", areaIds: null, entityTypes: null, timeWindow: null },
    });

    const actor = startActor(input);
    actor.send({ type: "SYNC", syncId: "first-ever" });
    await waitFor("first-ever", "resolve");

    // Establishment path: hash persisted, no purge, no deletes.
    expect(eventStore.setLastScopeHash).toHaveBeenCalledWith("sha256:initial");
    expect(purgeOutOfScope).not.toHaveBeenCalled();
    expect(entityStore.deleteEntity).not.toHaveBeenCalled();
    expect(eventStore.deleteEventsForEntity).not.toHaveBeenCalled();

    // Only one request issued (no rotation re-pull).
    expect(mock.history.get).toHaveLength(1);
    actor.stop();
  });
});
