/**
 * @jest-environment jsdom
 */

import "core-js/stable/structured-clone";
import "fake-indexeddb/auto";

import { SystemRole, UserRoleAssignment, Area } from "../../interfaces/types";
import { RbacService, ROLE_HIERARCHY, RbacAction } from "../RbacService";

describe("RbacService", () => {
  let service: RbacService;

  beforeEach(() => {
    service = new RbacService();
  });

  describe("ROLE_HIERARCHY", () => {
    it("defines the correct hierarchy levels", () => {
      expect(ROLE_HIERARCHY[SystemRole.SYSTEM_ADMIN]).toBe(100);
      expect(ROLE_HIERARCHY[SystemRole.PROGRAM_ADMIN]).toBe(80);
      expect(ROLE_HIERARCHY[SystemRole.SUPERVISOR]).toBe(60);
      expect(ROLE_HIERARCHY[SystemRole.ENUMERATOR]).toBe(40);
      expect(ROLE_HIERARCHY[SystemRole.VIEWER]).toBe(20);
    });

    it("maintains that system-admin has the highest permission level", () => {
      const roles = Object.values(SystemRole);
      for (const role of roles) {
        expect(ROLE_HIERARCHY[SystemRole.SYSTEM_ADMIN]).toBeGreaterThanOrEqual(ROLE_HIERARCHY[role]);
      }
    });
  });

  describe("hasPermission()", () => {
    it("returns true when user role equals minimum required role", () => {
      expect(service.hasPermission(SystemRole.ENUMERATOR, SystemRole.ENUMERATOR)).toBe(true);
    });

    it("returns true when user role exceeds minimum required role", () => {
      expect(service.hasPermission(SystemRole.SUPERVISOR, SystemRole.ENUMERATOR)).toBe(true);
      expect(service.hasPermission(SystemRole.SYSTEM_ADMIN, SystemRole.VIEWER)).toBe(true);
    });

    it("returns false when user role is below minimum required role", () => {
      expect(service.hasPermission(SystemRole.VIEWER, SystemRole.ENUMERATOR)).toBe(false);
      expect(service.hasPermission(SystemRole.ENUMERATOR, SystemRole.SUPERVISOR)).toBe(false);
    });

    it("returns false for unknown roles", () => {
      expect(service.hasPermission("unknown" as SystemRole, SystemRole.VIEWER)).toBe(false);
    });
  });

  describe("canPerformAction()", () => {
    it("allows viewer to perform read action", () => {
      expect(service.canPerformAction(SystemRole.VIEWER, "read")).toBe(true);
    });

    it("denies viewer from performing create action", () => {
      expect(service.canPerformAction(SystemRole.VIEWER, "create")).toBe(false);
    });

    it("allows enumerator to perform create and update actions", () => {
      expect(service.canPerformAction(SystemRole.ENUMERATOR, "create")).toBe(true);
      expect(service.canPerformAction(SystemRole.ENUMERATOR, "update")).toBe(true);
    });

    it("denies enumerator from performing delete action", () => {
      expect(service.canPerformAction(SystemRole.ENUMERATOR, "delete")).toBe(false);
    });

    it("allows supervisor to perform delete and approve actions", () => {
      expect(service.canPerformAction(SystemRole.SUPERVISOR, "delete")).toBe(true);
      expect(service.canPerformAction(SystemRole.SUPERVISOR, "approve")).toBe(true);
    });

    it("allows program-admin to manage users", () => {
      expect(service.canPerformAction(SystemRole.PROGRAM_ADMIN, "manage-users")).toBe(true);
    });

    it("denies supervisor from managing users", () => {
      expect(service.canPerformAction(SystemRole.SUPERVISOR, "manage-users")).toBe(false);
    });

    it("allows system-admin to manage config", () => {
      expect(service.canPerformAction(SystemRole.SYSTEM_ADMIN, "manage-config")).toBe(true);
    });

    it("denies program-admin from managing config", () => {
      expect(service.canPerformAction(SystemRole.PROGRAM_ADMIN, "manage-config")).toBe(false);
    });

    it("returns false for unknown actions", () => {
      expect(service.canPerformAction(SystemRole.SYSTEM_ADMIN, "unknown-action" as RbacAction)).toBe(false);
    });

    it("allows higher roles to perform lower-role actions", () => {
      expect(service.canPerformAction(SystemRole.SYSTEM_ADMIN, "read")).toBe(true);
      expect(service.canPerformAction(SystemRole.SYSTEM_ADMIN, "create")).toBe(true);
      expect(service.canPerformAction(SystemRole.SYSTEM_ADMIN, "delete")).toBe(true);
      expect(service.canPerformAction(SystemRole.SYSTEM_ADMIN, "approve")).toBe(true);
      expect(service.canPerformAction(SystemRole.SYSTEM_ADMIN, "manage-users")).toBe(true);
    });
  });

  describe("getUserEffectiveRole()", () => {
    it("returns the highest role for a user in a tenant", () => {
      const assignments: UserRoleAssignment[] = [
        { userId: "user-1", programId: "tenant-1", role: SystemRole.VIEWER, areaCodes: [], isGlobal: true },
        { userId: "user-1", programId: "tenant-1", role: SystemRole.SUPERVISOR, areaCodes: [], isGlobal: true },
        { userId: "user-1", programId: "tenant-1", role: SystemRole.ENUMERATOR, areaCodes: ["area-1"], isGlobal: false },
      ];

      const role = service.getUserEffectiveRole("user-1", "tenant-1", assignments);
      expect(role).toBe(SystemRole.SUPERVISOR);
    });

    it("returns null when user has no assignments in the tenant", () => {
      const assignments: UserRoleAssignment[] = [
        { userId: "user-1", programId: "tenant-2", role: SystemRole.SUPERVISOR, areaCodes: [], isGlobal: true },
      ];

      const role = service.getUserEffectiveRole("user-1", "tenant-1", assignments);
      expect(role).toBeNull();
    });

    it("returns null for empty assignments", () => {
      const role = service.getUserEffectiveRole("user-1", "tenant-1", []);
      expect(role).toBeNull();
    });

    it("correctly filters by both userId and tenantId", () => {
      const assignments: UserRoleAssignment[] = [
        { userId: "user-1", programId: "tenant-1", role: SystemRole.VIEWER, areaCodes: [], isGlobal: true },
        { userId: "user-2", programId: "tenant-1", role: SystemRole.SYSTEM_ADMIN, areaCodes: [], isGlobal: true },
        { userId: "user-1", programId: "tenant-2", role: SystemRole.PROGRAM_ADMIN, areaCodes: [], isGlobal: true },
      ];

      const role = service.getUserEffectiveRole("user-1", "tenant-1", assignments);
      expect(role).toBe(SystemRole.VIEWER);
    });
  });

  describe("canAccessArea()", () => {
    const areas: Area[] = [
      { code: "KH", name: "Cambodia", type: "admin0", parentCode: null },
      { code: "KH01", name: "Province 1", type: "admin1", parentCode: "KH" },
      { code: "KH0101", name: "District 1", type: "admin2", parentCode: "KH01" },
      { code: "KH0102", name: "District 2", type: "admin2", parentCode: "KH01" },
      { code: "KH02", name: "Province 2", type: "admin1", parentCode: "KH" },
    ];

    it("returns true when user is assigned to the exact area", () => {
      const assignments: UserRoleAssignment[] = [
        { userId: "user-1", programId: "tenant-1", role: SystemRole.ENUMERATOR, areaCodes: ["KH0101"], isGlobal: false },
      ];

      expect(service.canAccessArea("user-1", "tenant-1", "KH0101", assignments, areas)).toBe(true);
    });

    it("returns true when user is assigned to a parent area", () => {
      const assignments: UserRoleAssignment[] = [
        { userId: "user-1", programId: "tenant-1", role: SystemRole.SUPERVISOR, areaCodes: ["KH01"], isGlobal: false },
      ];

      expect(service.canAccessArea("user-1", "tenant-1", "KH0101", assignments, areas)).toBe(true);
      expect(service.canAccessArea("user-1", "tenant-1", "KH0102", assignments, areas)).toBe(true);
    });

    it("returns true when user has a global role assignment (empty areaCodes)", () => {
      const assignments: UserRoleAssignment[] = [
        { userId: "user-1", programId: "tenant-1", role: SystemRole.SUPERVISOR, areaCodes: [], isGlobal: true },
      ];

      expect(service.canAccessArea("user-1", "tenant-1", "KH0101", assignments, areas)).toBe(true);
    });

    it("returns false when user is not assigned to the area or its ancestors", () => {
      const assignments: UserRoleAssignment[] = [
        { userId: "user-1", programId: "tenant-1", role: SystemRole.ENUMERATOR, areaCodes: ["KH02"], isGlobal: false },
      ];

      expect(service.canAccessArea("user-1", "tenant-1", "KH0101", assignments, areas)).toBe(false);
    });

    it("returns false when user has no assignments in the tenant", () => {
      const assignments: UserRoleAssignment[] = [
        { userId: "user-1", programId: "tenant-2", role: SystemRole.ENUMERATOR, areaCodes: ["KH0101"], isGlobal: false },
      ];

      expect(service.canAccessArea("user-1", "tenant-1", "KH0101", assignments, areas)).toBe(false);
    });

    it("handles top-level area assignment covering all descendants", () => {
      const assignments: UserRoleAssignment[] = [
        { userId: "user-1", programId: "tenant-1", role: SystemRole.SUPERVISOR, areaCodes: ["KH"], isGlobal: false },
      ];

      expect(service.canAccessArea("user-1", "tenant-1", "KH01", assignments, areas)).toBe(true);
      expect(service.canAccessArea("user-1", "tenant-1", "KH0101", assignments, areas)).toBe(true);
      expect(service.canAccessArea("user-1", "tenant-1", "KH02", assignments, areas)).toBe(true);
    });
  });

  describe("canAccessEntity()", () => {
    it("returns true when user has global access", () => {
      const assignments: UserRoleAssignment[] = [
        { userId: "user-1", programId: "tenant-1", role: SystemRole.SUPERVISOR, areaCodes: [], isGlobal: true },
      ];

      expect(service.canAccessEntity("user-1", "tenant-1", "entity-1", assignments, undefined, [])).toBe(true);
    });

    it("returns true when entity area matches user area", () => {
      const assignments: UserRoleAssignment[] = [
        { userId: "user-1", programId: "tenant-1", role: SystemRole.ENUMERATOR, areaCodes: ["KH01"], isGlobal: false },
      ];

      const areas: Area[] = [
        { code: "KH", name: "Cambodia", type: "admin0", parentCode: null },
        { code: "KH01", name: "Province 1", type: "admin1", parentCode: "KH" },
      ];

      expect(service.canAccessEntity("user-1", "tenant-1", "entity-1", assignments, "KH01", areas)).toBe(true);
    });

    it("returns false when entity area does not match user area", () => {
      const assignments: UserRoleAssignment[] = [
        { userId: "user-1", programId: "tenant-1", role: SystemRole.ENUMERATOR, areaCodes: ["KH02"], isGlobal: false },
      ];

      const areas: Area[] = [
        { code: "KH", name: "Cambodia", type: "admin0", parentCode: null },
        { code: "KH01", name: "Province 1", type: "admin1", parentCode: "KH" },
        { code: "KH02", name: "Province 2", type: "admin1", parentCode: "KH" },
      ];

      expect(service.canAccessEntity("user-1", "tenant-1", "entity-1", assignments, "KH01", areas)).toBe(false);
    });

    it("returns true when entity has no area (accessible to anyone with tenant access)", () => {
      const assignments: UserRoleAssignment[] = [
        { userId: "user-1", programId: "tenant-1", role: SystemRole.ENUMERATOR, areaCodes: ["KH01"], isGlobal: false },
      ];

      expect(service.canAccessEntity("user-1", "tenant-1", "entity-1", assignments, undefined, [])).toBe(true);
    });
  });

  describe("getMinimumRoleForAction()", () => {
    it("returns the correct minimum role for each action", () => {
      expect(service.getMinimumRoleForAction("read")).toBe(SystemRole.VIEWER);
      expect(service.getMinimumRoleForAction("create")).toBe(SystemRole.ENUMERATOR);
      expect(service.getMinimumRoleForAction("update")).toBe(SystemRole.ENUMERATOR);
      expect(service.getMinimumRoleForAction("delete")).toBe(SystemRole.SUPERVISOR);
      expect(service.getMinimumRoleForAction("approve")).toBe(SystemRole.SUPERVISOR);
      expect(service.getMinimumRoleForAction("manage-users")).toBe(SystemRole.PROGRAM_ADMIN);
      expect(service.getMinimumRoleForAction("manage-config")).toBe(SystemRole.SYSTEM_ADMIN);
    });

    it("returns null for unknown actions", () => {
      expect(service.getMinimumRoleForAction("unknown-action" as RbacAction)).toBeNull();
    });
  });
});
