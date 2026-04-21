/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { v4 as uuidv4 } from "uuid";
import {
  EntityStore,
  EntityType,
  EventStore,
  FormSubmission,
  GroupDoc,
  RecordDoc,
  SyncLevel,
} from "../../interfaces/types";
import { EntityStoreImpl } from "../../components/EntityStore";
import { EventStoreImpl } from "../../components/EventStore";
import { EventApplierService } from "../EventApplierService";
import { IndexedDbEntityStorageAdapter } from "../../storage/IndexedDbEntityStorageAdapter";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";

function makeForm(overrides: Partial<FormSubmission> = {}): FormSubmission {
  return {
    guid: uuidv4(),
    entityGuid: uuidv4(),
    type: "create-individual",
    data: { name: "Test Person" },
    timestamp: new Date().toISOString(),
    userId: "test-user",
    syncLevel: SyncLevel.LOCAL,
    ...overrides,
  };
}

describe("EventApplierService – addMemberToGroup", () => {
  let entityStore: EntityStore;
  let eventStore: EventStore;
  let service: EventApplierService;

  beforeEach(async () => {
    entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
    await entityStore.initialize();
    eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter());
    await eventStore.initialize();
    service = new EventApplierService(eventStore, entityStore);
  });

  afterEach(async () => {
    await entityStore.clearStore();
    await eventStore.clearStore();
  });

  it("does NOT overwrite an existing individual when add-member is processed", async () => {
    const individualGuid = uuidv4();
    const groupGuid = uuidv4();

    // Create the individual with full data
    await service.submitForm(
      makeForm({
        entityGuid: individualGuid,
        type: "create-individual",
        data: { name: "Alice", gender: "female", date_of_birth: "1990-01-15" },
      }),
    );

    // Create the group
    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "create-group",
        data: { name: "Test Household" },
      }),
    );

    // Add the existing individual as a member of the group
    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "add-member",
        data: {
          members: [{ guid: individualGuid, name: "Alice", type: "individual" }],
        },
      }),
    );

    // The individual's data should be preserved — NOT overwritten by sparse member data
    const individualPair = await entityStore.getEntity(individualGuid);
    expect(individualPair).toBeTruthy();
    expect(individualPair!.modified.data.gender).toBe("female");
    expect(individualPair!.modified.data.date_of_birth).toBe("1990-01-15");

    // The group should list the individual as a member
    const groupPair = await entityStore.getEntity(groupGuid);
    expect(groupPair).toBeTruthy();
    const group = groupPair!.modified as GroupDoc;
    expect(group.memberIds).toContain(individualGuid);
  });

  it("creates a stub entity when the member does not exist yet", async () => {
    const individualGuid = uuidv4();
    const groupGuid = uuidv4();

    // Create the group first
    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "create-group",
        data: { name: "Test Household" },
      }),
    );

    // Add a member that doesn't exist yet (out-of-order sync scenario)
    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "add-member",
        data: {
          members: [{ guid: individualGuid, name: "Bob", type: "individual" }],
        },
      }),
    );

    // A stub individual should have been created
    const individualPair = await entityStore.getEntity(individualGuid);
    expect(individualPair).toBeTruthy();
    expect(individualPair!.modified.data.name).toBe("Bob");

    // The group should list the individual as a member
    const groupPair = await entityStore.getEntity(groupGuid);
    const group = groupPair!.modified as GroupDoc;
    expect(group.memberIds).toContain(individualGuid);
  });

  it("does NOT overwrite an existing group member when add-member is processed", async () => {
    const subGroupGuid = uuidv4();
    const parentGroupGuid = uuidv4();

    // Create the sub-group with full data
    await service.submitForm(
      makeForm({
        entityGuid: subGroupGuid,
        type: "create-group",
        data: { name: "Sub Cooperative", region: "North" },
      }),
    );

    // Create the parent group
    await service.submitForm(
      makeForm({
        entityGuid: parentGroupGuid,
        type: "create-group",
        data: { name: "Parent Cooperative" },
      }),
    );

    // Add sub-group as member of parent
    await service.submitForm(
      makeForm({
        entityGuid: parentGroupGuid,
        type: "add-member",
        data: {
          members: [{ guid: subGroupGuid, name: "Sub Cooperative", type: "group" }],
        },
      }),
    );

    // The sub-group's data should be preserved
    const subGroupPair = await entityStore.getEntity(subGroupGuid);
    expect(subGroupPair).toBeTruthy();
    expect(subGroupPair!.modified.data.region).toBe("North");
    expect(subGroupPair!.modified.data.name).toBe("Sub Cooperative");
  });
});

