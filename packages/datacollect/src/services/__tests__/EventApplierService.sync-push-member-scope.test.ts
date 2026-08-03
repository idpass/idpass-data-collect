/**
 * @jest-environment jsdom
 *
 * Regression tests: sync-push member-GUID injection guard.
 * The self-service door guards member sub-writes
 * with a finite `authorizedMemberGuids` set. A field worker's sync scope is
 * NOT a finite GUID list — it is a PREDICATE over the member entity's area /
 * type. This test exercises the async predicate variant of the apply-path
 * guard: `submitForm(form, { isMemberGuidAuthorized })`.
 *
 * A bounded (area/entity-scoped) field worker must not be able to name an
 * out-of-scope PRE-EXISTING entity as a member of a group event and thereby
 * overwrite that entity's data or attach it to their group. In-scope members
 * and brand-new members must still apply. When no scope option is supplied
 * (admin / unbounded), member writes are unrestricted (legacy behaviour).
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

describe("EventApplierService – sync-push member scope predicate guard", () => {
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

  it("rejects a member naming a pre-existing out-of-scope victim (predicate returns false)", async () => {
    const victimGuid = uuidv4();
    const fieldWorkerGroupGuid = uuidv4();

    // Victim individual in area A2 (outside the field worker's A1 scope).
    await service.submitForm(
      makeForm({
        entityGuid: victimGuid,
        type: "create-individual",
        data: { name: "Victim", gender: "female", area_id: "A2" },
      }),
    );

    // Field worker's own group in area A1.
    await service.submitForm(
      makeForm({
        entityGuid: fieldWorkerGroupGuid,
        type: "create-group",
        data: { name: "Field Worker Household", area_id: "A1", members: [] },
      }),
    );

    // The scope predicate authorizes only members whose entity is in A1.
    // The victim (A2) must be rejected.
    const isMemberGuidAuthorized = async (guid: string): Promise<boolean> => {
      const pair = await entityStore.getEntity(guid);
      return pair?.modified.data.area_id === "A1";
    };

    await expect(
      service.submitForm(
        makeForm({
          entityGuid: fieldWorkerGroupGuid,
          type: "update-group",
          data: {
            name: "Field Worker Household",
            area_id: "A1",
            members: [{ guid: victimGuid, name: "HACKED", type: "individual" }],
          },
        }),
        { isMemberGuidAuthorized },
      ),
    ).rejects.toThrow();

    // Victim untouched.
    const victimPair = await entityStore.getEntity(victimGuid);
    expect(victimPair!.modified.data.name).toBe("Victim");
    expect(victimPair!.modified.data.gender).toBe("female");
    expect(victimPair!.modified.data.area_id).toBe("A2");

    // Victim NOT attached to the field worker's group.
    const groupPair = await entityStore.getEntity(fieldWorkerGroupGuid);
    expect((groupPair!.modified as GroupDoc).memberIds).not.toContain(victimGuid);
  });

  it("allows a member whose entity is in scope (predicate returns true)", async () => {
    const memberGuid = uuidv4();
    const groupGuid = uuidv4();

    await service.submitForm(
      makeForm({
        entityGuid: memberGuid,
        type: "create-individual",
        data: { name: "Alice", gender: "female", area_id: "A1" },
      }),
    );
    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "create-group",
        data: { name: "Household", area_id: "A1", members: [] },
      }),
    );

    const isMemberGuidAuthorized = async (guid: string): Promise<boolean> => {
      const pair = await entityStore.getEntity(guid);
      return pair?.modified.data.area_id === "A1";
    };

    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "update-group",
        data: {
          name: "Household",
          area_id: "A1",
          members: [{ guid: memberGuid, name: "Alice", phone: "555-1234", type: "individual" }],
        },
      }),
      { isMemberGuidAuthorized },
    );

    const memberPair = await entityStore.getEntity(memberGuid);
    expect(memberPair!.modified.data.phone).toBe("555-1234");
    expect(memberPair!.modified.data.gender).toBe("female");
    const groupPair = await entityStore.getEntity(groupGuid);
    expect((groupPair!.modified as GroupDoc).memberIds).toContain(memberGuid);
  });

  it("allows a brand-new member (guid resolves to no existing entity)", async () => {
    const groupGuid = uuidv4();
    const newMemberGuid = uuidv4();

    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "create-group",
        data: { name: "Household", area_id: "A1", members: [] },
      }),
    );

    // Predicate would return false for a non-existing entity, but the guard
    // must never consult the predicate for guids that don't resolve to a
    // pre-existing entity — brand-new members are always allowed.
    const isMemberGuidAuthorized = async (guid: string): Promise<boolean> => {
      const pair = await entityStore.getEntity(guid);
      return pair?.modified.data.area_id === "A1";
    };

    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "update-group",
        data: {
          name: "Household",
          area_id: "A1",
          members: [{ guid: newMemberGuid, name: "Newborn", type: "individual" }],
        },
      }),
      { isMemberGuidAuthorized },
    );

    const groupPair = await entityStore.getEntity(groupGuid);
    expect((groupPair!.modified as GroupDoc).memberIds).toContain(newMemberGuid);
    const memberPair = await entityStore.getEntity(newMemberGuid);
    expect(memberPair!.modified.data.name).toBe("Newborn");
  });

  it("does NOT restrict member writes when no scope option is given (admin / unbounded sync)", async () => {
    const memberGuid = uuidv4();
    const groupGuid = uuidv4();

    await service.submitForm(
      makeForm({
        entityGuid: memberGuid,
        type: "create-individual",
        data: { name: "Bob", area_id: "A2" },
      }),
    );

    // No options → unrestricted. An A2 member is accepted into any group.
    await service.submitForm(
      makeForm({
        entityGuid: groupGuid,
        type: "create-group",
        data: { name: "Household", area_id: "A1", members: [{ guid: memberGuid, name: "Bob", type: "individual" }] },
      }),
    );

    const groupPair = await entityStore.getEntity(groupGuid);
    expect((groupPair!.modified as GroupDoc).memberIds).toContain(memberGuid);
  });
});
