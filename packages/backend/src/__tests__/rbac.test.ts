import { Request, Response, NextFunction } from "express";
import { SystemRole } from "@idpass/data-collect-core";
import { requireRole, requireAction } from "../middlewares/rbac";
import { AuthenticatedRequest } from "../middlewares/authentication";
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
});