describe("EventApplierService – createOrUpdateGroup inline members", () => {
  let entityStore: EntityStore;
  let eventStore: EventStore;
  let service: EventApplierService;

  beforeEach(async () => {
    entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
    await entityStore.initialize();
    eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter());
    await eventStore.initialize();
    service = new EventApplierService(eventStore, entityStore);
  });

  afterEach(async () => {
    await entityStore.clearStore();
    await eventStore.clearStore();
  });

  it("does not overwrite existing individual members during create-group", async () => {
    const individualGuid = uuidv4();
    const groupGuid = uuidv4();

    // Pre-create the individual with full data
    await service.submitForm(
      makeForm({
        entityGuid: individualGuid,
        type: "create-individual",
        data: { name: "Alice", gender: "female", date_of_birth: "1990-01-15" },
      }),
    );

    // Create a group with this individual as an inline member
    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "create-group",
        data: {
          name: "Test Household",
          members: [{ guid: individualGuid, name: "Alice", type: "individual" }],
        },
      }),
    );

    // The individual's data should be preserved, not overwritten with sparse member data
    const individualPair = await entityStore.getEntity(individualGuid);
    expect(individualPair).toBeTruthy();
    expect(individualPair!.modified.data.gender).toBe("female");
    expect(individualPair!.modified.data.date_of_birth).toBe("1990-01-15");

    // The group should list the individual as a member
    const groupPair = await entityStore.getEntity(groupGuid);
    const group = groupPair!.modified as GroupDoc;
    expect(group.memberIds).toContain(individualGuid);
  });

  it("does not overwrite existing sub-group members during create-group", async () => {
    const subGroupGuid = uuidv4();
    const parentGroupGuid = uuidv4();

    // Pre-create the sub-group with full data
    await service.submitForm(
      makeForm({
        entityGuid: subGroupGuid,
        type: "create-group",
        data: { name: "Sub Cooperative", region: "North" },
      }),
    );

    // Create a parent group with the sub-group as an inline member
    await service.submitForm(
      makeForm({
        entityGuid: parentGroupGuid,
        type: "create-group",
        data: {
          name: "Parent Cooperative",
          members: [{ guid: subGroupGuid, name: "Sub Cooperative", type: "group" }],
        },
      }),
    );

    // The sub-group's data should be preserved
    const subGroupPair = await entityStore.getEntity(subGroupGuid);
    expect(subGroupPair).toBeTruthy();
    expect(subGroupPair!.modified.data.region).toBe("North");
    expect(subGroupPair!.modified.data.name).toBe("Sub Cooperative");
  });
});

describe("EventApplierService – REMOTE conflict resolution", () => {
  let entityStore: EntityStore;
  let eventStore: EventStore;
  let service: EventApplierService;

  beforeEach(async () => {
    entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
    await entityStore.initialize();
    eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter());
    await eventStore.initialize();
    service = new EventApplierService(eventStore, entityStore);
  });

  afterEach(async () => {
    await entityStore.clearStore();
    await eventStore.clearStore();
  });

  it("consecutive REMOTE add-member events are all applied", async () => {
    const groupGuid = uuidv4();
    const ind1Guid = uuidv4();
    const ind2Guid = uuidv4();
    const timestamp = new Date().toISOString();

    // Create group (REMOTE)
    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "create-group",
        data: { name: "Coop 001" },
        syncLevel: SyncLevel.REMOTE,
        timestamp,
      }),
    );

    // Create individual 1 (REMOTE)
    await service.submitForm(
      makeForm({
        entityGuid: ind1Guid,
        type: "create-individual",
        data: { name: "Ind 001" },
        syncLevel: SyncLevel.REMOTE,
        timestamp,
      }),
    );

    // Create individual 2 (REMOTE)
    await service.submitForm(
      makeForm({
        entityGuid: ind2Guid,
        type: "create-individual",
        data: { name: "Ind 006" },
        syncLevel: SyncLevel.REMOTE,
        timestamp,
      }),
    );

    // First add-member (REMOTE)
    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "add-member",
        data: { members: [{ guid: ind1Guid, name: "Ind 001", type: "individual" }] },
        syncLevel: SyncLevel.REMOTE,
        timestamp,
      }),
    );

    // Second add-member (REMOTE) — this was being silently skipped
    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "add-member",
        data: { members: [{ guid: ind2Guid, name: "Ind 006", type: "individual" }] },
        syncLevel: SyncLevel.REMOTE,
        timestamp,
      }),
    );

    const groupPair = await entityStore.getEntity(groupGuid);
    expect(groupPair).toBeTruthy();
    const group = groupPair!.modified as GroupDoc;
    expect(group.memberIds).toContain(ind1Guid);
    expect(group.memberIds).toContain(ind2Guid);
    expect(group.memberIds).toHaveLength(2);
  });

  it("REMOTE create-group sets initial equal to modified", async () => {
    const groupGuid = uuidv4();

    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "create-group",
        data: { name: "Test Group" },
        syncLevel: SyncLevel.REMOTE,
      }),
    );

    const pair = await entityStore.getEntity(groupGuid);
    expect(pair).toBeTruthy();
    expect(pair!.initial).not.toBeNull();
    expect(pair!.initial!.version).toBe(pair!.modified.version);
  });

  it("REMOTE create-individual sets initial equal to modified", async () => {
    const individualGuid = uuidv4();

    await service.submitForm(
      makeForm({
        entityGuid: individualGuid,
        type: "create-individual",
        data: { name: "Test Individual" },
        syncLevel: SyncLevel.REMOTE,
      }),
    );

    const pair = await entityStore.getEntity(individualGuid);
    expect(pair).toBeTruthy();
    expect(pair!.initial).not.toBeNull();
    expect(pair!.initial!.version).toBe(pair!.modified.version);
  });

  it("REMOTE update after REMOTE create does not trigger false conflict", async () => {
    const individualGuid = uuidv4();

    await service.submitForm(
      makeForm({
        entityGuid: individualGuid,
        type: "create-individual",
        data: { name: "Original" },
        syncLevel: SyncLevel.REMOTE,
      }),
    );

    await service.submitForm(
      makeForm({
        entityGuid: individualGuid,
        type: "update-individual",
        data: { name: "Updated" },
        syncLevel: SyncLevel.REMOTE,
      }),
    );

    const pair = await entityStore.getEntity(individualGuid);
    expect(pair).toBeTruthy();
    expect(pair!.modified.data.name).toBe("Updated");
    expect(pair!.modified.version).toBe(2);
  });

  it("LOCAL change followed by REMOTE event triggers conflict resolution", async () => {
    const individualGuid = uuidv4();

    // Create locally
    await service.submitForm(
      makeForm({
        entityGuid: individualGuid,
        type: "create-individual",
        data: { name: "Local" },
        syncLevel: SyncLevel.LOCAL,
      }),
    );

    // Local update to create a real divergence
    await service.submitForm(
      makeForm({
        entityGuid: individualGuid,
        type: "update-individual",
        data: { name: "Local Updated" },
        syncLevel: SyncLevel.LOCAL,
      }),
    );

    // Remote event arrives — should detect real conflict (local has unsaved changes)
    const remoteTimestamp = new Date(Date.now() + 10000).toISOString();
    await service.submitForm(
      makeForm({
        entityGuid: individualGuid,
        type: "update-individual",
        data: { name: "Remote Updated" },
        syncLevel: SyncLevel.REMOTE,
        timestamp: remoteTimestamp,
      }),
    );

    // Remote timestamp is later, so remote-wins should apply
    const pair = await entityStore.getEntity(individualGuid);
    expect(pair).toBeTruthy();
    expect(pair!.modified.data.name).toBe("Remote Updated");
  });
});

