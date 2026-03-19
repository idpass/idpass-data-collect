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

import { SystemRole, UserRoleAssignment, Area } from "../interfaces/types";

/**
 * Role hierarchy mapping where higher numbers indicate more permissions.
 */
export const ROLE_HIERARCHY: Record<string, number> = {
  [SystemRole.SYSTEM_ADMIN]: 100,
  [SystemRole.PROGRAM_ADMIN]: 80,
  [SystemRole.SUPERVISOR]: 60,
  [SystemRole.ENUMERATOR]: 40,
  [SystemRole.VIEWER]: 20,
};

/**
 * Actions that can be performed in the system, each requiring a minimum role.
 */
export type RbacAction =
  | "read"
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "manage-users"
  | "manage-config";

/**
 * Mapping of actions to the minimum role required to perform them.
 */
const ACTION_ROLE_MAP: Record<RbacAction, SystemRole> = {
  read: SystemRole.VIEWER,
  create: SystemRole.ENUMERATOR,
  update: SystemRole.ENUMERATOR,
  delete: SystemRole.SUPERVISOR,
  approve: SystemRole.SUPERVISOR,
  "manage-users": SystemRole.PROGRAM_ADMIN,
  "manage-config": SystemRole.SYSTEM_ADMIN,
};

/**
 * Service for Role-Based Access Control (RBAC) enforcement.
 *
 * Provides methods to check permissions based on the role hierarchy,
 * area assignments, and action mappings. This service is stateless
 * and operates on data provided as arguments, making it suitable
 * for both client-side and server-side usage.
 */
export class RbacService {
  /**
   * Check if a user's role meets the minimum required role level.
   *
   * @param userRole The role assigned to the user.
   * @param requiredRole The minimum role required for the operation.
   * @returns true if the user's role level is >= the required role level.
   */
  hasPermission(userRole: SystemRole, requiredRole: SystemRole): boolean {
    const userLevel = ROLE_HIERARCHY[userRole];
    const requiredLevel = ROLE_HIERARCHY[requiredRole];

    if (userLevel === undefined || requiredLevel === undefined) {
      return false;
    }

    return userLevel >= requiredLevel;
  }

  /**
   * Check if a user can perform a specific action based on their role.
   *
   * @param userRole The role assigned to the user.
   * @param action The action the user wants to perform.
   * @returns true if the user's role permits the action.
   */
  canPerformAction(userRole: SystemRole, action: RbacAction): boolean {
    const requiredRole = ACTION_ROLE_MAP[action];
    if (!requiredRole) {
      return false;
    }
    return this.hasPermission(userRole, requiredRole);
  }

  /**
   * Get the highest role a user holds in a specific tenant.
   *
   * @param userId The user identifier.
   * @param tenantId The tenant (program) identifier.
   * @param assignments All role assignments to search.
   * @returns The highest SystemRole for the user in the tenant, or null if none.
   */
  getUserEffectiveRole(
    userId: string,
    tenantId: string,
    assignments: UserRoleAssignment[],
  ): SystemRole | null {
    const userTenantAssignments = assignments.filter(
      (a) => a.userId === userId && a.programId === tenantId,
    );

    if (userTenantAssignments.length === 0) {
      return null;
    }

    let highestRole: SystemRole | null = null;
    let highestLevel = -1;

    for (const assignment of userTenantAssignments) {
      const level = ROLE_HIERARCHY[assignment.role] ?? -1;
      if (level > highestLevel) {
        highestLevel = level;
        highestRole = assignment.role;
      }
    }

    return highestRole;
  }

  /**
   * Check if a user can access a specific area within a tenant.
   *
   * Access is granted if the user has a global role, or if any of their
   * assigned area codes match the target area or one of its ancestors
   * in the area hierarchy.
   *
   * @param userId The user identifier.
   * @param tenantId The tenant (program) identifier.
   * @param areaCode The area code to check access for.
   * @param assignments All role assignments to search.
   * @param areas The area hierarchy for resolving parent relationships.
   * @returns true if the user can access the area.
   */
  canAccessArea(
    userId: string,
    tenantId: string,
    areaCode: string,
    assignments: UserRoleAssignment[],
    areas: Area[],
  ): boolean {
    const userTenantAssignments = assignments.filter(
      (a) => a.userId === userId && a.programId === tenantId,
    );

    if (userTenantAssignments.length === 0) {
      return false;
    }

    // Global roles have access to all areas
    const hasGlobalAccess = userTenantAssignments.some((a) => a.isGlobal);
    if (hasGlobalAccess) {
      return true;
    }

    // Collect all assigned area codes
    const assignedAreaCodes = new Set<string>();
    for (const assignment of userTenantAssignments) {
      for (const code of assignment.areaCodes) {
        assignedAreaCodes.add(code);
      }
    }

    // Check if the target area code or any of its ancestors is in the assigned set
    const areaMap = new Map(areas.map((a) => [a.code, a]));
    let currentCode: string | null = areaCode;

    while (currentCode !== null) {
      if (assignedAreaCodes.has(currentCode)) {
        return true;
      }
      const area = areaMap.get(currentCode);
      currentCode = area?.parentCode ?? null;
    }

    return false;
  }

  /**
   * Check if a user can access a specific entity based on area assignments.
   *
   * If the entity has no area assignment, access is granted to any user
   * with at least one role in the tenant. If the entity has an area code,
   * the user must have access to that area.
   *
   * @param userId The user identifier.
   * @param tenantId The tenant (program) identifier.
   * @param entityGuid The entity identifier.
   * @param assignments All role assignments to search.
   * @param entityAreaCode The area code assigned to the entity, if any.
   * @param areas The area hierarchy for resolving parent relationships.
   * @returns true if the user can access the entity.
   */
  canAccessEntity(
    userId: string,
    tenantId: string,
    entityGuid: string,
    assignments: UserRoleAssignment[],
    entityAreaCode: string | undefined,
    areas: Area[],
  ): boolean {
    const userTenantAssignments = assignments.filter(
      (a) => a.userId === userId && a.programId === tenantId,
    );

    if (userTenantAssignments.length === 0) {
      return false;
    }

    // Global roles have access to all entities
    const hasGlobalAccess = userTenantAssignments.some((a) => a.isGlobal);
    if (hasGlobalAccess) {
      return true;
    }

    // Entities without area codes are accessible to anyone with tenant access
    if (!entityAreaCode) {
      return true;
    }

    return this.canAccessArea(userId, tenantId, entityAreaCode, assignments, areas);
  }

  /**
   * Get the minimum role required to perform a specific action.
   *
   * @param action The action to look up.
   * @returns The minimum SystemRole required, or null if the action is unknown.
   */
  getMinimumRoleForAction(action: RbacAction): SystemRole | null {
    return ACTION_ROLE_MAP[action] ?? null;
  }
}
