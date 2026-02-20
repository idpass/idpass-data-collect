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

import { Router } from "express";
import bodyParser from "body-parser";
import { Pool } from "pg";
import { ExternalSyncCredentials } from "@idpass/data-collect-core";
import { z } from "zod";
import { AuthenticatedRequest, authenticateJWT, createDynamicAuthMiddleware, validateTenantAccess } from "../middlewares/authentication";
import { requireAction } from "../middlewares/rbac";
import { asyncHandler } from "../middlewares/errorHandlers";
import { AppInstanceStore } from "../types";
import { createLogger } from "../utils/logger";
import { processTransactionalBatch } from "../utils/transactionalEdm";

const log = createLogger("syncRoute");

const SyncPushPayloadSchema = z.object({
  events: z.array(z.object({
    guid: z.string().uuid(),
    // entityGuid accepts any non-empty string because loadEntityData creates
    // entities with human-readable IDs (e.g. "hh-001") rather than UUIDs.
    entityGuid: z.string().min(1),
    type: z.string(),
    data: z.record(z.string(), z.unknown()),
    timestamp: z.string().datetime(),
    userId: z.string(),
    syncLevel: z.number(),
    schemaVersion: z.number().optional(),
  })),
  configId: z.string().optional(),
});

const AuditLogPushSchema = z.object({
  auditLogs: z.array(z.object({
    guid: z.string(),
    timestamp: z.string(),
    userId: z.string().optional(),
    action: z.string(),
    eventGuid: z.string(),
    entityGuid: z.string(),
    changes: z.record(z.string(), z.unknown()),
    signature: z.string(),
  })),
  configId: z.string().optional(),
});

const ExternalSyncCredentialsSchema = z.object({
  configId: z.string().optional(),
  credentials: z.object({
    username: z.string().min(1, "Username is required"),
    password: z.string().min(1, "Password is required"),
  }),
});

export function createSyncRouter(appInstanceStore: AppInstanceStore, postgresUrl?: string): Router {
  const router = Router();

  // Create a shared pool for transactional batch processing, reused across requests
  const txPool = postgresUrl ? new Pool({ connectionString: postgresUrl }) : null;
  
  // Apply increased body parser limit only to sync routes that handle biometric data
  // This prevents DoS attacks on other endpoints while allowing large biometric payloads
  router.use(bodyParser.json({ limit: "50mb" }));

  router.get(
    "/pull",
    createDynamicAuthMiddleware(appInstanceStore),
    validateTenantAccess,
    requireAction("read"),
    asyncHandler(async (req, res) => {
      // get param timestamp
      const { since, configId = "default", areaIds } = req.query;

      // check if duplicates exist
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;
      const duplicates = await edm.getPotentialDuplicates();
      if (duplicates.length > 0) {
        return res.json({
          events: [],
          nextCursor: null,
          error: "Duplicates exist! Please resolve them on admin page.",
        });
      }

      const result = await edm.getEventsSincePagination(since as string, 10);

      // Apply server-side area filtering when areaIds are provided.
      // This enables selective sync: clients only receive events for entities
      // in their assigned geographic areas.
      if (areaIds && typeof areaIds === "string" && areaIds.length > 0) {
        const areaIdList = areaIds.split(",").filter(Boolean);
        if (areaIdList.length > 0) {
          // Query entity store per area ID to build the allowed set without
          // loading every entity into memory.
          const allowedEntityGuids = new Set<string>();

          const searchResults = await Promise.all(
            areaIdList.map((areaId) =>
              edm.searchEntities([{ area_id: areaId }]),
            ),
          );

          for (const matches of searchResults) {
            for (const entityPair of matches) {
              allowedEntityGuids.add(entityPair.guid);
            }
          }

          // Filter events to only those targeting allowed entities
          result.events = result.events.filter(
            (event) => allowedEntityGuids.has(event.entityGuid),
          );
        }
      }

      res.json(result);
    }),
  );

  router.get(
    "/pull/callback",
    createDynamicAuthMiddleware(appInstanceStore),
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      const { configId = "default" } = req.query;
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      // TODO: support async pull
      // this will be used as a callback endpoint for external systems to push data back to our system
      res.json({ status: "not implemented" });
    }),
  );

  router.post(
    "/push",
    createDynamicAuthMiddleware(appInstanceStore),
    validateTenantAccess,
    requireAction("create"),
    asyncHandler(async (req, res) => {
      const parseResult = SyncPushPayloadSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ status: "error", message: "Invalid payload", errors: parseResult.error.issues });
      }
      const { events, configId } = parseResult.data;

      const tenantId = configId || "default";
      const appInstance = await appInstanceStore.getAppInstance(tenantId);
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }

      const sorted = events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const batchEvents = sorted.map((event) => ({ ...event, syncLevel: 1 }));

      if (txPool) {
        // Transactional path: all events succeed or none are applied
        const result = await processTransactionalBatch(txPool, tenantId, batchEvents);
        if (!result.success) {
          return res.status(422).json({
            status: "error",
            message: "Batch push failed; no events were applied",
            applied: result.applied,
            failed: result.failed,
          });
        }
        return res.json({ status: "success", applied: result.applied, failed: result.failed, errors: [] });
      }

      // Fallback for environments without a direct postgres URL (e.g., tests
      // that don't pass the URL through). Uses the non-transactional path.
      try {
        const result = await appInstance.edm.submitFormBatch(batchEvents);
        res.json({ status: "success", applied: result.applied, failed: result.failed, errors: result.errors });
      } catch (error) {
        log.error({ err: error }, "Batch push failed");
        const message = error instanceof Error ? error.message : String(error);
        res.status(422).json({
          status: "error",
          message: "Batch push failed; no events were applied",
          errors: [message],
        });
      }
    }),
  );

  router.post(
    "/push/audit-logs",
    authenticateJWT,
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      const parseResult = AuditLogPushSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ status: "error", message: "Invalid audit log payload", errors: parseResult.error.issues });
      }
      const { auditLogs, configId } = parseResult.data;

      const appInstance = await appInstanceStore.getAppInstance(configId || "default");
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;

      try {
        await edm.saveAuditLogs(auditLogs.map((entry) => ({ ...entry, userId: (req as AuthenticatedRequest).user?.id })));
      } catch (error) {
        log.error({ err: error }, "Failed to save audit logs");
        const message = error instanceof Error ? error.message : String(error);
        return res.status(500).json({ status: "error", message: "Failed to save audit logs", details: message });
      }

      res.json({ status: "success" });
    }),
  );

  router.get(
    "/pull/audit-logs",
    authenticateJWT,
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      // get param timestamp
      const { since, configId = "default" } = req.query;

      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;
      const auditLogs = await edm.getAuditLogsSince(since as string);
      res.json(auditLogs);
    }),
  );

  router.post(
    "/external",
    authenticateJWT,
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      const parseResult = ExternalSyncCredentialsSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ status: "error", message: "Invalid external sync payload", errors: parseResult.error.issues });
      }
      const { configId, credentials } = parseResult.data;
      const appInstance = await appInstanceStore.getAppInstance((configId || "default") as string);
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;
      try {
        await edm.syncWithExternalSystem(credentials as ExternalSyncCredentials);
        res.json({ status: "success" });
      } catch (error) {
        log.error({ err: error }, "Failed to sync with external system");
        const message = error instanceof Error ? error.message : String(error);
        res.json({
          status: "error",
          message: "Failed to sync with external system",
          details: message,
        });
      }
    }),
  );
  return router;
}
