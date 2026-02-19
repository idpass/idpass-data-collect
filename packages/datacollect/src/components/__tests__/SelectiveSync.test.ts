/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

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

import { v4 as uuidv4 } from "uuid";
import {
  EntityDoc,
  EntityPair,
  EntityType,
  FormSubmission,
  SyncLevel,
} from "../../interfaces/types";
import { AreaRecord } from "../../services/AreaService";
import { UserAssignmentRecord, EntityOverrideRecord } from "../../services/AssignmentService";

/**
 * Test suite for the selective sync logic.
 *
 * Uses in-memory mocks to validate that the sync filtering logic
 * correctly applies area-based assignments and entity overrides
 * without requiring a live PostgreSQL database.
 */

// In-memory data stores
interface MockEntity {
  guid: string;
  tenantId: string;
  areaId: string | null;
  data: Record<string, unknown>;
  type: EntityType;
}

interface MockEvent {
  guid: string;
  entityGuid: string;
  tenantId: string;
  timestamp: string;
  type: string;
  data: Record<string, unknown>;
}

class MockAreaService {
  private areas: Map<string, AreaRecord> = new Map();

  addArea(area: AreaRecord): void {
    this.areas.set(area.id, area);
  }

  async getDescendants(areaId: string): Promise<AreaRecord[]> {
    const descendants: AreaRecord[] = [];
    const queue: string[] = [areaId];

    while (queue.length > 0) {
      const parentId = queue.shift()!;
      for (const area of this.areas.values()) {
        if (area.parentId === parentId) {
          descendants.push(area);
          queue.push(area.id);
        }
      }
    }

    return descendants;
  }
}

class MockAssignmentService {
  private assignments: UserAssignmentRecord[] = [];
  private overrides: EntityOverrideRecord[] = [];
  private entities: MockEntity[] = [];
  private areaService: MockAreaService;
  private idCounter = 0;

  constructor(areaService: MockAreaService) {
    this.areaService = areaService;
  }

  addEntity(entity: MockEntity): void {
    this.entities.push(entity);
  }

