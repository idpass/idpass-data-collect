/**
 * @jest-environment jsdom
 */

/**
 * M7: createOrUpdateGroup mutates input member objects
 *
 * EventApplierService.createOrUpdateGroup() calls `delete member.guid`
 * on the member objects in the formData (cloned) data.members array.
 * This mutation is visible in the audit log: the `changes` field recorded
 * by logAudit(formData.data) contains members WITHOUT their guid, making
 * the audit trail incomplete.
 *
 * File under test: packages/datacollect/src/services/EventApplierService.ts:589-590
 */
import "fake-indexeddb/auto";
import "core-js/stable/structured-clone";
import { TextEncoder, TextDecoder } from "util";
Object.assign(global, { TextEncoder, TextDecoder });

import { FormSubmission, SyncLevel } from "../../interfaces/types";
import { EventStoreImpl } from "../../components/EventStore";
import { EventApplierService } from "../EventApplierService";
import { IndexedDbEventStorageAdapter } from "../../storage/IndexedDbEventStorageAdapter";
import { IndexedDbEntityStorageAdapter } from "../../storage/IndexedDbEntityStorageAdapter";
import { EntityStoreImpl } from "../../components/EntityStore";

describe("M7: createOrUpdateGroup audit log must include member guids", () => {
  let eventApplierService: EventApplierService;
  let eventStore: EventStoreImpl;

  beforeEach(async () => {
    const tenantId = `mutation-test-${Date.now()}-${Math.random()}`;
    const eventStorageAdapter = new IndexedDbEventStorageAdapter(tenantId);
    await eventStorageAdapter.initialize();

    const entityStorageAdapter = new IndexedDbEntityStorageAdapter(tenantId);
    await entityStorageAdapter.initialize();

    eventStore = new EventStoreImpl(eventStorageAdapter);
    await eventStore.initialize();

    const entityStore = new EntityStoreImpl(entityStorageAdapter);
    await entityStore.initialize();

    eventApplierService = new EventApplierService(eventStore, entityStore);
  });

  test("audit log changes for create-group should preserve member guids", async () => {
    const formData: FormSubmission = {
      guid: "form-001",
      entityGuid: "group-001",
      type: "create-group",
      data: {
        name: "Smith Family",
        members: [
          { guid: "member-guid-1", name: "Alice Smith", type: "individual" },
          { guid: "member-guid-2", name: "Bob Smith", type: "individual" },
        ],
      },
      timestamp: new Date().toISOString(),
      userId: "user-001",
      syncLevel: SyncLevel.LOCAL,
    };

    await eventApplierService.submitForm(formData);

    // Retrieve the audit log to check the changes field
    const auditLog = await eventStore.getAuditTrailByEntityGuid("group-001");

    // Find the create-group audit entry
    const createGroupAudit = auditLog.find((entry) => entry.action === "create-group");
    expect(createGroupAudit).toBeDefined();

    // The changes field should contain the original data including member guids
    const changes = createGroupAudit!.changes as Record<string, unknown>;
    const members = (changes as { members?: Array<{ guid?: string }> }).members;

    // EXPECTED (correct): The audit log should preserve member guids so the
    // audit trail shows which members were added to the group
    // ACTUAL (buggy): Member guids are deleted at line 590 before logAudit
    // is called at line 633, so the audit log has members without guids
    expect(members).toBeDefined();
    expect(members!.length).toBe(2);
    expect(members![0]).toHaveProperty("guid", "member-guid-1");
    expect(members![1]).toHaveProperty("guid", "member-guid-2");
  });

  test("add-member audit log should preserve member guid", async () => {
    // First create a group
    const createGroupForm: FormSubmission = {
      guid: "form-create",
      entityGuid: "group-002",
      type: "create-group",
      data: {
        name: "Jones Family",
        members: [],
      },
      timestamp: new Date().toISOString(),
      userId: "user-001",
      syncLevel: SyncLevel.LOCAL,
    };

    await eventApplierService.submitForm(createGroupForm);

    // Then add a member
    const addMemberForm: FormSubmission = {
      guid: "form-add",
      entityGuid: "group-002",
      type: "add-member",
      data: {
        members: [{ guid: "new-member-guid", name: "Charlie Jones", type: "individual" }],
      },
      timestamp: new Date().toISOString(),
      userId: "user-001",
      syncLevel: SyncLevel.LOCAL,
    };

    await eventApplierService.submitForm(addMemberForm);

    // Retrieve audit log for the group
    const auditLog = await eventStore.getAuditTrailByEntityGuid("group-002");

    // Find the add-member audit entry
    const addMemberAudit = auditLog.find((entry) => entry.action === "add-member");
    expect(addMemberAudit).toBeDefined();

    const changes = addMemberAudit!.changes as Record<string, unknown>;
    const members = (changes as { members?: Array<{ guid?: string }> }).members;

    // EXPECTED (correct): Member guid preserved in audit log
    // ACTUAL (buggy): `delete memberData.guid` at line 726 removes the guid
    // before logAudit is called at line 762
    expect(members).toBeDefined();
    expect(members![0]).toHaveProperty("guid", "new-member-guid");
  });
});
