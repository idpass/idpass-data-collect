import { Request, Response, NextFunction } from "express";
import { SystemRole } from "@idpass/data-collect-core";
import { requireRole, requireAction, resolveRoleInTenant, canPerformActionInTenant } from "../middlewares/rbac";
import { AuthenticatedRequest, DecodedPayload } from "../middlewares/authentication";
import { Role } from "../types";

const JWT_SECRET = "test-rbac-secret";

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    query: {},
    body: {},
    params: {},
    ...overrides,
  } as unknown as Request;
}

function mockResponse(): Response {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockNext(): NextFunction {
  return jest.fn();
}

function createAuthenticatedRequest(
  roleAssignments: Array<{ tenantId: string; role: string; areaId?: string }>,
  overrides: Partial<Request> = {},
): Request {
  const user = {
    id: "user-1",
    email: "test@example.com",
    role: Role.USER,
    tenantIds: ["tenant-1"],
    roleAssignments,
  };

  const req = mockRequest(overrides);
  (req as AuthenticatedRequest).user = user;
  return req;
}

describe("RBAC Middleware", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
  });

  describe("requireRole()", () => {
    it("calls next() when user has sufficient role", () => {
      const req = createAuthenticatedRequest([
        { tenantId: "tenant-1", role: SystemRole.SUPERVISOR },
      ]);
      const res = mockResponse();
      const next = mockNext();

      requireRole(SystemRole.ENUMERATOR)(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it("calls next() when user has exact required role", () => {
      const req = createAuthenticatedRequest([
        { tenantId: "tenant-1", role: SystemRole.ENUMERATOR },
      ]);
      const res = mockResponse();
      const next = mockNext();

      requireRole(SystemRole.ENUMERATOR)(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("returns 403 when user has insufficient role", () => {
      const req = createAuthenticatedRequest([
        { tenantId: "tenant-1", role: SystemRole.VIEWER },
      ]);
      const res = mockResponse();
      const next = mockNext();

      requireRole(SystemRole.ENUMERATOR)(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: "Forbidden: Insufficient role",
        required: SystemRole.ENUMERATOR,
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 when user is not authenticated", () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      requireRole(SystemRole.VIEWER)(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Authentication required" });
      expect(next).not.toHaveBeenCalled();
    });

    it("allows admin users to bypass role checks", () => {
      const req = mockRequest();
      (req as AuthenticatedRequest).user = {
        id: "admin-1",
        email: "admin@example.com",
        role: Role.ADMIN,
        tenantIds: [],
      };
      const res = mockResponse();
      const next = mockNext();

      requireRole(SystemRole.SYSTEM_ADMIN)(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("returns 403 when user has no role assignments", () => {
      const req = createAuthenticatedRequest([]);
      const res = mockResponse();
      const next = mockNext();

      requireRole(SystemRole.VIEWER)(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("uses the highest role from multiple assignments", () => {
      const req = createAuthenticatedRequest([
        { tenantId: "tenant-1", role: SystemRole.VIEWER },
        { tenantId: "tenant-1", role: SystemRole.SUPERVISOR },
        { tenantId: "tenant-2", role: SystemRole.ENUMERATOR },
      ]);
      const res = mockResponse();
      const next = mockNext();

      requireRole(SystemRole.SUPERVISOR)(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe("requireAction()", () => {
    it("calls next() when user can perform the action", () => {
      const req = createAuthenticatedRequest([
        { tenantId: "tenant-1", role: SystemRole.ENUMERATOR },
      ]);
      const res = mockResponse();
      const next = mockNext();

      requireAction("create")(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("returns 403 when user cannot perform the action", () => {
      const req = createAuthenticatedRequest([
        { tenantId: "tenant-1", role: SystemRole.VIEWER },
      ]);
      const res = mockResponse();
      const next = mockNext();

      requireAction("create")(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("allows admin users to perform any action", () => {
      const req = mockRequest();
      (req as AuthenticatedRequest).user = {
        id: "admin-1",
        email: "admin@example.com",
        role: Role.ADMIN,
        tenantIds: [],
      };
      const res = mockResponse();
      const next = mockNext();

      requireAction("manage-config")(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("returns 401 when user is not authenticated", () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();

      requireAction("read")(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it("handles supervisor approve action", () => {
      const req = createAuthenticatedRequest([
        { tenantId: "tenant-1", role: SystemRole.SUPERVISOR },
      ]);
      const res = mockResponse();
      const next = mockNext();

      requireAction("approve")(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("denies enumerator approve action", () => {
      const req = createAuthenticatedRequest([
        { tenantId: "tenant-1", role: SystemRole.ENUMERATOR },
      ]);
      const res = mockResponse();
      const next = mockNext();

      requireAction("approve")(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("resolveRoleInTenant()", () => {
    const user = (
      roleAssignments: Array<{ tenantId: string; role: string }>,
      role: Role = Role.USER,
    ): DecodedPayload => ({
      id: "user-1",
      email: "test@example.com",
      role,
      tenantIds: roleAssignments.map((a) => a.tenantId),
      roleAssignments,
    });

    it("returns the role the user holds in the requested tenant", () => {
      const u = user([
        { tenantId: "tenant-a", role: SystemRole.SUPERVISOR },
        { tenantId: "tenant-b", role: SystemRole.VIEWER },
      ]);
      expect(resolveRoleInTenant(u, "tenant-b")).toBe(SystemRole.VIEWER);
    });

    it("does NOT leak a role from another tenant (global max is ignored)", () => {
      const u = user([
        { tenantId: "tenant-a", role: SystemRole.SUPERVISOR },
        { tenantId: "tenant-b", role: SystemRole.VIEWER },
      ]);
      // The user is a supervisor in tenant-a, but only a viewer in tenant-b.
      expect(resolveRoleInTenant(u, "tenant-b")).not.toBe(SystemRole.SUPERVISOR);
    });

    it("returns the highest role when the user has several assignments in one tenant", () => {
      const u = user([
        { tenantId: "tenant-a", role: SystemRole.VIEWER },
        { tenantId: "tenant-a", role: SystemRole.SUPERVISOR },
      ]);
      expect(resolveRoleInTenant(u, "tenant-a")).toBe(SystemRole.SUPERVISOR);
    });

    it("returns null when the user has no assignment in the tenant", () => {
      const u = user([{ tenantId: "tenant-a", role: SystemRole.SUPERVISOR }]);
      expect(resolveRoleInTenant(u, "tenant-b")).toBeNull();
    });

    it("treats a legacy admin as system-admin in every tenant", () => {
      const u = user([], Role.ADMIN);
      expect(resolveRoleInTenant(u, "any-tenant")).toBe(SystemRole.SYSTEM_ADMIN);
    });

    it("returns null for an undefined user", () => {
      expect(resolveRoleInTenant(undefined, "tenant-a")).toBeNull();
    });
  });

  describe("canPerformActionInTenant()", () => {
    const user = (
      roleAssignments: Array<{ tenantId: string; role: string }>,
    ): DecodedPayload => ({
      id: "user-1",
      email: "test@example.com",
      role: Role.USER,
      tenantIds: roleAssignments.map((a) => a.tenantId),
      roleAssignments,
    });

    it("allows approve when the user is supervisor IN that tenant", () => {
      const u = user([{ tenantId: "tenant-a", role: SystemRole.SUPERVISOR }]);
      expect(canPerformActionInTenant(u, "tenant-a", "approve")).toBe(true);
    });

    it("denies approve when the user only has approve rights in ANOTHER tenant", () => {
      const u = user([
        { tenantId: "tenant-a", role: SystemRole.SUPERVISOR },
        { tenantId: "tenant-b", role: SystemRole.VIEWER },
      ]);
      // This is the #1135 vulnerability: global max would say yes, per-tenant says no.
      expect(canPerformActionInTenant(u, "tenant-b", "approve")).toBe(false);
    });

    it("denies approve when the user is not a member of the tenant at all", () => {
      const u = user([{ tenantId: "tenant-a", role: SystemRole.SUPERVISOR }]);
      expect(canPerformActionInTenant(u, "tenant-b", "approve")).toBe(false);
    });
  });
});