describe("EventApplierService – create-record / update-record", () => {
  let entityStore: EntityStore;
  let eventStore: EventStore;
  let service: EventApplierService;

  beforeEach(async () => {
    entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
    await entityStore.initialize();
    eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter());
    await eventStore.initialize();
    service = new EventApplierService(eventStore, entityStore);
  });

  afterEach(async () => {
    await entityStore.clearStore();
    await eventStore.clearStore();
  });

  it("create-record produces entity with EntityType.Record", async () => {
    const recordGuid = uuidv4();

    const entity = await service.submitForm(
      makeForm({
        entityGuid: recordGuid,
        type: "create-record",
        data: { name: "Training Session 1", topic: "agriculture" },
      }),
    );

    expect(entity).toBeTruthy();
    expect(entity!.type).toBe(EntityType.Record);

    const pair = await entityStore.getEntity(recordGuid);
    expect(pair).toBeTruthy();
    expect(pair!.modified.type).toBe(EntityType.Record);
    expect(pair!.modified.data.topic).toBe("agriculture");
  });

  it("create-record stores parentEntityGuid when provided", async () => {
    const recordGuid = uuidv4();
    const parentGuid = uuidv4();

    await service.submitForm(
      makeForm({
        entityGuid: recordGuid,
        type: "create-record",
        data: { name: "Home Visit 1", parentId: parentGuid },
      }),
    );

    const pair = await entityStore.getEntity(recordGuid);
    expect(pair).toBeTruthy();
    const record = pair!.modified as RecordDoc;
    expect(record.parentEntityGuid).toBe(parentGuid);
  });

  it("update-record merges data into existing record", async () => {
    const recordGuid = uuidv4();

    await service.submitForm(
      makeForm({
        entityGuid: recordGuid,
        type: "create-record",
        data: { name: "Referral A", agency: "WHO" },
      }),
    );

    await service.submitForm(
      makeForm({
        entityGuid: recordGuid,
        type: "update-record",
        data: { status: "completed" },
      }),
    );

    const pair = await entityStore.getEntity(recordGuid);
    expect(pair).toBeTruthy();
    expect(pair!.modified.data.agency).toBe("WHO");
    expect(pair!.modified.data.status).toBe("completed");
    expect(pair!.modified.version).toBe(2);
  });

  it("records are not groups (no memberIds)", async () => {
    const recordGuid = uuidv4();

    await service.submitForm(
      makeForm({
        entityGuid: recordGuid,
        type: "create-record",
        data: { name: "Assistance Record" },
      }),
    );

    const pair = await entityStore.getEntity(recordGuid);
    expect(pair).toBeTruthy();
    expect((pair!.modified as GroupDoc).memberIds).toBeUndefined();
  });
});
