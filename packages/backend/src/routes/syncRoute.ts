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
import {
  ExternalSyncCredentials,
  SyncProgress,
  validateEventScope,
  type EntityScopeRef,
  type FormSubmission,
} from "@idpass/data-collect-core";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { AuthenticatedRequest, authenticateJWT, createDynamicAuthMiddleware, validateTenantAccess } from "../middlewares/authentication";
import { asyncHandler } from "../middlewares/errorHandlers";
import { createScopeContextMiddleware, type ScopeAwareRequest } from "../middlewares/scopeContext";
import { AppInstanceStore, Role } from "../types";
import { createLogger } from "../utils/logger";
import { processTransactionalBatch } from "../utils/transactionalEdm";
import { SyncEventStore } from "../stores/SyncEventStore";
import { SyncJobRegistry } from "../stores/SyncJobRegistry";
import { SyncTelemetryStore } from "../stores/SyncTelemetryStore";

const log = createLogger("syncRoute");

/**
 * Cap on the number of area ids accepted from the `?areaIds=` query hint on
 * `/pull`. Each area id triggers a separate `searchEntities` call, so an
 * unbounded list lets a client amplify a single HTTP request into N parallel
 * Postgres queries (DoS). 64 is well above any realistic admin scope.
 */
const QUERY_AREA_ID_LIMIT = 64;

/**
 * Validate the client-supplied X-Device-Id header. Returns the value if it
 * looks like a UUID-shaped identifier, null otherwise. Telemetry must not be
 * recorded for malformed values — clients can otherwise inflate the audit
 * tables with unbounded unique device ids.
 */
function readDeviceIdHeader(req: { header(name: string): string | undefined }): string | null {
  const raw = req.header("X-Device-Id");
  if (!raw || raw.length > 64) return null;
  return /^[A-Za-z0-9_-]+$/.test(raw) ? raw : null;
}

/**
 * Phase 3 (#947): on scoped tenants, the X-Device-Id header is mandatory so
 * pre-upgrade clients fail loud rather than silently bypassing scope-aware
 * telemetry. A tenant is "scoped" when its effective scope constrains areaIds
 * or entityTypes; time-window-only is treated as unscoped (enforcement
 * deferred). Returns `{ ok: true }` if the request may proceed, otherwise a
 * ready-to-send 400 response body.
 */
function requireDeviceIdIfScoped(
  req: ScopeAwareRequest,
):
  | { ok: true }
  | { ok: false; status: 400; body: { status: "error"; code: "DEVICE_ID_REQUIRED"; message: string } } {
  const eff = req.scope!.effective;
  const isBounded = eff.areaIds !== null || eff.entityTypes !== null;
  if (!isBounded) return { ok: true };
  if (readDeviceIdHeader(req) !== null) return { ok: true };
  return {
    ok: false,
    status: 400,
    body: {
      status: "error",
      code: "DEVICE_ID_REQUIRED",
      message: "X-Device-Id header is required for scoped tenants. Upgrade your client.",
    },
  };
}

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
  }).optional(),
});

