/**
 * @jest-environment jsdom
 *
 * Regression tests: horizontal authorization guard against member-GUID
 * injection. A least-trusted caller (self-service beneficiary) must not be
 * able to name an arbitrary existing entity GUID as a "member" of their group
 * and thereby overwrite that entity's data or attach it to their group.
 *
 * The apply-path guard is opt-in via `submitForm(form, { authorizedMemberGuids })`.
 * When the option is provided (restricted / untrusted mode), member entries that
 * resolve to a PRE-EXISTING entity must already be in the authorized set.
 * Unknown GUIDs (brand-new members) are allowed. When the option is omitted
 * (trusted field-worker sync), no restriction applies — legacy behaviour.
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { v4 as uuidv4 } from "uuid";
import { EntityStore, EventStore, FormSubmission, GroupDoc, SyncLevel } from "../../interfaces/types";
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

describe("EventApplierService – member-GUID injection authorization guard", () => {
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

  it("rejects a member entry naming a pre-existing victim GUID under the restricted path", async () => {
    const victimGuid = uuidv4();
    const attackerGroupGuid = uuidv4();

    // Victim individual (belongs to someone else) with sensitive data.
    await service.submitForm(
      makeForm({
        entityGuid: victimGuid,
        type: "create-individual",
        data: { name: "Victim", gender: "female", date_of_birth: "1990-01-15" },
      }),
    );

    // Attacker's own group.
    await service.submitForm(
      makeForm({
        entityGuid: attackerGroupGuid,
        type: "create-group",
        data: { name: "Attacker Household", members: [] },
      }),
    );

    // Attacker updates their group, injecting the victim's GUID as a member with
    // attacker-chosen data. Restricted mode: only the group's own members are
    // authorized (empty set here) — the victim is NOT authorized.
    await expect(
      service.submitForm(
        makeForm({
          entityGuid: attackerGroupGuid,
          type: "update-group",
          data: {
            name: "Attacker Household",
            members: [{ guid: victimGuid, name: "HACKED", type: "individual" }],
          },
        }),
        { authorizedMemberGuids: [] },
      ),
    ).rejects.toThrow();

    // Victim's record must be untouched.
    const victimPair = await entityStore.getEntity(victimGuid);
    expect(victimPair!.modified.data.name).toBe("Victim");
    expect(victimPair!.modified.data.gender).toBe("female");
    expect(victimPair!.modified.data.date_of_birth).toBe("1990-01-15");

    // Victim must NOT have been attached to the attacker's group.
    const groupPair = await entityStore.getEntity(attackerGroupGuid);
    const group = groupPair!.modified as GroupDoc;
    expect(group.memberIds).not.toContain(victimGuid);
  });

  it("allows updating a member that is already in the caller's authorized scope", async () => {
    const memberGuid = uuidv4();
    const groupGuid = uuidv4();

    await service.submitForm(
      makeForm({
        entityGuid: memberGuid,
        type: "create-individual",
        data: { name: "Alice", gender: "female" },
      }),
    );
    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "create-group",
        data: { name: "Household", members: [{ guid: memberGuid, name: "Alice", type: "individual" }] },
      }),
    );

    // Update the group; the member is authorized (already in the group).
    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "update-group",
        data: {
          name: "Household",
          members: [{ guid: memberGuid, name: "Alice", phone: "555-1234", type: "individual" }],
        },
      }),
      { authorizedMemberGuids: [memberGuid] },
    );

    const memberPair = await entityStore.getEntity(memberGuid);
    expect(memberPair!.modified.data.phone).toBe("555-1234");
    // Existing data preserved.
    expect(memberPair!.modified.data.gender).toBe("female");
  });

  it("allows creating a brand-new member (unknown GUID) under the restricted path", async () => {
    const groupGuid = uuidv4();
    const newMemberGuid = uuidv4();

    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "create-group",
        data: { name: "Household", members: [] },
      }),
    );

    // New member GUID does not resolve to any existing entity → allowed.
    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "update-group",
        data: {
          name: "Household",
          members: [{ guid: newMemberGuid, name: "Newborn", type: "individual" }],
        },
      }),
      { authorizedMemberGuids: [] },
    );

    const groupPair = await entityStore.getEntity(groupGuid);
    const group = groupPair!.modified as GroupDoc;
    expect(group.memberIds).toContain(newMemberGuid);
    const memberPair = await entityStore.getEntity(newMemberGuid);
    expect(memberPair!.modified.data.name).toBe("Newborn");
  });

  it("does NOT restrict member writes when no authorization scope is given (trusted sync)", async () => {
    // Field-worker sync path: submitForm without options must keep legacy
    // behaviour so legitimate group creation with members is never broken.
    const memberGuid = uuidv4();
    const groupGuid = uuidv4();

    await service.submitForm(
      makeForm({
        entityGuid: memberGuid,
        type: "create-individual",
        data: { name: "Bob" },
      }),
    );

    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "create-group",
        data: {
          name: "Household",
          members: [{ guid: memberGuid, name: "Bob", type: "individual" }],
        },
      }),
    );

    const groupPair = await entityStore.getEntity(groupGuid);
    const group = groupPair!.modified as GroupDoc;
    expect(group.memberIds).toContain(memberGuid);
  });
});
