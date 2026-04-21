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

import { AreaRecord } from "../AreaService";
import {
  UserAssignmentRecord,
  EntityOverrideRecord,
} from "../AssignmentService";

/**
 * In-memory mock for AreaService (used by InMemoryAssignmentService).
 */
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

/**
 * In-memory entity store for testing getAssignedEntityGuids.
 */
interface MockEntity {
  guid: string;
  tenantId: string;
  areaId: string | null;
}

/**
 * In-memory mock for AssignmentService that avoids requiring PostgreSQL.
 */
class InMemoryAssignmentService {
  private assignments: Map<string, UserAssignmentRecord> = new Map();
  private overrides: Map<string, EntityOverrideRecord> = new Map();
  private entities: MockEntity[] = [];
  private idCounter = 0;
  private areaService: MockAreaService;

  constructor(areaService: MockAreaService) {
    this.areaService = areaService;
  }

  async initialize(): Promise<void> {}

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
    const id = `assignment-${++this.idCounter}`;
    const now = new Date();
    const record: UserAssignmentRecord = {
      id,
      userId,
      tenantId,
      areaId,
      role,
      includeDescendants,
      createdAt: now,
      updatedAt: now,
    };
    this.assignments.set(id, record);
    return record;
  }

  async removeAssignment(assignmentId: string): Promise<void> {
    this.assignments.delete(assignmentId);
  }

  async getUserAssignments(userId: string, tenantId: string): Promise<UserAssignmentRecord[]> {
    const result: UserAssignmentRecord[] = [];
    for (const a of this.assignments.values()) {
      if (a.userId === userId && a.tenantId === tenantId) {
        result.push(a);
      }
    }
    return result;
  }

  async getAssignedAreaIds(userId: string, tenantId: string): Promise<string[]> {
    const assignments = await this.getUserAssignments(userId, tenantId);
    const areaIdSet = new Set<string>();

    for (const assignment of assignments) {
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

  async addEntityOverride(
    entityGuid: string,
    userId: string,
    tenantId: string,
    action: "include" | "exclude",
  ): Promise<EntityOverrideRecord> {
    const id = `override-${++this.idCounter}`;
    const now = new Date();
    const record: EntityOverrideRecord = {
      id,
      entityGuid,
      userId,
      tenantId,
      action,
      createdAt: now,
    };
    this.overrides.set(id, record);
    return record;
  }

  async removeEntityOverride(overrideId: string): Promise<void> {
    this.overrides.delete(overrideId);
  }

  async getEntityOverrides(userId: string, tenantId: string): Promise<EntityOverrideRecord[]> {
    const result: EntityOverrideRecord[] = [];
    for (const o of this.overrides.values()) {
      if (o.userId === userId && o.tenantId === tenantId) {
        result.push(o);
      }
    }
    return result;
  }

  async getAssignedEntityGuids(userId: string, tenantId: string): Promise<string[]> {
    const areaIds = await this.getAssignedAreaIds(userId, tenantId);
    const overrides = await this.getEntityOverrides(userId, tenantId);
    const guidSet = new Set<string>();

    // Get entities from assigned areas
    for (const entity of this.entities) {
      if (entity.tenantId === tenantId && entity.areaId && areaIds.includes(entity.areaId)) {
        guidSet.add(entity.guid);
      }
    }

    // Apply overrides
    for (const override of overrides) {
      if (override.action === "include") {
        guidSet.add(override.entityGuid);
      } else if (override.action === "exclude") {
        guidSet.delete(override.entityGuid);
      }
    }

    return Array.from(guidSet);
  }

  async clearStore(): Promise<void> {
    this.assignments.clear();
    this.overrides.clear();
    this.entities = [];
  }

  async closeConnection(): Promise<void> {}
}

describe("AssignmentService", () => {
  let areaService: MockAreaService;
  let service: InMemoryAssignmentService;

  beforeEach(async () => {
    areaService = new MockAreaService();
    service = new InMemoryAssignmentService(areaService);
    await service.initialize();
  });

  afterEach(async () => {
    await service.clearStore();
    await service.closeConnection();
  });

  describe("assignUserToArea()", () => {
    it("creates an assignment with all fields", async () => {
      const assignment = await service.assignUserToArea("user-1", "tenant-1", "area-1", "enumerator");

      expect(assignment.id).toBeTruthy();
      expect(assignment.userId).toBe("user-1");
      expect(assignment.tenantId).toBe("tenant-1");
      expect(assignment.areaId).toBe("area-1");
      expect(assignment.role).toBe("enumerator");
      expect(assignment.includeDescendants).toBe(true);
    });

    it("respects includeDescendants=false", async () => {
      const assignment = await service.assignUserToArea("user-1", "tenant-1", "area-1", "viewer", false);

      expect(assignment.includeDescendants).toBe(false);
    });

    it("allows multiple assignments for the same user", async () => {
      await service.assignUserToArea("user-1", "tenant-1", "area-1", "enumerator");
      await service.assignUserToArea("user-1", "tenant-1", "area-2", "supervisor");

      const assignments = await service.getUserAssignments("user-1", "tenant-1");
      expect(assignments).toHaveLength(2);
    });
  });

  describe("removeAssignment()", () => {
    it("removes an existing assignment", async () => {
      const assignment = await service.assignUserToArea("user-1", "tenant-1", "area-1", "enumerator");

      await service.removeAssignment(assignment.id);

      const assignments = await service.getUserAssignments("user-1", "tenant-1");
      expect(assignments).toHaveLength(0);
    });

    it("does not error when removing a nonexistent assignment", async () => {
      await expect(service.removeAssignment("nonexistent")).resolves.not.toThrow();
    });
  });

  describe("getUserAssignments()", () => {
    it("returns only assignments for the specified user and tenant", async () => {
      await service.assignUserToArea("user-1", "tenant-1", "area-1", "enumerator");
      await service.assignUserToArea("user-2", "tenant-1", "area-2", "supervisor");
      await service.assignUserToArea("user-1", "tenant-2", "area-3", "viewer");

      const assignments = await service.getUserAssignments("user-1", "tenant-1");
      expect(assignments).toHaveLength(1);
      expect(assignments[0].areaId).toBe("area-1");
    });

    it("returns empty array when user has no assignments", async () => {
      const assignments = await service.getUserAssignments("unknown-user", "tenant-1");
      expect(assignments).toHaveLength(0);
    });
  });

  describe("getAssignedAreaIds()", () => {
    it("returns the directly assigned area", async () => {
      await service.assignUserToArea("user-1", "tenant-1", "area-1", "enumerator", false);

      const areaIds = await service.getAssignedAreaIds("user-1", "tenant-1");
      expect(areaIds).toEqual(["area-1"]);
    });

    it("includes descendant areas when includeDescendants is true", async () => {
      areaService.addArea({ id: "country", name: "Country", pcode: null, type: "country", level: 0, parentId: null });
      areaService.addArea({ id: "region-1", name: "Region 1", pcode: null, type: "region", level: 1, parentId: "country" });
      areaService.addArea({ id: "district-1", name: "District 1", pcode: null, type: "district", level: 2, parentId: "region-1" });

      await service.assignUserToArea("user-1", "tenant-1", "country", "enumerator", true);

      const areaIds = await service.getAssignedAreaIds("user-1", "tenant-1");
      expect(areaIds.sort()).toEqual(["country", "district-1", "region-1"]);
    });

    it("does not include descendants when includeDescendants is false", async () => {
      areaService.addArea({ id: "country", name: "Country", pcode: null, type: "country", level: 0, parentId: null });
      areaService.addArea({ id: "region-1", name: "Region 1", pcode: null, type: "region", level: 1, parentId: "country" });

      await service.assignUserToArea("user-1", "tenant-1", "country", "enumerator", false);

      const areaIds = await service.getAssignedAreaIds("user-1", "tenant-1");
      expect(areaIds).toEqual(["country"]);
    });

    it("deduplicates area IDs across multiple assignments", async () => {
      areaService.addArea({ id: "parent", name: "Parent", pcode: null, type: "region", level: 1, parentId: null });
      areaService.addArea({ id: "child", name: "Child", pcode: null, type: "district", level: 2, parentId: "parent" });

      // Both assignments cover "child" (directly and via parent)
      await service.assignUserToArea("user-1", "tenant-1", "parent", "enumerator", true);
      await service.assignUserToArea("user-1", "tenant-1", "child", "supervisor", false);

      const areaIds = await service.getAssignedAreaIds("user-1", "tenant-1");
      // Should not have duplicates
      expect(areaIds.sort()).toEqual(["child", "parent"]);
    });
  });

  describe("addEntityOverride()", () => {
    it("creates an include override", async () => {
      const override = await service.addEntityOverride("entity-1", "user-1", "tenant-1", "include");

      expect(override.id).toBeTruthy();
      expect(override.entityGuid).toBe("entity-1");
      expect(override.action).toBe("include");
    });

    it("creates an exclude override", async () => {
      const override = await service.addEntityOverride("entity-2", "user-1", "tenant-1", "exclude");

      expect(override.action).toBe("exclude");
    });
  });

  describe("removeEntityOverride()", () => {
    it("removes an existing override", async () => {
      const override = await service.addEntityOverride("entity-1", "user-1", "tenant-1", "include");

      await service.removeEntityOverride(override.id);

      const overrides = await service.getEntityOverrides("user-1", "tenant-1");
      expect(overrides).toHaveLength(0);
    });
  });

  describe("getEntityOverrides()", () => {
    it("returns only overrides for the specified user and tenant", async () => {
      await service.addEntityOverride("entity-1", "user-1", "tenant-1", "include");
      await service.addEntityOverride("entity-2", "user-2", "tenant-1", "exclude");

      const overrides = await service.getEntityOverrides("user-1", "tenant-1");
      expect(overrides).toHaveLength(1);
      expect(overrides[0].entityGuid).toBe("entity-1");
    });
  });

  describe("getAssignedEntityGuids()", () => {
    it("returns entities in assigned areas", async () => {
      service.addEntity({ guid: "entity-1", tenantId: "tenant-1", areaId: "area-1" });
      service.addEntity({ guid: "entity-2", tenantId: "tenant-1", areaId: "area-1" });
      service.addEntity({ guid: "entity-3", tenantId: "tenant-1", areaId: "area-2" });

      await service.assignUserToArea("user-1", "tenant-1", "area-1", "enumerator", false);

      const guids = await service.getAssignedEntityGuids("user-1", "tenant-1");
      expect(guids.sort()).toEqual(["entity-1", "entity-2"]);
    });

    it("includes entities from descendant areas", async () => {
      areaService.addArea({ id: "parent", name: "Parent", pcode: null, type: "region", level: 1, parentId: null });
      areaService.addArea({ id: "child", name: "Child", pcode: null, type: "district", level: 2, parentId: "parent" });

      service.addEntity({ guid: "entity-1", tenantId: "tenant-1", areaId: "parent" });
      service.addEntity({ guid: "entity-2", tenantId: "tenant-1", areaId: "child" });

      await service.assignUserToArea("user-1", "tenant-1", "parent", "enumerator", true);

      const guids = await service.getAssignedEntityGuids("user-1", "tenant-1");
      expect(guids.sort()).toEqual(["entity-1", "entity-2"]);
    });

    it("applies include overrides to add extra entities", async () => {
      service.addEntity({ guid: "entity-1", tenantId: "tenant-1", areaId: "area-1" });

      await service.assignUserToArea("user-1", "tenant-1", "area-1", "enumerator", false);
      await service.addEntityOverride("entity-extra", "user-1", "tenant-1", "include");

      const guids = await service.getAssignedEntityGuids("user-1", "tenant-1");
      expect(guids.sort()).toEqual(["entity-1", "entity-extra"]);
    });

    it("applies exclude overrides to remove entities from area-based results", async () => {
      service.addEntity({ guid: "entity-1", tenantId: "tenant-1", areaId: "area-1" });
      service.addEntity({ guid: "entity-2", tenantId: "tenant-1", areaId: "area-1" });

      await service.assignUserToArea("user-1", "tenant-1", "area-1", "enumerator", false);
      await service.addEntityOverride("entity-1", "user-1", "tenant-1", "exclude");

      const guids = await service.getAssignedEntityGuids("user-1", "tenant-1");
      expect(guids).toEqual(["entity-2"]);
    });

    it("returns empty array when user has no assignments and no overrides", async () => {
      const guids = await service.getAssignedEntityGuids("user-1", "tenant-1");
      expect(guids).toHaveLength(0);
    });

    it("returns only include overrides when user has no area assignments", async () => {
      await service.addEntityOverride("entity-1", "user-1", "tenant-1", "include");

      const guids = await service.getAssignedEntityGuids("user-1", "tenant-1");
      expect(guids).toEqual(["entity-1"]);
    });

    it("handles cross-tenant isolation correctly", async () => {
      service.addEntity({ guid: "entity-1", tenantId: "tenant-1", areaId: "area-1" });
      service.addEntity({ guid: "entity-2", tenantId: "tenant-2", areaId: "area-1" });

      await service.assignUserToArea("user-1", "tenant-1", "area-1", "enumerator", false);

      const guids = await service.getAssignedEntityGuids("user-1", "tenant-1");
      expect(guids).toEqual(["entity-1"]);
    });
  });
});
