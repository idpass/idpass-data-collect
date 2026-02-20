/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { v4 as uuidv4 } from "uuid";
import { EntityStore, EventStore, FormSubmission, SyncLevel, GroupDoc } from "../../interfaces/types";
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
