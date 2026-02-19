/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { v4 as uuidv4 } from "uuid";
import { FormSubmission, SyncLevel } from "../../interfaces/types";
import { EventApplierService } from "../../services/EventApplierService";
import { IndexedDbEntityStorageAdapter } from "../../storage/IndexedDbEntityStorageAdapter";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";
import { EntityStoreImpl } from "../EntityStore";
import { EventStoreImpl } from "../EventStore";

jest.mock("../../utils/logger", () => ({
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

/**
 * Creates an isolated client environment with its own IndexedDB-backed
 * EventStore, EntityStore, and EventApplierService.
 */
function createClient(name: string) {
  const entityStorageAdapter = new IndexedDbEntityStorageAdapter(name);
  const eventStorageAdapter = new IndexedDbEventStorageAdapter(name);
  const entityStore = new EntityStoreImpl(entityStorageAdapter);
  const eventStore = new EventStoreImpl(eventStorageAdapter);
  const eventApplierService = new EventApplierService(eventStore, entityStore);

  return { entityStore, eventStore, eventApplierService };
}

function makeCreateGroupForm(overrides: Partial<FormSubmission> = {}): FormSubmission {
  return {
    guid: uuidv4(),
    entityGuid: uuidv4(),
    type: "create-group",
    data: { name: `Group-${Date.now()}` },
    timestamp: new Date().toISOString(),
    userId: "user-1",
    syncLevel: SyncLevel.LOCAL,
    ...overrides,
  };
}

function makeCreateIndividualForm(overrides: Partial<FormSubmission> = {}): FormSubmission {
  return {
    guid: uuidv4(),
    entityGuid: uuidv4(),
    type: "create-individual",
    data: { name: `Individual-${Date.now()}` },
    timestamp: new Date().toISOString(),
    userId: "user-1",
    syncLevel: SyncLevel.LOCAL,
    ...overrides,
  };
}

/**
 * Simulates a sync round-trip between two clients through a "server" by
 * replaying events from one store into another, similar to how the
 * InternalSyncManager's push/pull cycle works.
 */
async function pushPull(
  source: { eventStore: EventStoreImpl },
  destination: { eventStore: EventStoreImpl; eventApplierService: EventApplierService },
  sinceCursor: string = "",
): Promise<string> {
  const events = await source.eventStore.getEventsSince(sinceCursor);
  const sorted = events.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  for (const event of sorted) {
    const exists = await destination.eventStore.isEventExisted(event.guid);
    if (!exists) {
      // Strip the storage-layer `id` field so the destination's autoIncrement
      // assigns its own key and doesn't overwrite unrelated records.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...eventWithoutId } = event as FormSubmission & { id?: number };
      await destination.eventApplierService.submitForm({
        ...eventWithoutId,
        syncLevel: SyncLevel.REMOTE,
      });
    }
  }

  if (sorted.length > 0) {
    return sorted[sorted.length - 1].timestamp;
  }
  return sinceCursor;
}

describe("Sync Round-Trip Integration Tests", () => {
  let clientA: ReturnType<typeof createClient>;
  let clientB: ReturnType<typeof createClient>;
  let server: ReturnType<typeof createClient>;

  beforeEach(async () => {
    clientA = createClient(`clientA-${uuidv4()}`);
    clientB = createClient(`clientB-${uuidv4()}`);
    server = createClient(`server-${uuidv4()}`);

    await Promise.all([
      clientA.entityStore.initialize(),
      clientA.eventStore.initialize(),
      clientB.entityStore.initialize(),
      clientB.eventStore.initialize(),
      server.entityStore.initialize(),
      server.eventStore.initialize(),
    ]);
  });

  afterEach(async () => {
    await Promise.all([
      clientA.entityStore.clearStore(),
      clientA.eventStore.clearStore(),
      clientB.entityStore.clearStore(),
      clientB.eventStore.clearStore(),
      server.entityStore.clearStore(),
      server.eventStore.clearStore(),
    ]);
  });

  test("single entity created on client A appears on client B after sync through server", async () => {
    const entityGuid = uuidv4();
    const form = makeCreateIndividualForm({
      entityGuid,
      data: { name: "Alice" },
    });

    await clientA.eventApplierService.submitForm(form);

    // Client A -> server
    await pushPull(clientA, server);

    // Server -> client B
    await pushPull(server, clientB);

    const entityOnB = await clientB.entityStore.getEntity(entityGuid);
    expect(entityOnB).not.toBeNull();
    expect(entityOnB!.modified.data.name).toBe("Alice");
  });

  test("multiple entities sync correctly from client A through server to client B", async () => {
    const guids: string[] = [];

    for (let i = 0; i < 5; i++) {
      const entityGuid = uuidv4();
      guids.push(entityGuid);
      await clientA.eventApplierService.submitForm(
        makeCreateIndividualForm({
          entityGuid,
          data: { name: `Person-${i}` },
        }),
      );
    }

    await pushPull(clientA, server);
    await pushPull(server, clientB);

    const allEntitiesOnB = await clientB.entityStore.getAllEntities();
    const syncedGuids = allEntitiesOnB.map((e) => e.modified.guid);

    for (const guid of guids) {
      expect(syncedGuids).toContain(guid);
    }
    expect(allEntitiesOnB.length).toBe(5);
  });

  test("sync pagination works correctly with page size of 2 for 5 entities", async () => {
    const guids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const entityGuid = uuidv4();
      guids.push(entityGuid);
      // Stagger timestamps to ensure ordering
      await new Promise((resolve) => setTimeout(resolve, 10));
      await clientA.eventApplierService.submitForm(
        makeCreateIndividualForm({
          entityGuid,
          data: { name: `Paginated-${i}` },
        }),
      );
    }

    // Push to server
    await pushPull(clientA, server);

    // Pull from server to client B using pagination
    let cursor = "";
    let totalPulled = 0;
    let pageCount = 0;
    const pageSize = 2;

    while (true) {
      const result = await server.eventStore.getEventsSincePagination(cursor, pageSize);
      if (result.events.length === 0) break;

      for (const event of result.events) {
        const exists = await clientB.eventStore.isEventExisted(event.guid);
        if (!exists) {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id: _id, ...eventWithoutId } = event as FormSubmission & { id?: number };
          await clientB.eventApplierService.submitForm({
            ...eventWithoutId,
            syncLevel: SyncLevel.REMOTE,
          });
          totalPulled++;
        }
      }

      pageCount++;
      if (result.nextCursor === null) break;
      cursor = result.nextCursor.toString();
    }

    expect(pageCount).toBeGreaterThanOrEqual(3); // 5 events / 2 per page = at least 3 pages
    expect(totalPulled).toBe(5);

    const allEntitiesOnB = await clientB.entityStore.getAllEntities();
    expect(allEntitiesOnB.length).toBe(5);
  });

  test("conflicting updates resolve via last-write-wins on the client", async () => {
    // Create entity on client A and sync to all
    const entityGuid = uuidv4();
    await clientA.eventApplierService.submitForm(
      makeCreateIndividualForm({
        entityGuid,
        data: { name: "Original" },
      }),
    );

    // Sync to server and to client B, then mark as synced on both clients
    await pushPull(clientA, server);
    await pushPull(server, clientB);
    await clientA.entityStore.markEntityAsSynced(entityGuid);
    await clientB.entityStore.markEntityAsSynced(entityGuid);

    // Client A makes a local update
    const updateA: FormSubmission = {
      guid: uuidv4(),
      entityGuid,
      type: "update-individual",
      data: { name: "Updated by A" },
      timestamp: new Date(Date.now() - 2000).toISOString(),
      userId: "user-a",
      syncLevel: SyncLevel.LOCAL,
    };
    await clientA.eventApplierService.submitForm(updateA);

    const entityOnA = await clientA.entityStore.getEntity(entityGuid);
    expect(entityOnA!.modified.data.name).toBe("Updated by A");

    // A remote update arrives at client A with a LATER timestamp
    const remoteUpdate: FormSubmission = {
      guid: uuidv4(),
      entityGuid,
      type: "update-individual",
      data: { name: "Updated by B (remote)" },
      timestamp: new Date(Date.now() + 5000).toISOString(),
      userId: "user-b",
      syncLevel: SyncLevel.REMOTE,
    };
    await clientA.eventApplierService.submitForm(remoteUpdate);

    // Remote update has a later timestamp, so it should win
    const entityAfterConflict = await clientA.entityStore.getEntity(entityGuid);
    expect(entityAfterConflict).not.toBeNull();
    expect(entityAfterConflict!.modified.data.name).toBe("Updated by B (remote)");
  });

  test("composite cursor maintains deterministic ordering across pages with distinct timestamps", async () => {
    // Create events with distinct timestamps to exercise pagination cursor
    const baseTime = Date.now();
    const guids: string[] = [];

    for (let i = 0; i < 4; i++) {
      const entityGuid = uuidv4();
      guids.push(entityGuid);
      await clientA.eventApplierService.submitForm(
        makeCreateIndividualForm({
          entityGuid,
          data: { name: `Cursor-${i}` },
          timestamp: new Date(baseTime + i * 1000).toISOString(),
        }),
      );
    }

    await pushPull(clientA, server);

    // Paginate with page size 2 to force multiple pages
    const firstPage = await server.eventStore.getEventsSincePagination("", 2);
    expect(firstPage.events.length).toBe(2);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await server.eventStore.getEventsSincePagination(
      firstPage.nextCursor!.toString(),
      2,
    );
    expect(secondPage.events.length).toBe(2);

    // Verify no duplicates between pages
    const firstPageGuids = firstPage.events.map((e) => e.guid);
    const secondPageGuids = secondPage.events.map((e) => e.guid);
    const allPageGuids = [...firstPageGuids, ...secondPageGuids];
    const uniqueGuids = new Set(allPageGuids);
    expect(uniqueGuids.size).toBe(allPageGuids.length);

    // Verify ordering: events within each page are sorted by timestamp ascending
    for (const page of [firstPage.events, secondPage.events]) {
      for (let i = 1; i < page.length; i++) {
        expect(page[i].timestamp.localeCompare(page[i - 1].timestamp)).toBeGreaterThanOrEqual(0);
      }
    }

    // Verify cross-page ordering: last event of first page has timestamp <= first of second page
    const lastFirstPage = firstPage.events[firstPage.events.length - 1];
    const firstSecondPage = secondPage.events[0];
    expect(lastFirstPage.timestamp.localeCompare(firstSecondPage.timestamp)).toBeLessThanOrEqual(0);
  });

  test("hash chain updates after sync operations", async () => {
    // Verify the hash starts empty
    expect(clientA.eventStore.getLatestHash()).toBe("");

    // Create events on client A
    const hashes: string[] = [];
    for (let i = 0; i < 3; i++) {
      await clientA.eventApplierService.submitForm(
        makeCreateIndividualForm({
          data: { name: `Hashed-${i}` },
        }),
      );
      hashes.push(clientA.eventStore.getLatestHash());
    }

    // Each event should produce a different hash
    expect(hashes[0]).toBeTruthy();
    expect(hashes[1]).toBeTruthy();
    expect(hashes[2]).toBeTruthy();
    expect(new Set(hashes).size).toBe(3);

    // After push-pull to server, server hash should be truthy
    await pushPull(clientA, server);
    expect(server.eventStore.getLatestHash()).toBeTruthy();
  });

  test("group with members syncs correctly through server", async () => {
    const groupGuid = uuidv4();
    const memberGuid = uuidv4();

    await clientA.eventApplierService.submitForm(
      makeCreateGroupForm({
        entityGuid: groupGuid,
        data: {
          name: "Test Household",
          members: [{ guid: memberGuid, name: "Head of Household" }],
        },
      }),
    );

    await pushPull(clientA, server);
    await pushPull(server, clientB);

    const groupOnB = await clientB.entityStore.getEntity(groupGuid);
    expect(groupOnB).not.toBeNull();
    expect(groupOnB!.modified.data.name).toBe("Test Household");

    const memberOnB = await clientB.entityStore.getEntity(memberGuid);
    expect(memberOnB).not.toBeNull();
    expect(memberOnB!.modified.data.name).toBe("Head of Household");
  });

  test("bidirectional sync: both clients create entities, both see all after sync", async () => {
    const guidA = uuidv4();
    const guidB = uuidv4();

    await clientA.eventApplierService.submitForm(
      makeCreateIndividualForm({
        entityGuid: guidA,
        data: { name: "From Client A" },
      }),
    );

    await clientB.eventApplierService.submitForm(
      makeCreateIndividualForm({
        entityGuid: guidB,
        data: { name: "From Client B" },
      }),
    );

    // A -> server, B -> server
    await pushPull(clientA, server);
    await pushPull(clientB, server);

    // server -> A, server -> B
    await pushPull(server, clientA);
    await pushPull(server, clientB);

    const entitiesOnA = await clientA.entityStore.getAllEntities();
    const entitiesOnB = await clientB.entityStore.getAllEntities();

    const guidsOnA = entitiesOnA.map((e) => e.modified.guid);
    const guidsOnB = entitiesOnB.map((e) => e.modified.guid);

    expect(guidsOnA).toContain(guidA);
    expect(guidsOnA).toContain(guidB);
    expect(guidsOnB).toContain(guidA);
    expect(guidsOnB).toContain(guidB);
  });
});
