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
import { AuditLogEntry, ExternalSyncCredentials } from "@idpass/data-collect-core";
import { z } from "zod";
import { AuthenticatedRequest, authenticateJWT, createDynamicAuthMiddleware, validateTenantAccess } from "../middlewares/authentication";
import { asyncHandler } from "../middlewares/errorHandlers";
import { AppInstanceStore } from "../types";

const SyncPushPayloadSchema = z.object({
  events: z.array(z.object({
    guid: z.string(),
    entityGuid: z.string(),
    type: z.string(),
    data: z.record(z.string(), z.unknown()),
    timestamp: z.string(),
    userId: z.string(),
    syncLevel: z.number(),
  })),
  configId: z.string().optional(),
});

export function createSyncRouter(appInstanceStore: AppInstanceStore): Router {
  const router = Router();
  
  // Apply increased body parser limit only to sync routes that handle biometric data
  // This prevents DoS attacks on other endpoints while allowing large biometric payloads
  router.use(bodyParser.json({ limit: "50mb" }));

  router.get(
    "/pull",
    createDynamicAuthMiddleware(appInstanceStore),
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      // get param timestamp
      const { since, configId = "default" } = req.query;

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
    asyncHandler(async (req, res) => {
      const parseResult = SyncPushPayloadSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ status: "error", message: "Invalid payload", errors: parseResult.error.issues });
      }
      const { events, configId } = parseResult.data;

      const sorted = events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const appInstance = await appInstanceStore.getAppInstance(configId || "default");
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;

      const batchEvents = sorted.map((event) => ({ ...event, syncLevel: 1 }));

      try {
        const result = await edm.submitFormBatch(batchEvents);
        res.json({ status: "success", applied: result.applied, failed: result.failed, errors: result.errors });
      } catch (error) {
        console.error(error);
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
      const auditLogs: AuditLogEntry[] = req.body.auditLogs;
      const configId = req.body.configId;

      const appInstance = await appInstanceStore.getAppInstance(configId || "default");
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;

      if (!Array.isArray(auditLogs)) {
        return res.json({ status: "success" });
      }

      try {
        await edm.saveAuditLogs(auditLogs.map((log) => ({ ...log, userId: (req as AuthenticatedRequest).user?.id })));
      } catch (error) {
        console.error(error);
        // ignore errors
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
      const { configId = "default", credentials } = req.body;
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;
      try {
        await edm.syncWithExternalSystem(credentials as unknown as ExternalSyncCredentials);
        res.json({ status: "success" });
      } catch (error) {
        console.error(error);
        res.json({
          status: "error",
          message: "Failed to sync with external system",
          details: error,
        });
      }
    }),
  );
  return router;
}
