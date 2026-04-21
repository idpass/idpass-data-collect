import {
  EntityDoc,
  EntityPair,
  EntityType,
  FormSubmission,
  GroupDoc,
  IndividualDoc,
  SyncLevel,
  AuditLogEntry,
  DetailEntityDoc,
  DetailGroupDoc,
} from "../types";

describe("Data model types", () => {
  describe("EntityType enum", () => {
    test("Individual has correct string value", () => {
      expect(EntityType.Individual).toBe("individual");
    });

    test("Group has correct string value", () => {
      expect(EntityType.Group).toBe("group");
    });
  });

  describe("SyncLevel enum", () => {
    test("LOCAL has value 0", () => {
      expect(SyncLevel.LOCAL).toBe(0);
    });

    test("REMOTE has value 1", () => {
      expect(SyncLevel.REMOTE).toBe(1);
    });

    test("EXTERNAL has value 2", () => {
      expect(SyncLevel.EXTERNAL).toBe(2);
    });
  });

  describe("EntityDoc structure", () => {
    test("can create a valid EntityDoc object", () => {
      const entity: EntityDoc = {
        id: "1",
        guid: "550e8400-e29b-41d4-a716-446655440000",
        type: EntityType.Individual,
        version: 1,
        data: { name: "John Doe", age: 30 },
        lastUpdated: "2024-01-01T00:00:00Z",
      };

      expect(entity.id).toBe("1");
      expect(entity.guid).toBeTruthy();
      expect(entity.type).toBe(EntityType.Individual);
      expect(entity.version).toBe(1);
      expect(entity.data.name).toBe("John Doe");
      expect(entity.lastUpdated).toBeTruthy();
    });

    test("can include optional externalId and name fields", () => {
      const entity: EntityDoc = {
        id: "1",
        guid: "entity-1",
        type: EntityType.Individual,
        version: 1,
        data: { name: "Alice" },
        lastUpdated: "2024-01-01T00:00:00Z",
        externalId: "ext-123",
        name: "Alice",
      };

      expect(entity.externalId).toBe("ext-123");
      expect(entity.name).toBe("Alice");
    });

    test("does not require externalId and name fields", () => {
      const entity: EntityDoc = {
        id: "1",
        guid: "entity-1",
        type: EntityType.Individual,
        version: 1,
        data: {},
        lastUpdated: "2024-01-01T00:00:00Z",
      };

      expect(entity.externalId).toBeUndefined();
      expect(entity.name).toBeUndefined();
    });
  });

  describe("EntityPair structure", () => {
    const baseEntity: EntityDoc = {
      id: "1",
      guid: "pair-entity-1",
      type: EntityType.Individual,
      version: 1,
      data: { name: "John Doe" },
      lastUpdated: "2024-01-01T00:00:00Z",
    };

    test("can create EntityPair with same initial and modified (no changes)", () => {
      const pair: EntityPair = {
        guid: baseEntity.guid,
        initial: baseEntity,
        modified: baseEntity,
      };

      expect(pair.guid).toBe(baseEntity.guid);
      expect(pair.initial).toBe(pair.modified);
    });

    test("can create EntityPair with different initial and modified (local changes)", () => {
      const modified: EntityDoc = {
        ...baseEntity,
        version: 2,
        data: { name: "John Doe Updated" },
        lastUpdated: "2024-06-01T00:00:00Z",
      };

      const pair: EntityPair = {
        guid: baseEntity.guid,
        initial: baseEntity,
        modified,
      };

      expect(pair.initial!.version).toBe(1);
      expect(pair.modified.version).toBe(2);
      expect(pair.initial).not.toBe(pair.modified);
    });

    test("has local changes when initial version differs from modified version", () => {
      const modified: EntityDoc = { ...baseEntity, version: 2 };
      const pair: EntityPair = {
        guid: baseEntity.guid,
        initial: baseEntity,
        modified,
      };

      const hasLocalChanges = pair.initial === null || pair.initial.version !== pair.modified.version;
      expect(hasLocalChanges).toBe(true);
    });

    test("has no local changes when initial and modified are identical", () => {
      const pair: EntityPair = {
        guid: baseEntity.guid,
        initial: { ...baseEntity },
        modified: { ...baseEntity },
      };

      const hasLocalChanges = pair.initial === null || pair.initial.version !== pair.modified.version;
      expect(hasLocalChanges).toBe(false);
    });
  });

  describe("FormSubmission structure", () => {
    test("can create a valid FormSubmission", () => {
      const form: FormSubmission = {
        guid: "form-1",
        entityGuid: "entity-1",
        type: "create-individual",
        data: { name: "New Person" },
        timestamp: "2024-01-01T00:00:00Z",
        userId: "user-1",
        syncLevel: SyncLevel.LOCAL,
      };

      expect(form.guid).toBe("form-1");
      expect(form.entityGuid).toBe("entity-1");
      expect(form.type).toBe("create-individual");
      expect(form.syncLevel).toBe(SyncLevel.LOCAL);
    });

    test("supports all standard event types", () => {
      const eventTypes = ["create-individual", "create-group", "add-member", "update-individual", "delete-entity"];

      for (const type of eventTypes) {
        const form: FormSubmission = {
          guid: `form-${type}`,
          entityGuid: "entity-1",
          type,
          data: {},
          timestamp: new Date().toISOString(),
          userId: "user-1",
          syncLevel: SyncLevel.LOCAL,
        };

        expect(form.type).toBe(type);
      }
    });
  });

  describe("GroupDoc structure", () => {
    test("can create a valid GroupDoc with member IDs", () => {
      const group: GroupDoc = {
        id: "group-1",
        guid: "group-1",
        type: EntityType.Group,
        version: 1,
        data: { name: "Smith Family" },
        lastUpdated: "2024-01-01T00:00:00Z",
        memberIds: ["member-1", "member-2"],
      };

      expect(group.type).toBe(EntityType.Group);
      expect(group.memberIds).toHaveLength(2);
      expect(group.memberIds).toContain("member-1");
    });

    test("can have empty member IDs array", () => {
      const group: GroupDoc = {
        id: "group-1",
        guid: "group-1",
        type: EntityType.Group,
        version: 1,
        data: { name: "Empty Group" },
        lastUpdated: "2024-01-01T00:00:00Z",
        memberIds: [],
      };

      expect(group.memberIds).toHaveLength(0);
    });
  });

  describe("IndividualDoc structure", () => {
    test("can create a valid IndividualDoc", () => {
      const individual: IndividualDoc = {
        id: "individual-1",
        guid: "individual-1",
        type: EntityType.Individual,
        version: 1,
        data: { name: "Alice", dateOfBirth: "1990-01-15" },
        lastUpdated: "2024-01-01T00:00:00Z",
      };

      expect(individual.type).toBe(EntityType.Individual);
      expect(individual.data.name).toBe("Alice");
    });
  });

  describe("AuditLogEntry structure", () => {
    test("can create a valid AuditLogEntry", () => {
      const entry: AuditLogEntry = {
        guid: "audit-1",
        timestamp: "2024-01-01T12:00:00Z",
        userId: "user-1",
        action: "create-individual",
        eventGuid: "event-1",
        entityGuid: "entity-1",
        changes: { name: "John Doe" },
        signature: "sha256:abc123",
      };

      expect(entry.guid).toBe("audit-1");
      expect(entry.action).toBe("create-individual");
      expect(entry.signature).toBeTruthy();
    });
  });

  describe("DetailEntityDoc structure", () => {
    test("can create DetailEntityDoc with missing flag", () => {
      const detail: DetailEntityDoc = {
        id: "detail-1",
        guid: "detail-1",
        type: EntityType.Individual,
        version: 1,
        data: {},
        lastUpdated: "2024-01-01T00:00:00Z",
        missing: true,
      };

      expect(detail.missing).toBe(true);
    });

    test("missing field is optional", () => {
      const detail: DetailEntityDoc = {
        id: "detail-1",
        guid: "detail-1",
        type: EntityType.Individual,
        version: 1,
        data: { name: "Alice" },
        lastUpdated: "2024-01-01T00:00:00Z",
      };

      expect(detail.missing).toBeUndefined();
    });
  });

  describe("DetailGroupDoc structure", () => {
    test("can create DetailGroupDoc with member details", () => {
      const memberDetail: DetailEntityDoc = {
        id: "member-1",
        guid: "member-1",
        type: EntityType.Individual,
        version: 1,
        data: { name: "Alice" },
        lastUpdated: "2024-01-01T00:00:00Z",
      };

      const detailGroup: DetailGroupDoc = {
        id: "group-1",
        guid: "group-1",
        type: EntityType.Group,
        version: 1,
        data: { name: "Smith Family" },
        lastUpdated: "2024-01-01T00:00:00Z",
        memberIds: ["member-1"],
        memberCount: 1,
        members: [memberDetail],
      };

      expect(detailGroup.memberCount).toBe(1);
      expect(detailGroup.members).toHaveLength(1);
      expect(detailGroup.members[0].guid).toBe("member-1");
    });
  });
});
