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

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { resolveEffectiveScope, computeScopeHash } from "@idpass/data-collect-core";
import type { EffectiveScope, SyncScopeOverride } from "@idpass/data-collect-core";
import type { AppInstanceStore, RoleAssignment } from "../types";
import { AuthenticatedRequest } from "./authentication";

export interface RequestScope {
  effective: EffectiveScope;
  hash: string;
  tenantId: string;
}

export type ScopeAwareRequest = AuthenticatedRequest & { scope?: RequestScope };

/**
 * Resolve an `EffectiveScope` for the authenticated user against the
 * requested `configId`, attach it to `req.scope`, and forward.
 *
 * Pre-conditions:
 * - JWT auth middleware has populated `req.user` (with `roleAssignments`)
 * - `validateTenantAccess` has confirmed the user can read the tenant
 *
 * Post-conditions:
 * - `req.scope.effective` is the merged tenant + assignment policy
 * - `req.scope.hash` is the canonical SHA-256 of the effective scope
 *
 * Errors:
 * - 400 when `configId` query param is missing or non-string
 * - 404 when the tenant config can't be loaded
 */
export function createScopeContextMiddleware(appInstanceStore: AppInstanceStore): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const configId = req.query.configId;
      if (!configId || typeof configId !== "string") {
        return res.status(400).json({ status: "error", message: "configId is required" });
      }
      const appInstance = await appInstanceStore.getAppInstance(configId);
      if (!appInstance) {
        return res.status(404).json({ status: "error", message: "App instance not found" });
      }

      const user = (req as AuthenticatedRequest).user;
      const assignment = (user?.roleAssignments ?? []).find((a) => a.tenantId === configId);
      const override = pickOverride(assignment);

      const effective = resolveEffectiveScope(appInstance.config.syncScope, override);
      const hash = computeScopeHash(effective);

      (req as ScopeAwareRequest).scope = { effective, hash, tenantId: configId };
      next();
    } catch (err) {
      next(err);
    }
  };
}

function pickOverride(assignment: RoleAssignment | undefined): SyncScopeOverride | undefined {
  if (!assignment) return undefined;
  if (assignment.syncScopeOverride) return assignment.syncScopeOverride;
  if (assignment.areaId) return { areaIds: [assignment.areaId] };
  return undefined;
}