  async assignUserToArea(
    userId: string,
    tenantId: string,
    areaId: string,
    role: string,
    includeDescendants: boolean = true,
  ): Promise<UserAssignmentRecord> {
    const record: UserAssignmentRecord = {
      id: `assignment-${++this.idCounter}`,
      userId,
      tenantId,
      areaId,
      role,
      includeDescendants,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.assignments.push(record);
    return record;
  }

  async addEntityOverride(
    entityGuid: string,
    userId: string,
    tenantId: string,
    action: "include" | "exclude",
  ): Promise<EntityOverrideRecord> {
    const record: EntityOverrideRecord = {
      id: `override-${++this.idCounter}`,
      entityGuid,
      userId,
      tenantId,
      action,
      createdAt: new Date(),
    };
    this.overrides.push(record);
    return record;
  }

  async getAssignedAreaIds(userId: string, tenantId: string): Promise<string[]> {
    const userAssignments = this.assignments.filter(
      (a) => a.userId === userId && a.tenantId === tenantId,
    );
    const areaIdSet = new Set<string>();

    for (const assignment of userAssignments) {
      if (!assignment.areaId) continue;
      areaIdSet.add(assignment.areaId);

      if (assignment.includeDescendants) {
        const descendants = await this.areaService.getDescendants(assignment.areaId);
        for (const d of descendants) {
          areaIdSet.add(d.id);
        }
      }
    }

    return Array.from(areaIdSet);
  }

  async getAssignedEntityGuids(userId: string, tenantId: string): Promise<string[]> {
    const areaIds = await this.getAssignedAreaIds(userId, tenantId);
    const userOverrides = this.overrides.filter(
      (o) => o.userId === userId && o.tenantId === tenantId,
    );

    const guidSet = new Set<string>();

    for (const entity of this.entities) {
      if (entity.tenantId === tenantId && entity.areaId && areaIds.includes(entity.areaId)) {
        guidSet.add(entity.guid);
      }
    }

    for (const override of userOverrides) {
      if (override.action === "include") {
        guidSet.add(override.entityGuid);
      } else if (override.action === "exclude") {
        guidSet.delete(override.entityGuid);
      }
    }

    return Array.from(guidSet);
  }
}

/**
 * Simulates server-side selective sync pull filtering.
 * This mirrors the logic that would be added to syncRoute.ts.
 */
function filterEventsForUser(
  allEvents: MockEvent[],
  assignedEntityGuids: string[],
): MockEvent[] {
  if (assignedEntityGuids.length === 0) {
    // No assignments = no filtering (admin/global user gets everything)
    return allEvents;
  }

  return allEvents.filter((event) =>
    assignedEntityGuids.includes(event.entityGuid),
  );
}

/**
 * Simulates client-side selective sync request.
 * Client provides its assigned area IDs to limit data transfer.
 */
function filterEntitiesForUser(
  allEntities: MockEntity[],
  assignedEntityGuids: string[],
): MockEntity[] {
  if (assignedEntityGuids.length === 0) {
    return allEntities;
  }

  return allEntities.filter((entity) =>
    assignedEntityGuids.includes(entity.guid),
  );
}

describe("SelectiveSync", () => {
  let areaService: MockAreaService;
  let assignmentService: MockAssignmentService;

  beforeEach(() => {
    areaService = new MockAreaService();
    assignmentService = new MockAssignmentService(areaService);
  });

  describe("server-side event filtering", () => {
    it("returns only events for entities in the user's assigned areas", async () => {
      // Setup areas
      areaService.addArea({ id: "area-1", name: "Area 1", pcode: null, type: "district", level: 2, parentId: null });
      areaService.addArea({ id: "area-2", name: "Area 2", pcode: null, type: "district", level: 2, parentId: null });

      // Setup entities in different areas
      assignmentService.addEntity({ guid: "entity-1", tenantId: "t1", areaId: "area-1", data: {}, type: EntityType.Individual });
      assignmentService.addEntity({ guid: "entity-2", tenantId: "t1", areaId: "area-1", data: {}, type: EntityType.Individual });
      assignmentService.addEntity({ guid: "entity-3", tenantId: "t1", areaId: "area-2", data: {}, type: EntityType.Individual });

      // Assign user to area-1 only
      await assignmentService.assignUserToArea("user-1", "t1", "area-1", "enumerator", false);

      const assignedGuids = await assignmentService.getAssignedEntityGuids("user-1", "t1");

      const allEvents: MockEvent[] = [
        { guid: "evt-1", entityGuid: "entity-1", tenantId: "t1", timestamp: "2024-01-01", type: "update-individual", data: {} },
        { guid: "evt-2", entityGuid: "entity-2", tenantId: "t1", timestamp: "2024-01-02", type: "update-individual", data: {} },
        { guid: "evt-3", entityGuid: "entity-3", tenantId: "t1", timestamp: "2024-01-03", type: "update-individual", data: {} },
      ];

      const filtered = filterEventsForUser(allEvents, assignedGuids);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((e) => e.guid).sort()).toEqual(["evt-1", "evt-2"]);
    });

    it("includes events for entities in descendant areas", async () => {
      areaService.addArea({ id: "region", name: "Region", pcode: null, type: "region", level: 1, parentId: null });
      areaService.addArea({ id: "district", name: "District", pcode: null, type: "district", level: 2, parentId: "region" });

      assignmentService.addEntity({ guid: "entity-in-region", tenantId: "t1", areaId: "region", data: {}, type: EntityType.Individual });
      assignmentService.addEntity({ guid: "entity-in-district", tenantId: "t1", areaId: "district", data: {}, type: EntityType.Individual });

      await assignmentService.assignUserToArea("user-1", "t1", "region", "supervisor", true);

      const assignedGuids = await assignmentService.getAssignedEntityGuids("user-1", "t1");

      const allEvents: MockEvent[] = [
        { guid: "evt-1", entityGuid: "entity-in-region", tenantId: "t1", timestamp: "2024-01-01", type: "create-individual", data: {} },
        { guid: "evt-2", entityGuid: "entity-in-district", tenantId: "t1", timestamp: "2024-01-02", type: "create-individual", data: {} },
      ];

      const filtered = filterEventsForUser(allEvents, assignedGuids);

      expect(filtered).toHaveLength(2);
    });

    it("applies include overrides to add extra entities", async () => {
      areaService.addArea({ id: "area-1", name: "Area 1", pcode: null, type: "district", level: 2, parentId: null });

      assignmentService.addEntity({ guid: "entity-1", tenantId: "t1", areaId: "area-1", data: {}, type: EntityType.Individual });

      await assignmentService.assignUserToArea("user-1", "t1", "area-1", "enumerator", false);
      await assignmentService.addEntityOverride("entity-extra", "user-1", "t1", "include");

      const assignedGuids = await assignmentService.getAssignedEntityGuids("user-1", "t1");

      const allEvents: MockEvent[] = [
        { guid: "evt-1", entityGuid: "entity-1", tenantId: "t1", timestamp: "2024-01-01", type: "update-individual", data: {} },
        { guid: "evt-2", entityGuid: "entity-extra", tenantId: "t1", timestamp: "2024-01-02", type: "update-individual", data: {} },
        { guid: "evt-3", entityGuid: "entity-other", tenantId: "t1", timestamp: "2024-01-03", type: "update-individual", data: {} },
      ];

      const filtered = filterEventsForUser(allEvents, assignedGuids);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((e) => e.entityGuid).sort()).toEqual(["entity-1", "entity-extra"]);
    });

    it("applies exclude overrides to remove entities from results", async () => {
      areaService.addArea({ id: "area-1", name: "Area 1", pcode: null, type: "district", level: 2, parentId: null });

      assignmentService.addEntity({ guid: "entity-1", tenantId: "t1", areaId: "area-1", data: {}, type: EntityType.Individual });
      assignmentService.addEntity({ guid: "entity-2", tenantId: "t1", areaId: "area-1", data: {}, type: EntityType.Individual });

      await assignmentService.assignUserToArea("user-1", "t1", "area-1", "enumerator", false);
      await assignmentService.addEntityOverride("entity-1", "user-1", "t1", "exclude");

      const assignedGuids = await assignmentService.getAssignedEntityGuids("user-1", "t1");

      const allEvents: MockEvent[] = [
        { guid: "evt-1", entityGuid: "entity-1", tenantId: "t1", timestamp: "2024-01-01", type: "update-individual", data: {} },
        { guid: "evt-2", entityGuid: "entity-2", tenantId: "t1", timestamp: "2024-01-02", type: "update-individual", data: {} },
      ];

      const filtered = filterEventsForUser(allEvents, assignedGuids);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].entityGuid).toBe("entity-2");
    });
  });

  describe("client-side entity filtering", () => {
    it("returns only entities matching assigned GUIDs", async () => {
      areaService.addArea({ id: "area-1", name: "Area 1", pcode: null, type: "district", level: 2, parentId: null });

      const allEntities: MockEntity[] = [
        { guid: "entity-1", tenantId: "t1", areaId: "area-1", data: {}, type: EntityType.Individual },
        { guid: "entity-2", tenantId: "t1", areaId: "area-1", data: {}, type: EntityType.Individual },
        { guid: "entity-3", tenantId: "t1", areaId: null, data: {}, type: EntityType.Individual },
      ];

      for (const e of allEntities) {
        assignmentService.addEntity(e);
      }

      await assignmentService.assignUserToArea("user-1", "t1", "area-1", "enumerator", false);

      const assignedGuids = await assignmentService.getAssignedEntityGuids("user-1", "t1");
      const filtered = filterEntitiesForUser(allEntities, assignedGuids);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((e) => e.guid).sort()).toEqual(["entity-1", "entity-2"]);
    });

    it("returns all entities when no assignments exist (admin mode)", async () => {
      const allEntities: MockEntity[] = [
        { guid: "entity-1", tenantId: "t1", areaId: "area-1", data: {}, type: EntityType.Individual },
        { guid: "entity-2", tenantId: "t1", areaId: "area-2", data: {}, type: EntityType.Individual },
      ];

      // Empty array = no filtering
      const filtered = filterEntitiesForUser(allEntities, []);

      expect(filtered).toHaveLength(2);
    });
  });

  describe("reassignment handling", () => {
    it("reflects updated assignments immediately on next sync", async () => {
      areaService.addArea({ id: "area-old", name: "Old Area", pcode: null, type: "district", level: 2, parentId: null });
      areaService.addArea({ id: "area-new", name: "New Area", pcode: null, type: "district", level: 2, parentId: null });

      assignmentService.addEntity({ guid: "entity-1", tenantId: "t1", areaId: "area-old", data: {}, type: EntityType.Individual });
      assignmentService.addEntity({ guid: "entity-2", tenantId: "t1", areaId: "area-new", data: {}, type: EntityType.Individual });

      // Initial assignment to old area
      const oldAssignment = await assignmentService.assignUserToArea("user-1", "t1", "area-old", "enumerator", false);
      let guids = await assignmentService.getAssignedEntityGuids("user-1", "t1");
      expect(guids).toEqual(["entity-1"]);

      // Reassign to new area (simulate by adding new assignment; old still exists in this mock)
      await assignmentService.assignUserToArea("user-1", "t1", "area-new", "enumerator", false);

      guids = await assignmentService.getAssignedEntityGuids("user-1", "t1");
      expect(guids.sort()).toEqual(["entity-1", "entity-2"]);
    });
  });

  describe("multi-level area hierarchy filtering", () => {
    it("correctly filters across 3 levels of hierarchy", async () => {
      areaService.addArea({ id: "country", name: "Country", pcode: null, type: "country", level: 0, parentId: null });
      areaService.addArea({ id: "region-a", name: "Region A", pcode: null, type: "region", level: 1, parentId: "country" });
      areaService.addArea({ id: "region-b", name: "Region B", pcode: null, type: "region", level: 1, parentId: "country" });
      areaService.addArea({ id: "district-a1", name: "District A1", pcode: null, type: "district", level: 2, parentId: "region-a" });
      areaService.addArea({ id: "district-a2", name: "District A2", pcode: null, type: "district", level: 2, parentId: "region-a" });
      areaService.addArea({ id: "district-b1", name: "District B1", pcode: null, type: "district", level: 2, parentId: "region-b" });

      // Entities spread across areas
      assignmentService.addEntity({ guid: "e-country", tenantId: "t1", areaId: "country", data: {}, type: EntityType.Group });
      assignmentService.addEntity({ guid: "e-region-a", tenantId: "t1", areaId: "region-a", data: {}, type: EntityType.Group });
      assignmentService.addEntity({ guid: "e-district-a1", tenantId: "t1", areaId: "district-a1", data: {}, type: EntityType.Individual });
      assignmentService.addEntity({ guid: "e-district-a2", tenantId: "t1", areaId: "district-a2", data: {}, type: EntityType.Individual });
      assignmentService.addEntity({ guid: "e-region-b", tenantId: "t1", areaId: "region-b", data: {}, type: EntityType.Group });
      assignmentService.addEntity({ guid: "e-district-b1", tenantId: "t1", areaId: "district-b1", data: {}, type: EntityType.Individual });

      // User assigned to Region A (with descendants)
      await assignmentService.assignUserToArea("user-1", "t1", "region-a", "supervisor", true);

      const guids = await assignmentService.getAssignedEntityGuids("user-1", "t1");
      expect(guids.sort()).toEqual(["e-district-a1", "e-district-a2", "e-region-a"]);

      // User assigned to Country (with descendants) should see everything
      await assignmentService.assignUserToArea("user-2", "t1", "country", "program-admin", true);

      // Add entities for user-2
      const mockAssignment2 = new MockAssignmentService(areaService);
      for (const guid of ["e-country", "e-region-a", "e-district-a1", "e-district-a2", "e-region-b", "e-district-b1"]) {
        mockAssignment2.addEntity({
          guid,
          tenantId: "t1",
          areaId: areaService.constructor === MockAreaService
            ? (() => {
                // Find area from our known entities
                const entityAreaMap: Record<string, string> = {
                  "e-country": "country",
                  "e-region-a": "region-a",
                  "e-district-a1": "district-a1",
                  "e-district-a2": "district-a2",
                  "e-region-b": "region-b",
                  "e-district-b1": "district-b1",
                };
                return entityAreaMap[guid] || null;
              })()
            : null,
          data: {},
          type: EntityType.Individual,
        });
      }
      await mockAssignment2.assignUserToArea("user-2", "t1", "country", "program-admin", true);
      const guids2 = await mockAssignment2.getAssignedEntityGuids("user-2", "t1");
      expect(guids2.sort()).toEqual([
        "e-country",
        "e-district-a1",
        "e-district-a2",
        "e-district-b1",
        "e-region-a",
        "e-region-b",
      ]);
    });
  });
});
