/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Request, Response, NextFunction } from "express";
import { RbacService, RbacAction, ROLE_HIERARCHY, SystemRole } from "@idpass/data-collect-core";
import { AuthenticatedRequest } from "./authentication";
import { Role, UserStore } from "../types";
import { createLogger } from "../utils/logger";

const log = createLogger("rbac");
const rbacService = new RbacService();

/**
 * Extracts the effective role from the authenticated user.
 * Admin users (legacy Role.ADMIN) are treated as system-admin.
 * For users with roleAssignments, the highest role is returned.
 */
function getEffectiveRole(req: Request): SystemRole | null {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    return null;
  }

  // Legacy admin users bypass RBAC entirely
  if (user.role === Role.ADMIN) {
    return SystemRole.SYSTEM_ADMIN;
  }

  const roleAssignments = user.roleAssignments ?? [];
  if (roleAssignments.length === 0) {
    return null;
  }

  // Find the highest role across all assignments
  let highestRole: SystemRole | null = null;
  let highestLevel = -1;

  for (const assignment of roleAssignments) {
    const level = ROLE_HIERARCHY[assignment.role] ?? -1;
    if (level > highestLevel) {
      highestLevel = level;
      highestRole = assignment.role as SystemRole;
    }
  }

  return highestRole;
}

/**
 * Middleware that enforces a minimum role requirement.
 *
 * Checks if the authenticated user's highest role meets or exceeds
 * the specified minimum role level.
 *
 * @param minimumRole The minimum SystemRole required to access the route.
 * @returns Express middleware function.
 */
export function requireRole(minimumRole: SystemRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Legacy admin users bypass role checks
    if (user.role === Role.ADMIN) {
      next();
      return;
    }

    const effectiveRole = getEffectiveRole(req);
    if (!effectiveRole) {
      log.warn({ userId: user.id, minimumRole }, "No role assignments found for user");
      res.status(403).json({ error: "Forbidden: Insufficient role", required: minimumRole });
      return;
    }

    if (!rbacService.hasPermission(effectiveRole, minimumRole)) {
      log.warn({ userId: user.id, effectiveRole, minimumRole }, "Insufficient role");
      res.status(403).json({ error: "Forbidden: Insufficient role", required: minimumRole });
      return;
    }

    next();
  };
}

/**
 * Middleware that enforces permission for a specific action.
 *
 * Maps the action to its minimum required role and checks
 * if the authenticated user meets the requirement.
 *
 * @param action The action the user wants to perform.
 * @returns Express middleware function.
 */
export function requireAction(action: RbacAction) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Legacy admin users can perform any action
    if (user.role === Role.ADMIN) {
      next();
      return;
    }

    const effectiveRole = getEffectiveRole(req);
    if (!effectiveRole) {
      log.warn({ userId: user.id, action }, "No role assignments found for user");
      res.status(403).json({ error: "Forbidden: Insufficient permission", action });
      return;
    }

    if (!rbacService.canPerformAction(effectiveRole, action)) {
      log.warn({ userId: user.id, effectiveRole, action }, "Insufficient permission for action");
      res.status(403).json({ error: "Forbidden: Insufficient permission", action });
      return;
    }

    next();
  };
}

/**
 * Middleware factory that re-verifies the user's role from the database
 * rather than trusting the JWT claim alone. Use on sensitive endpoints
 * where a stale JWT could grant elevated privileges (e.g., after a user
 * has been demoted but their token has not yet expired).
 */
export function verifyRoleFromDatabase(userStore: UserStore) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const dbUser = await userStore.getUser(user.email);
      if (!dbUser) {
        res.status(401).json({ error: "User no longer exists" });
        return;
      }

      // Update the request with the authoritative database role
      (req as AuthenticatedRequest).user = {
        ...user,
        role: dbUser.role,
        tenantIds: dbUser.tenantIds,
        roleAssignments: dbUser.roleAssignments,
      };

      next();
    } catch (error) {
      log.error({ err: error, userId: user.id }, "Failed to verify role from database");
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