export function createSyncRouter(
  appInstanceStore: AppInstanceStore,
  postgresUrl?: string,
  telemetryStore?: SyncTelemetryStore,
): Router {
  const router = Router();

  // Create a shared pool for transactional batch processing, reused across requests
  const txPool = postgresUrl ? new Pool({ connectionString: postgresUrl }) : null;
  const syncEventStore = postgresUrl ? new SyncEventStore(new Pool({ connectionString: postgresUrl })) : null;
  const syncJobRegistry = new SyncJobRegistry();

  async function executeSyncJob(
    jobId: string,
    _resolvedConfigId: string,
    appInstance: Awaited<ReturnType<typeof appInstanceStore.getAppInstance>>,
  ): Promise<void> {
    if (!appInstance || !syncEventStore) return;

    const job = syncJobRegistry.getByJobId(jobId);
    const credentials = job?.credentials;

    try {
      await syncEventStore.markJobStarted(jobId);

      let lastProgressWrite = 0;
      let lastPhase = '';
      const onProgress = async (progress: SyncProgress) => {
        const now = Date.now();
        const phaseChanged = progress.phase !== lastPhase;
        if (!phaseChanged && now - lastProgressWrite < 1000) return;
        lastProgressWrite = now;
        lastPhase = progress.phase;
        await syncEventStore.updateJobProgress(jobId, {
          phase: progress.phase,
          pushed: progress.pushed,
          pulled: progress.pulled,
          failed: progress.failed,
          skipped: progress.skipped,
        });
      };

      const result = await appInstance.edm.syncWithExternalSystem(
        credentials as ExternalSyncCredentials | undefined,
        { onProgress, signal: job?.abortController.signal },
      );

      if (result) {
        const status = result.success
          ? "success"
          : (result.pushed > 0 || result.pulled > 0)
            ? "partial"
            : "failed";
        await syncEventStore.completeJob(jobId, {
          status,
          phase: "completed",
          pushed: result.pushed,
          pulled: result.pulled,
          failed: result.failed,
          skipped: result.skipped,
          durationMs: result.duration,
          errors: result.errors.length > 0
            ? result.errors.map((e) => ({ entityGuid: e.entityGuid, code: e.code, message: e.message }))
            : null,
        });
      }
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      const message = error instanceof Error ? error.message : String(error);

      if (syncEventStore) {
        // Read last known progress from DB (written by onProgress callbacks)
        const lastProgress = await syncEventStore.getByJobId(jobId);
        const hasProgress = (lastProgress?.pushed ?? 0) > 0 || (lastProgress?.pulled ?? 0) > 0;

        await syncEventStore.completeJob(jobId, {
          status: isAbort ? "failed" : hasProgress ? "partial" : "failed",
          phase: isAbort ? "cancelled" : "failed",
          pushed: lastProgress?.pushed ?? 0,
          pulled: lastProgress?.pulled ?? 0,
          failed: lastProgress?.failed ?? 0,
          skipped: lastProgress?.skipped ?? 0,
          durationMs: lastProgress?.startedAt
            ? Date.now() - new Date(lastProgress.startedAt).getTime()
            : 0,
          errors: isAbort ? null : [{ code: "SYNC_ERROR", message }],
          errorMessage: message,
        });
      }

      if (!isAbort) {
        log.error({ err: error }, "Failed to sync with external system");
      }
    } finally {
      syncJobRegistry.remove(jobId);
    }
  }

  // Apply increased body parser limit only to sync routes that handle biometric data
  // This prevents DoS attacks on other endpoints while allowing large biometric payloads
  router.use(bodyParser.json({ limit: "50mb" }));

  router.get(
    "/pull",
    createDynamicAuthMiddleware(appInstanceStore),
    validateTenantAccess,
    createScopeContextMiddleware(appInstanceStore),
    asyncHandler(async (req, res) => {
      // get param timestamp
      const { since, configId = "default", areaIds } = req.query;
      const sinceValue = (since as string) || new Date(0).toISOString();

      // check if duplicates exist
      const appInstance = await appInstanceStore.getAppInstance(configId as string);
      if (!appInstance) {
        return res.status(404).json({ status: "error", message: "App instance not found" });
      }
      const deviceCheck = requireDeviceIdIfScoped(req as ScopeAwareRequest);
      if (!deviceCheck.ok) {
        return res.status(deviceCheck.status).json(deviceCheck.body);
      }
      const edm = appInstance.edm;

      // Duplicates are advisory — they must not block sync. Include a warning
      // so the admin UI can surface it, but always deliver events.
      const duplicates = await edm.getPotentialDuplicates();
      const warnings: string[] = [];
      if (duplicates.length > 0) {
        warnings.push("Unresolved potential duplicates exist. Please review them on the admin page.");
      }

      const scope = (req as ScopeAwareRequest).scope!.effective;
      const queryAreaIdHintRaw = typeof areaIds === "string" && areaIds.length > 0
        ? areaIds.split(",").map((a) => a.trim()).filter(Boolean)
        : null;
      // Dedup + cap to prevent DoS amplification via unbounded ?areaIds=A1,A1,A1,…
      // — each id fans out to a searchEntities call below.
      const queryAreaIdHint = queryAreaIdHintRaw
        ? Array.from(new Set(queryAreaIdHintRaw)).slice(0, QUERY_AREA_ID_LIMIT)
        : null;

      // Effective area filter = scope.areaIds (server-authoritative) ∩ queryAreaIdHint
      let effectiveAreaIds: string[] | null = scope.areaIds;
      if (queryAreaIdHint) {
        if (effectiveAreaIds === null) {
          effectiveAreaIds = queryAreaIdHint;
        } else {
          const tenantSet = new Set(effectiveAreaIds);
          effectiveAreaIds = queryAreaIdHint.filter((a) => tenantSet.has(a));
        }
      }
      // shouldFilter distinguishes "tenant has a scope policy" from
      // "intersection happens to be non-empty". An empty intersection
      // (effectiveAreaIds.length === 0) means the client requested areas
      // disjoint from its server-side scope — deliver nothing, never widen.
      const shouldFilter = effectiveAreaIds !== null;
      // Time-window enforcement is intentionally NOT wired in Phase 2 (no PM use
      // case yet). The dimension is advertised in scope.timeWindow but does not
      // filter events. Wire alongside the area filter when a customer asks.

      // Use larger pages when area filtering to reduce empty-page round-trips
      const pageSize = shouldFilter ? 100 : 10;
      const result = await edm.getEventsSincePagination(sinceValue, pageSize);

      // Apply server-side area filtering when an effective area list is set.
      // This enables selective sync: clients only receive events for entities
      // in their assigned geographic areas.
      if (shouldFilter) {
        if (effectiveAreaIds!.length === 0) {
          // Disjoint between server scope and query hint — deliver nothing.
          // Advancing the cursor would never expose anything (the filter list
          // is empty for the rest of this request), so set nextCursor to null.
          result.events = [];
          result.nextCursor = null;
        } else {
          const allowedEntityGuids = new Set<string>();

          const searchResults = await Promise.all(
            effectiveAreaIds!.map((areaId) =>
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

          // Recompute nextCursor from the last *delivered* event so the client
          // doesn't skip events it never received. If all events were filtered
          // out but the raw page was full, keep the original nextCursor so the
          // client advances through pages that don't match until it reaches the
          // end.
          if (result.events.length > 0) {
            const lastDelivered = result.events[result.events.length - 1];
            result.nextCursor = `${lastDelivered.timestamp}|${lastDelivered.guid}`;
          }
        }
      }

      const deviceId = readDeviceIdHeader(req);
      if (telemetryStore && deviceId) {
        const userId = String((req as AuthenticatedRequest).user?.id ?? "");
        void telemetryStore
          .recordPull({
            tenantId: configId as string,
            userId,
            deviceId,
            eventCount: result.events.length,
            scopeHash: (req as ScopeAwareRequest).scope?.hash ?? null,
          })
          .catch((err) => {
            log.warn({ err, deviceId, tenantId: configId }, "Failed to record pull telemetry; ignoring");
          });
      }

      const scopeBody = {
        areaIds: scope.areaIds,
        entityTypes: scope.entityTypes,
        timeWindow: scope.timeWindow,
        hash: (req as ScopeAwareRequest).scope!.hash,
      };
      res.setHeader("X-Sync-Scope-Hash", scopeBody.hash);
      const responseBody: Record<string, unknown> = warnings.length > 0
        ? { ...result, warnings, scope: scopeBody }
        : { ...result, scope: scopeBody };
      res.json(responseBody);
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
        return res.status(404).json({ status: "error", message: "App instance not found" });
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
    createScopeContextMiddleware(appInstanceStore, { source: "body" }),
    asyncHandler(async (req, res) => {
      const parseResult = SyncPushPayloadSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ status: "error", message: "Invalid payload", errors: parseResult.error.issues });
      }
      const { events, configId } = parseResult.data;

      const tenantId = configId || "default";
      const appInstance = await appInstanceStore.getAppInstance(tenantId);
      if (!appInstance) {
        return res.status(404).json({ status: "error", message: "App instance not found" });
      }
      const deviceCheck = requireDeviceIdIfScoped(req as ScopeAwareRequest);
      if (!deviceCheck.ok) {
        return res.status(deviceCheck.status).json(deviceCheck.body);
      }

      // Sort the FULL parsed list by timestamp so applied events preserve
      // submission order. Validation/partition below preserves this order.
      const sorted = events
        .slice()
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const allEvents: FormSubmission[] = sorted.map((event) => ({ ...event, syncLevel: 1 }));

      // ---------------------------------------------------------------
      // Per-event scope validation (Phase 3 — WP #947)
      // ---------------------------------------------------------------
      const scope = (req as ScopeAwareRequest).scope!.effective;
      const isBounded = scope.areaIds !== null || scope.entityTypes !== null;

      type ScopeRejection = {
        guid: string;
        entityGuid: string;
        type: string;
        reason: "out_of_scope" | "unknown_entity";
      };

      let acceptedEvents: FormSubmission[] = allEvents;
      const rejected: ScopeRejection[] = [];

      if (isBounded) {
        // Build a lookup map for events that need entity resolution: anything
        // that is NOT a create-individual / create-group event. The validator
        // resolves create-* events purely from the payload.
        const isCreateIndividualOrGroup = (t: string) =>
          (t.startsWith("create-") && (t.endsWith("-individual") || t.endsWith("-group")));
        const guidsToLookup = Array.from(
          new Set(allEvents.filter((e) => !isCreateIndividualOrGroup(e.type)).map((e) => e.entityGuid)),
        );

        const lookupResults = await Promise.all(
          guidsToLookup.map(async (guid): Promise<[string, EntityScopeRef | undefined]> => {
            try {
              const pair = await appInstance.edm.getEntity(guid);
              const areaIdRaw = (pair.modified.data as Record<string, unknown> | undefined)?.area_id;
              const areaId = typeof areaIdRaw === "string" ? areaIdRaw : null;
              return [guid, { type: pair.modified.type, areaId } as EntityScopeRef];
            } catch {
              // getEntity throws ENTITY_NOT_FOUND for unknown ids — surface as
              // "no ref" so the validator returns unknown_entity.
              return [guid, undefined];
            }
          }),
        );
        const lookupMap = new Map<string, EntityScopeRef | undefined>(lookupResults);
        const lookup = (guid: string): EntityScopeRef | undefined => lookupMap.get(guid);

        const accepted: FormSubmission[] = [];
        for (const evt of allEvents) {
          const result = validateEventScope(evt, scope, lookup);
          if (result.ok) {
            accepted.push(evt);
          } else {
            rejected.push({ guid: evt.guid, entityGuid: evt.entityGuid, type: evt.type, reason: result.reason });
          }
        }
        acceptedEvents = accepted;
      }

      const recordPushTelemetry = (eventCount: number) => {
        const deviceId = readDeviceIdHeader(req);
        if (telemetryStore && deviceId) {
          const userId = String((req as AuthenticatedRequest).user?.id ?? "");
          void telemetryStore
            .recordPush({
              tenantId,
              userId,
              deviceId,
              eventCount,
              scopeHash: (req as ScopeAwareRequest).scope?.hash ?? null,
            })
            .catch((err) => {
              log.warn({ err, deviceId, tenantId }, "Failed to record push telemetry; ignoring");
            });
        }
      };

      // All-rejected: never call submit. Emit 422 with rejected list.
      if (acceptedEvents.length === 0 && rejected.length > 0) {
        return res.status(422).json({
          status: "error",
          message: "All events rejected by scope policy",
          applied: 0,
          failed: rejected,
          errors: [],
        });
      }

      // Helper to combine submit-failed entries with scope-rejected entries.
      // Submit-failed entries keep their existing shape (the FormSubmission for
      // the fallback path; the {index, eventGuid, error} shape for the
      // transactional path) and additionally carry a `reason: "submit_failed"`
      // tag where it's straightforward to add — this is additive and does not
      // remove or rename any pre-existing field.

      if (txPool) {
        // Transactional path: all accepted events succeed or none are applied
        const result = await processTransactionalBatch(txPool, tenantId, acceptedEvents);
        if (!result.success) {
          const failedWithReason = result.failed.map((f) => ({ ...f, reason: "submit_failed" as const }));
          return res.status(422).json({
            status: "error",
            message: "Batch push failed; no events were applied",
            applied: result.applied,
            failed: [...failedWithReason, ...rejected],
          });
        }
        recordPushTelemetry(result.applied);
        const status = rejected.length > 0 ? 207 : 200;
        return res.status(status).json({
          status: rejected.length > 0 ? "partial" : "success",
          applied: result.applied,
          failed: [...result.failed, ...rejected],
          errors: [],
        });
      }

      // Fallback for environments without a direct postgres URL (e.g., tests
      // that don't pass the URL through). Uses the non-transactional path.
      try {
        const result = await appInstance.edm.submitFormBatch(acceptedEvents);
        recordPushTelemetry(result.applied);
        const failedWithReason = result.failed.map((f) => ({ ...f, reason: "submit_failed" as const }));
        const status = rejected.length > 0 ? 207 : 200;
        res.status(status).json({
          status: rejected.length > 0 ? "partial" : "success",
          applied: result.applied,
          failed: [...failedWithReason, ...rejected],
          errors: result.errors,
        });
      } catch (error) {
        log.error({ err: error }, "Batch push failed");
        const message = error instanceof Error ? error.message : String(error);
        res.status(422).json({
          status: "error",
          message: "Batch push failed; no events were applied",
          failed: rejected,
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
        return res.status(404).json({ status: "error", message: "App instance not found" });
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
        return res.status(404).json({ status: "error", message: "App instance not found" });
      }
      const edm = appInstance.edm;
      const auditLogs = await edm.getAuditLogsSince(since as string);
      res.json(auditLogs);
    }),
  );

  router.get(
    "/status",
    authenticateJWT,
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      const configId = req.query.configId as string;
      if (!configId) {
        return res.status(400).json({ status: "error", message: "configId query parameter is required" });
      }

      let isSyncing = false;
      const appInstance = await appInstanceStore.getAppInstance(configId);
      if (appInstance) {
        isSyncing = appInstance.edm.isExternalSyncing();
      }

      const lastEvent = syncEventStore ? await syncEventStore.getLastByConfigId(configId) : null;

      // Check for active job
      let activeJob = syncEventStore ? await syncEventStore.getActiveJobByConfigId(configId) : null;

      // Orphan detection: DB says in-progress but no in-memory job exists (server restart)
      if (activeJob && activeJob.jobId && !syncJobRegistry.getByJobId(activeJob.jobId)) {
        await syncEventStore!.completeJob(activeJob.jobId, {
          status: "failed",
          phase: "failed",
          pushed: activeJob.pushed,
          pulled: activeJob.pulled,
          failed: activeJob.failed,
          skipped: activeJob.skipped,
          durationMs: 0,
          errors: [{ code: "SERVER_RESTART", message: "Server restarted during sync" }],
          errorMessage: "Server restarted during sync",
        });
        activeJob = null;
        isSyncing = false;
      }

      res.json({ isSyncing, lastEvent, activeJob });
    }),
  );

  router.get(
    "/events",
    authenticateJWT,
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      const configId = req.query.configId as string;
      if (!configId) {
        return res.status(400).json({ status: "error", message: "configId query parameter is required" });
      }

      const events = syncEventStore ? await syncEventStore.getByConfigId(configId, 20) : [];

      res.json({ events });
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
      const resolvedConfigId = (configId || "default") as string;

      // Check if a sync is already in progress for this config
      if (syncJobRegistry.getByConfigId(resolvedConfigId)) {
        return res.status(409).json({ status: "error", message: "A sync is already in progress for this configuration." });
      }

      const appInstance = await appInstanceStore.getAppInstance(resolvedConfigId);
      if (!appInstance) {
        return res.status(404).json({ status: "error", message: "App instance not found" });
      }

      if (!syncEventStore) {
        return res.status(503).json({ status: "error", message: "Sync event store not available" });
      }

      const jobId = uuidv4();
      const triggeredBy = (req as AuthenticatedRequest).user?.email || "unknown";

      // Insert pending job record
      await syncEventStore.insertJob({
        configId: resolvedConfigId,
        status: "pending" as "success" | "partial" | "failed",
        pushed: 0,
        pulled: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        errors: null,
        triggeredBy,
        jobId,
      });

      // Register job in memory (holds AbortController and credentials)
      syncJobRegistry.register(jobId, resolvedConfigId, credentials as ExternalSyncCredentials | undefined);

      // Fire and forget — do NOT await
      executeSyncJob(jobId, resolvedConfigId, appInstance);

      res.status(202).json({ jobId, status: "pending" });
    }),
  );

  router.get(
    "/external/:jobId",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { jobId } = req.params;
      if (!syncEventStore) {
        return res.status(503).json({ status: "error", message: "Sync event store not available" });
      }

      const job = await syncEventStore.getByJobId(jobId);
      if (!job) {
        return res.status(404).json({ status: "error", message: "Sync job not found" });
      }

      const user = (req as AuthenticatedRequest).user;
      if (user.role !== Role.ADMIN && !(user.tenantIds ?? []).includes(job.configId)) {
        return res.status(403).json({ error: "Forbidden: No access to this tenant" });
      }

      res.json(job);
    }),
  );

  router.post(
    "/external/:jobId/cancel",
    authenticateJWT,
    asyncHandler(async (req, res) => {
      const { jobId } = req.params;

      // Verify tenant access via the job's configId
      if (syncEventStore) {
        const job = await syncEventStore.getByJobId(jobId);
        if (job) {
          const user = (req as AuthenticatedRequest).user;
          if (user.role !== Role.ADMIN && !(user.tenantIds ?? []).includes(job.configId)) {
            return res.status(403).json({ error: "Forbidden: No access to this tenant" });
          }
        }
      }

      const cancelled = syncJobRegistry.cancel(jobId);
      if (!cancelled) {
        return res.status(404).json({ status: "error", message: "No active sync job found with that ID" });
      }

      res.json({ status: "cancelling" });
    }),
  );

  router.post(
    "/external/:jobId/retry",
    authenticateJWT,
    validateTenantAccess,
    asyncHandler(async (req, res) => {
      if (!syncEventStore) {
        return res.status(503).json({ status: "error", message: "Sync event store not available" });
      }

      const { jobId } = req.params;
      const originalJob = await syncEventStore.getByJobId(jobId);
      if (!originalJob) {
        return res.status(404).json({ status: "error", message: "Original sync job not found" });
      }

      const resolvedConfigId = originalJob.configId;

      if (syncJobRegistry.getByConfigId(resolvedConfigId)) {
        return res.status(409).json({ status: "error", message: "A sync is already in progress for this configuration." });
      }

      const appInstance = await appInstanceStore.getAppInstance(resolvedConfigId);
      if (!appInstance) {
        return res.status(404).json({ status: "error", message: "App instance not found" });
      }

      const newJobId = uuidv4();
      const triggeredBy = (req as AuthenticatedRequest).user?.email || "unknown";

      await syncEventStore.insertJob({
        configId: resolvedConfigId,
        status: "pending" as "success" | "partial" | "failed",
        pushed: 0,
        pulled: 0,
        failed: 0,
        skipped: 0,
        durationMs: 0,
        errors: null,
        triggeredBy,
        jobId: newJobId,
      });

      syncJobRegistry.register(newJobId, resolvedConfigId);

      executeSyncJob(newJobId, resolvedConfigId, appInstance);

      res.status(202).json({ jobId: newJobId, status: "pending" });
    }),
  );

  return router;
}
