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

import {
  EventStore,
  ExternalSyncAdapter,
  ExternalSyncConfig,
  ExternalSyncCredentials,
  EntityType,
  SyncLevel,
  getAdapterConfigValue,
  FieldMapping,
  createTransformer,
  type TransformerType,
  type SyncError,
  createLogger,
} from "@idpass/data-collect-core";
import { EventApplierService } from "@idpass/data-collect-core";
import {
  OpenSppV2Client,
  PreconditionFailedError,
  ConflictError,
  ChangeRequestRevisionNeededError,
} from "./OpenSppV2Client";
import type {
  ChangeRequestSubmitMode,
  EventTypeKey,
  OpenSppV2AdapterOptions,
} from "./OpenSppV2AdapterOptions";
import { resolveCRTypeCode } from "./OpenSppV2AdapterOptions";
import type {
  IndividualResource,
  GroupResource,
  HumanName,
  CodeableConcept,
  Extension,
} from "./types";
import type {
  ChangeRequestCreate,
  RegistrantRef,
} from "./ChangeRequestTypes";
import { getCR, setCR, listInFlightCRs, type CRRecord } from "./changeRequestStore";
import { v4 as uuidv4 } from "uuid";

const log = createLogger("adapter-openspp:v2");

/** User ID for sync-originated events */
const SYNC_USER_ID = "openspp-v2-sync";

/**
 * A CR record persisted with a numeric program discriminator (see
 * `pushPendingProgramEnrolments`) encodes the enrolment's `programId` in the
 * metadata key suffix as a stringified integer. `listInFlightCRs` returns the
 * suffix as a raw string; this helper coerces back to a finite positive
 * integer, or returns `null` for anything else (entity-level CRs, malformed
 * discriminators).
 */
function parseProgramEnrolmentDiscriminator(discriminator: string): number | null {
  if (!discriminator) return null;
  // Only digits — reject negatives, floats, NaN, embedded text. Program ids
  // in OpenSPP are Odoo record ids (positive integers).
  if (!/^\d+$/.test(discriminator)) return null;
  const parsed = Number.parseInt(discriminator, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Extension key for Studio individual custom fields (OpenSPP V2 API) */
const STUDIO_INDIVIDUAL_EXTENSION_KEY = "urn:openspp:extension:studio-individual";

/**
 * Placeholder identifier system used in `registrant.system` when a CR is
 * created for an entity that does not yet have an OpenSPP-issued external id
 * (i.e. a `create-*` CR). OpenSPP will assign the real identifier when the CR
 * is `$apply`-ed.
 *
 * v1 limitation (#948): some OpenSPP deployments may reject CR payloads whose
 * `registrant` does not refer to an existing record. If your registry rejects
 * this placeholder, override the strategy in a successor adapter — see README.
 */
const CR_GUID_REGISTRANT_SYSTEM = "datacollect:guid";

/**
 * Strip a URI fragment (`#…`) from an identifier system URI. OpenSPP's CR
 * `find_registrant_by_identifier` matches on the BASE vocabulary namespace
 * (`urn:openspp:vocab:id-type`), not the per-code URI
 * (`urn:openspp:vocab:id-type#system_id`) — the latter is rejected. Direct
 * `/Group` / `/Individual` create paths still want the full URI.
 */
const stripFragment = (uri: string): string => {
  const idx = uri.indexOf("#");
  return idx >= 0 ? uri.slice(0, idx) : uri;
};

/**
 * Gender codes per ISO/IEC 5218 (representation of human sexes).
 * Push: text -> code; Pull: code -> text.
 */
const GENDER_TO_CODE: Record<string, { code: string; display: string }> = {
  male: { code: "1", display: "Male" },
  m: { code: "1", display: "Male" },
  female: { code: "2", display: "Female" },
  f: { code: "2", display: "Female" },
  other: { code: "9", display: "Not applicable" },
};

const GENDER_FROM_CODE: Record<string, string> = {
  "1": "male",
  "2": "female",
  "9": "other",
  "0": "unknown",
};

/**
 * OpenSPP V2 Sync Adapter
 *
 * Synchronizes DataCollect entities with OpenSPP using the V2 REST API.
 * Features:
 * - OAuth2 client credentials authentication
 * - External identifiers with configurable namespace
 * - Studio extension support for custom fields
 * - Individual and Group sync
 * - PATCH for partial updates, PUT for full replacement
 * - Batch operations with retry logic
 * - Field mapping with transformers
 */
class OpenSppV2SyncAdapter implements ExternalSyncAdapter {
  private client: OpenSppV2Client | null = null;
  private readonly url: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly identifierNamespace: string;
  private readonly includeStudioExtensions: boolean;
  private readonly batchSize: number;
  private readonly batchDelayMs: number;
  private readonly maxRetries: number;
  private readonly identifierType: string;
  private readonly groupIdentifierType: string;
  /** ChangeRequest push mode. Defaults to `"direct"` for backward compat. */
  private readonly submitVia: ChangeRequestSubmitMode;
  /** Tenant override for CR request-type codes. Empty when unset. */
  private readonly changeRequestTypeMap: Partial<Record<EventTypeKey, string>>;

  constructor(
    private eventStore: EventStore,
    private eventApplierService: EventApplierService,
    private config: ExternalSyncConfig,
  ) {
    this.url = config.url ?? "";
    this.clientId = getAdapterConfigValue<string>(config, "clientId") ?? "";
    this.clientSecret = getAdapterConfigValue<string>(config, "clientSecret") ?? "";
    this.identifierNamespace =
      getAdapterConfigValue<string>(config, "identifierNamespace") ?? "urn:openspp:vocab:id-type#";
    this.includeStudioExtensions =
      getAdapterConfigValue<string>(config, "includeStudioExtensions") !== "false";
    this.batchSize = getAdapterConfigValue<number>(config, "batchSize", 50) ?? 50;
    this.batchDelayMs = getAdapterConfigValue<number>(config, "batchDelayMs", 1000) ?? 1000;
    this.maxRetries = getAdapterConfigValue<number>(config, "maxRetries", 2) ?? 2;
    this.identifierType =
      getAdapterConfigValue<string>(config, "identifierType") ?? "system_id";
    this.groupIdentifierType =
      getAdapterConfigValue<string>(config, "groupIdentifierType") ?? this.identifierType;
    this.submitVia = readSubmitVia(config);
    this.changeRequestTypeMap = readChangeRequestTypeMap(config);
  }

  /**
   * Authenticate with OpenSPP using OAuth2 client credentials.
   */
  async authenticate(_credentials?: ExternalSyncCredentials): Promise<boolean> {
    try {
      await this.ensureClient();
      return true;
    } catch (error) {
      log.error({ err: error }, "Authentication failed");
      return false;
    }
  }

  /**
   * Push locally-modified entities (Individuals and Groups) to OpenSPP.
   * Only pushes entities modified since the last successful push to avoid
   * overwriting changes made directly in OpenSPP.
   */
  async pushData(_credentials?: ExternalSyncCredentials): Promise<{ pushed: number; failed: number; skipped: number; errors: SyncError[] }> {
    await this.ensureClient();

    const entityStore = this.eventApplierService.getEntityStore();
    const lastPush = await this.eventStore.getLastPushExternalSyncTimestamp();
    const allModified = lastPush
      ? await entityStore.getModifiedEntitiesSince(lastPush)
      : await entityStore.getAllEntities();

    // Exclude entities that were only updated by external pull (no local edits).
    // After pull, the baseline is reset (initial.version === modified.version).
    // Without this filter, pulled entities would be pushed back, overwriting
    // any changes made directly in OpenSPP between pull and push.
    const entitiesToSync = allModified.filter((pair) => {
      if (pair.modified.externalId && pair.initial && pair.initial.version === pair.modified.version) {
        return false;
      }
      return true;
    });

    const individualsToSync = entitiesToSync.filter(
      (pair) => pair.modified.type === EntityType.Individual,
    );
    const groupsToSync = entitiesToSync.filter(
      (pair) => pair.modified.type === EntityType.Group,
    );

    let totalPushed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    const allErrors: SyncError[] = [];

    if (individualsToSync.length > 0) {
      const result = await this.pushEntities(individualsToSync, "individual");
      totalPushed += result.pushed;
      totalFailed += result.failed;
      totalSkipped += result.skipped;
      allErrors.push(...result.errors.map((e) => ({
        entityGuid: e.guid,
        code: e.code,
        message: e.error,
        retryable: e.code !== "CR_REVISION_NEEDED",
      })));
    }

    if (groupsToSync.length > 0) {
      const result = await this.pushEntities(groupsToSync, "group");
      totalPushed += result.pushed;
      totalFailed += result.failed;
      totalSkipped += result.skipped;
      allErrors.push(...result.errors.map((e) => ({
        entityGuid: e.guid,
        code: e.code,
        message: e.error,
        retryable: e.code !== "CR_REVISION_NEEDED",
      })));
    }

    // Advance the watermark when only permanently-blocked CR failures remain.
    // Operator must $reset rejected CRs on OpenSPP; A5 polling will rediscover
    // them as `draft` and the next push will re-submit. Holding the watermark
    // for these would inflate the push set across cycles.
    const permanentlyBlocked = allErrors.filter((e) => e.code === "CR_REVISION_NEEDED").length;
    if (totalFailed - permanentlyBlocked === 0) {
      await this.eventStore.setLastPushExternalSyncTimestamp(new Date().toISOString());
    }

    return { pushed: totalPushed, failed: totalFailed, skipped: totalSkipped, errors: allErrors };
  }

  /**
   * Pull entities (Individuals and Groups) from OpenSPP.
   * @param _credentials Unused, kept for interface compatibility.
   * @param since Optional ISO timestamp — only fetch records updated after this time.
   */
  async pullData(_credentials?: ExternalSyncCredentials, since?: string): Promise<{ pulled: number; failed: number; skipped: number; errors: SyncError[] }> {
    await this.ensureClient();

    const indResult = await this.pullIndividuals(since);
    const grpResult = await this.pullGroups(since);
    const errors: SyncError[] = [...indResult.errors, ...grpResult.errors];

    // Poll in-flight CR statuses. Always runs: program enrolments
    // (`enrol-in-program` → `assign_program` CR) flow through CRs even when
    // `submitVia: direct`, so a mode gate would silently drop those polls.
    // `listInFlightCRs` short-circuits empty in O(1) when no CRs exist.
    const pollErrors = await this.pollChangeRequestStatuses();
    errors.push(...pollErrors);

    return {
      pulled: indResult.pulled + grpResult.pulled,
      failed: indResult.failed + grpResult.failed,
      skipped: indResult.skipped + grpResult.skipped,
      errors,
    };
  }

  /**
   * Per-pull cap on in-flight CR status polls.
   *
   * Bounds the per-pull fan-out: a small entity pull must never amplify into a
   * large `/ChangeRequest/{ref}` GET storm. Beyond this cap we defer to the
   * next pull; ordering by oldest `submittedAt` first ensures stuck CRs make
   * progress and rejected/applied transitions surface quickly.
   */
  private static readonly CR_POLL_CAP = 100;

  /**
   * Poll status for in-flight CRs and project transitions into local
   * metadata. Runs after the entity pull so any operator-applied CR's entity
   * changes are already ingested in the same pull cycle.
   *
   * Per-record errors never abort the loop: an individual 404 / network blip
   * must not fail the surrounding pull.
   *
   * Returns the list of `SyncError` entries surfaced during polling so callers
   * (i.e. {@link pullData}) can merge them into the pull's `errors[]` and the
   * admin/orchestration layer regains visibility into rejected CR transitions
   * and per-record poll failures.
   */
  private async pollChangeRequestStatuses(): Promise<SyncError[]> {
    const errors: SyncError[] = [];
    const inFlight = await listInFlightCRs(this.eventStore);
    if (inFlight.length === 0) {
      return errors;
    }

    // Oldest first, nulls last — stuck CRs surface fastest.
    const sorted = [...inFlight].sort((a, b) => {
      const ta = a.record.submittedAt ?? "";
      const tb = b.record.submittedAt ?? "";
      if (ta === tb) return 0;
      if (ta === "") return 1;
      if (tb === "") return -1;
      return ta < tb ? -1 : 1;
    });

    const bounded = sorted.slice(0, OpenSppV2SyncAdapter.CR_POLL_CAP);

    for (const { entityGuid, discriminator, record } of bounded) {
      if (record.status === "applied" || record.status === "rejected") {
        // Defensive: listInFlightCRs filters these out, but if a stale list
        // leaks through, skip the network call.
        continue;
      }
      try {
        const fresh = await this.getClient().getChangeRequest(record.reference);
        if (fresh === null) {
          // 404 — CR vanished from OpenSPP. Log warn, leave metadata as-is
          // so admin can still surface the audit record.
          log.warn(
            { entityGuid, reference: record.reference },
            "Change request not found on OpenSPP; keeping local metadata",
          );
          continue;
        }

        if (fresh.status !== record.status) {
          // For `applied` transitions on program-enrolment CRs, emit the
          // projection event BEFORE persisting the terminal status. If the
          // emit fails we leave the CR record in its pre-transition status so
          // the next pull retries — once the metadata flips to `applied`,
          // listInFlightCRs filters it out and the event would never re-emit.
          let projectionEmitted = false;
          let projectionError: unknown | null = null;
          if (fresh.status === "applied") {
            const programId = parseProgramEnrolmentDiscriminator(discriminator);
            if (programId !== null) {
              try {
                await this.emitProgramEnrolmentApplied(entityGuid, programId, fresh);
                projectionEmitted = true;
              } catch (emitErr) {
                projectionError = emitErr;
                log.warn(
                  { entityGuid, reference: fresh.reference, programId, err: emitErr },
                  "Failed to emit program-enrolment-applied event; keeping CR in-flight for retry",
                );
                errors.push({
                  entityGuid,
                  code: "CR_PROJECTION_FAILED",
                  message: emitErr instanceof Error ? emitErr.message : String(emitErr),
                  retryable: true,
                });
              }
            } else {
              // Non-program-enrolment CR — no projection needed.
              projectionEmitted = true;
            }
          }

          // If this is an `applied` transition for a program-enrolment CR and
          // the projection failed, do NOT persist the terminal status. Bump
          // lastPolledAt only so observability survives.
          if (fresh.status === "applied" && projectionError !== null && !projectionEmitted) {
            await setCR(
              this.eventStore,
              entityGuid,
              {
                ...record,
                lastPolledAt: new Date().toISOString(),
              },
              discriminator,
            );
          } else {
            await setCR(
              this.eventStore,
              entityGuid,
              {
                reference: fresh.reference,
                status: fresh.status,
                submittedAt: record.submittedAt,
                lastPolledAt: new Date().toISOString(),
                rejectionReason: fresh.rejectionReason,
                appliedDate: fresh.appliedDate,
                approvedDate: fresh.approvedDate,
              },
              discriminator,
            );
          }

          if (fresh.status === "rejected") {
            log.warn(
              { entityGuid, reference: fresh.reference, reason: fresh.rejectionReason },
              "Change request rejected by OpenSPP operator",
            );
            errors.push({
              entityGuid,
              code: "CR_REJECTED",
              message: `Change request ${fresh.reference} rejected by OpenSPP operator${fresh.rejectionReason ? `: ${fresh.rejectionReason}` : ""}`,
              retryable: false,
            });
          } else if (fresh.status === "applied" && projectionEmitted) {
            log.info(
              { entityGuid, reference: fresh.reference },
              "Change request applied by OpenSPP — projection emitted",
            );
          }
        } else {
          // Status unchanged — bump only lastPolledAt to avoid unnecessary writes.
          await setCR(
            this.eventStore,
            entityGuid,
            {
              ...record,
              lastPolledAt: new Date().toISOString(),
            },
            discriminator,
          );
        }
      } catch (err) {
        log.warn(
          { entityGuid, reference: record.reference, err },
          "Failed to poll change request status; will retry next pull",
        );
        errors.push({
          entityGuid,
          code: "CR_POLL_FAILED",
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
        });
      }
    }

    return errors;
  }

  /**
   * Emit a `program-enrolment-applied` event locally for one
   * `(entityGuid, programId)` pair. Marked `EXTERNAL` so:
   *   - `EventApplierService.submitForm` treats it as a remote event and
   *     skips duplicate-detection enqueue (per CLAUDE.md "isRemoteEvent" rule)
   *   - the conflict-resolution path uses the remote-timestamp branch
   *   - mobile consumes it via the regular /pull endpoint without special
   *     casing
   *
   * Program name is best-effort: read from the persisted pending entry on
   * the entity (we don't have a guaranteed lookup table here) and falls back
   * to `undefined` so the mobile chip renders `Program #N`.
   *
   * Throws if `submitForm` throws — callers in `pollChangeRequestStatuses`
   * wrap this in try/catch so the surrounding pull is unaffected.
   */
  private async emitProgramEnrolmentApplied(
    entityGuid: string,
    programId: number,
    fresh: { reference: string; appliedDate?: string },
  ): Promise<void> {
    // Best-effort program name from the existing pending entry; missing if
    // the entity payload was scrubbed or the enrolment originated server-side.
    let programName: string | undefined;
    try {
      const pair = await this.eventApplierService.getEntityStore().getEntity(entityGuid);
      const pending = (pair?.modified?.data as Record<string, unknown> | undefined)
        ?.pendingProgramEnrolments;
      if (Array.isArray(pending)) {
        const entry = (pending as Array<{ programId?: unknown; programName?: unknown }>).find(
          (p) => p && typeof p === "object" && p.programId === programId,
        );
        if (entry && typeof entry.programName === "string") {
          programName = entry.programName;
        }
      }
    } catch {
      // Best-effort only; missing name is acceptable.
    }

    const appliedAt = fresh.appliedDate ?? new Date().toISOString();
    // `timestamp` is the event-emission time, NOT `appliedAt`. The conflict
    // resolver (`handleIncomingConflict`) compares this against the local
    // entity's `lastUpdated`: if the field worker's pending-enrolment was
    // stamped after OpenSPP's approval (clock skew, slow approval), an
    // `appliedAt`-based timestamp would lose to the local pending event and
    // the chip would never flip. The emission moment is always later than
    // the most recent local edit on this device, so it always wins.
    // `appliedAt` is preserved on `data.appliedAt` for audit.
    await this.eventApplierService.submitForm({
      guid: uuidv4(),
      entityGuid,
      type: "program-enrolment-applied",
      data: {
        programId,
        ...(programName ? { programName } : {}),
        appliedAt,
        crId: fresh.reference,
        crName: fresh.reference,
      },
      timestamp: new Date().toISOString(),
      userId: SYNC_USER_ID,
      syncLevel: SyncLevel.EXTERNAL,
    });
  }

  /**
   * Combined sync operation.
   * Pulls first so remote changes are ingested before local data is pushed,
   * preventing stale local data from overwriting newer remote edits.
   */
  async sync(credentials?: ExternalSyncCredentials): Promise<void> {
    await this.pullData(credentials);
    await this.pushData(credentials);
  }

  // ==================== Push Logic ====================

  private async pushEntities(
    entities: Array<{ modified: { guid: string; type: EntityType; externalId?: string; data: Record<string, unknown> } }>,
    entityType: "individual" | "group",
  ): Promise<{ pushed: number; failed: number; skipped: number; errors: Array<{ guid: string; error: string; code: string }> }> {
    const failedEntities: Array<{ guid: string; error: string; code: string }> = [];
    let skipped = 0;

    for (let i = 0; i < entities.length; i += this.batchSize) {
      const batch = entities.slice(i, i + this.batchSize);
      for (const entityPair of batch) {
        const entity = entityPair.modified;
        const externalId = this.resolveExternalId(entity);

        let attempt = 0;
        let lastError: Error | null = null;
        let success = false;

        while (attempt <= this.maxRetries && !success) {
          try {
            if (entityType === "individual") {
              await this.pushIndividual(entity.guid, entity.data, externalId);
            } else {
              await this.pushGroup(entity.guid, entity.data, externalId);
            }
            success = true;
          } catch (error) {
            if (error instanceof PreconditionFailedError) {
              skipped++;
              break;
            }

            // Operator must reset the CR on the OpenSPP side before DC can
            // re-submit. Don't retry — log + record + move on.
            if (error instanceof ChangeRequestRevisionNeededError) {
              failedEntities.push({
                guid: entity.guid,
                error: error.message,
                code: "CR_REVISION_NEEDED",
              });
              log.warn(
                {
                  entityType,
                  guid: entity.guid,
                  reference: error.reference,
                  status: error.status,
                },
                "Push aborted: CR in terminal state needing operator reset",
              );
              break;
            }

            attempt++;
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt <= this.maxRetries) {
              const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
              const reason = error instanceof ConflictError ? "Conflict (409)" : "Error";
              log.warn({ entityType, guid: entity.guid, attempt, maxRetries: this.maxRetries, delayMs }, `${reason}, retrying push`);
              await this.delay(delayMs);
            } else {
              failedEntities.push({
                guid: entity.guid,
                error: lastError.message,
                code: "PUSH_FAILED",
              });
              log.error({ entityType, guid: entity.guid, err: lastError }, "Push failed after retries");
            }
          }
        }
      }

      if (i + this.batchSize < entities.length && this.batchDelayMs > 0) {
        await this.delay(this.batchDelayMs);
      }
    }

    return {
      pushed: entities.length - failedEntities.length - skipped,
      failed: failedEntities.length,
      skipped,
      errors: failedEntities,
    };
  }

  private async pushIndividual(
    guid: string,
    data: Record<string, unknown>,
    externalId?: string,
  ): Promise<void> {
    if (this.submitVia === "change-request") {
      await this.pushIndividualViaCR(guid, data, externalId);
    } else {
      await this.pushIndividualDirect(guid, data, externalId);
    }
    // Direct create writes the new externalId via `saveExternalIdToEntity`;
    // re-resolve from the store so the program-enrolment CR registrant
    // references the OpenSPP-issued identifier instead of a stale undefined.
    const refreshedId = await this.refreshExternalIdAfterPush(guid, externalId);
    await this.pushPendingProgramEnrolments(guid, "individual", data, refreshedId);
  }

  private async pushIndividualDirect(
    guid: string,
    data: Record<string, unknown>,
    externalId?: string,
  ): Promise<void> {
    const resource = this.buildIndividualResource(guid, data);
    const system = this.resolveIdentifierSystem(data);

    if (externalId) {
      const identifier = this.getClient().formatIdentifier(system, externalId);
      // Fetch current versionId for optimistic locking (If-Match).
      // Falls back to patching without If-Match if GET fails (e.g., 403 scope issue).
      let versionId: string | undefined;
      try {
        const current = await this.getClient().getIndividual(identifier);
        versionId = current?.meta?.versionId;
      } catch (err) {
        log.warn({ guid, err }, "Could not fetch individual for optimistic locking, proceeding without If-Match");
      }
      await this.getClient().patchIndividual(identifier, {
        name: resource.name,
        birthDate: resource.birthDate,
        gender: resource.gender,
        telecom: resource.telecom,
        extension: resource.extension,
      }, versionId);
    } else {
      const created = await this.getClient().createIndividual(resource);
      await this.saveExternalIdToEntity(guid, created);
    }
  }

  private async pushGroup(
    guid: string,
    data: Record<string, unknown>,
    externalId?: string,
  ): Promise<void> {
    if (this.submitVia === "change-request") {
      await this.pushGroupViaCR(guid, data, externalId);
    } else {
      await this.pushGroupDirect(guid, data, externalId);
    }
    const refreshedId = await this.refreshExternalIdAfterPush(guid, externalId);
    await this.pushPendingProgramEnrolments(guid, "group", data, refreshedId);
  }

  /**
   * Re-read the entity's externalId from the EntityStore after a direct push.
   *
   * `pushXxxDirect.saveExternalIdToEntity` may have just assigned a new
   * OpenSPP-issued identifier; the local `externalId` closure var is stale
   * after that. `pushPendingProgramEnrolments` needs the fresh value so the
   * CR registrant can resolve on OpenSPP.
   *
   * Silent on lookup failures — falls back to the input value.
   */
  private async refreshExternalIdAfterPush(
    guid: string,
    fallback: string | undefined,
  ): Promise<string | undefined> {
    try {
      const fresh = await this.eventApplierService.getEntityStore().getEntity(guid);
      const id = fresh?.modified?.externalId ?? (fresh?.modified?.data?.externalId as string | undefined);
      return id ?? fallback;
    } catch {
      return fallback;
    }
  }

  private async pushGroupDirect(
    guid: string,
    data: Record<string, unknown>,
    externalId?: string,
  ): Promise<void> {
    const resource = this.buildGroupResource(guid, data);
    const system = this.resolveIdentifierSystem(data, "group");

    if (externalId) {
      const identifier = this.getClient().formatIdentifier(system, externalId);
      let versionId: string | undefined;
      try {
        const current = await this.getClient().getGroup(identifier);
        versionId = current?.meta?.versionId;
      } catch (err) {
        log.warn({ guid, err }, "Could not fetch group for optimistic locking, proceeding without If-Match");
      }
      await this.getClient().patchGroup(identifier, {
        name: resource.name,
        groupType: resource.groupType,
        extension: resource.extension,
      }, versionId);
    } else {
      const created = await this.getClient().createGroup(resource);
      await this.saveExternalIdToEntity(guid, created);
    }
  }

  // ==================== Push Logic — Change Request mode ====================

  /**
   * Push an Individual via the OpenSPP `/ChangeRequest` workflow instead of
   * writing directly. The actual entity write is deferred to the OpenSPP
   * operator's `$apply` step and flows back via pull.
   *
   * v1 mapping (#948): `add-member` / `remove-member` events on members of a
   * group are NOT distinguished here — they show up as plain
   * `update-individual` / `update-group` and map to `edit_*` codes. Granular
   * member-CR mapping is deferred.
   */
  private async pushIndividualViaCR(
    guid: string,
    data: Record<string, unknown>,
    externalId?: string,
  ): Promise<void> {
    const eventTypeKey: EventTypeKey = externalId ? "update-individual" : "create-individual";
    const detail = this.buildIndividualResource(guid, data) as unknown as Record<string, unknown>;
    const system = this.resolveIdentifierSystem(data);
    const display =
      typeof data.name === "string"
        ? data.name
        : typeof data.fullName === "string"
          ? data.fullName
          : undefined;
    await this.pushViaChangeRequest(guid, "individual", eventTypeKey, detail, system, externalId, display);
  }

  /**
   * Push a Group via the OpenSPP `/ChangeRequest` workflow.
   * See {@link pushIndividualViaCR} for v1 mapping limitations.
   */
  private async pushGroupViaCR(
    guid: string,
    data: Record<string, unknown>,
    externalId?: string,
  ): Promise<void> {
    const eventTypeKey: EventTypeKey = externalId ? "update-group" : "create-group";
    const detail = this.buildGroupResource(guid, data) as unknown as Record<string, unknown>;
    const system = this.resolveIdentifierSystem(data, "group");
    const display =
      typeof data._displayName === "string"
        ? data._displayName
        : typeof data.name === "string"
          ? data.name
          : typeof data.groupName === "string"
            ? data.groupName
            : undefined;
    await this.pushViaChangeRequest(guid, "group", eventTypeKey, detail, system, externalId, display);
  }

  /**
   * Shared CR push path. Idempotent across re-runs:
   *
   * - If a CR record already exists for the entity:
   *   - `draft`: $submit was never reached (or failed); re-attempt $submit only.
   *   - `pending` / `approved` / `applied`: in flight or done; skip silently.
   *   - `rejected` / `revision`: throw {@link ChangeRequestRevisionNeededError}
   *     so the push loop records the failure without retrying.
   * - Otherwise create + submit a fresh CR and persist its reference + status.
   *
   * Note on partial failures: if `$create` succeeds but `$submit` fails, the
   * persisted record stays in `draft` so the next push run picks up exactly at
   * the recovery branch above (no second CR is created).
   */
  private async pushViaChangeRequest(
    entityGuid: string,
    entityKind: "individual" | "group",
    eventTypeKey: EventTypeKey,
    detail: Record<string, unknown>,
    identifierSystem: string,
    externalId: string | undefined,
    display: string | undefined,
    discriminator?: string | number,
  ): Promise<void> {
    const existing = await getCR(this.eventStore, entityGuid, discriminator);
    if (existing) {
      if (existing.status === "draft") {
        // Recovery: $submit was never reached or failed last run. Try again.
        const submitted = await this.getClient().submitChangeRequest(existing.reference);
        const next: CRRecord = {
          ...existing,
          status: submitted.status,
          submittedAt: submitted.submittedDate ?? new Date().toISOString(),
        };
        await setCR(this.eventStore, entityGuid, next, discriminator);
        return;
      }

      if (
        existing.status === "pending" ||
        existing.status === "approved" ||
        existing.status === "applied"
      ) {
        // Already in flight or done. Pull projects status updates separately.
        log.debug(
          { entityGuid, reference: existing.reference, status: existing.status, discriminator },
          "Skipping CR push: existing CR already in flight or applied",
        );
        return;
      }

      if (existing.status === "rejected" || existing.status === "revision") {
        throw new ChangeRequestRevisionNeededError(
          entityGuid,
          existing.reference,
          existing.status,
        );
      }
    }

    const requestTypeCode = resolveCRTypeCode(eventTypeKey, entityKind, this.changeRequestTypeMap);
    const registrant = this.buildRegistrantRef(entityGuid, identifierSystem, externalId, display);
    const payload: ChangeRequestCreate = {
      type: "ChangeRequest",
      requestType: { code: requestTypeCode },
      registrant,
      detail,
      description: `DataCollect entity ${entityGuid}`,
    };

    const created = await this.getClient().createChangeRequest(payload);
    const draftRecord: CRRecord = {
      reference: created.reference,
      status: created.status,
    };
    await setCR(this.eventStore, entityGuid, draftRecord, discriminator);

    const submitted = await this.getClient().submitChangeRequest(created.reference);
    const submittedRecord: CRRecord = {
      reference: created.reference,
      status: submitted.status,
      submittedAt: submitted.submittedDate ?? new Date().toISOString(),
    };
    await setCR(this.eventStore, entityGuid, submittedRecord, discriminator);
  }

  /**
   * Push any pending program enrolments stored on an entity via the OpenSPP
   * ChangeRequest workflow (CR type `assign_program`).
   *
   * Each entry in `data.pendingProgramEnrolments[]` becomes one CR keyed on
   * the program id so concurrent enrolments into distinct programs do not
   * collide on the idempotency store.
   *
   * Runs regardless of `submitVia` mode — program enrolment is approval-gated
   * on OpenSPP and has no `direct` equivalent in the V2 API.
   *
   * Per-enrolment errors are swallowed with `log.warn` so an enrolment that
   * fails to submit does not abort the surrounding entity push.
   */
  private async pushPendingProgramEnrolments(
    entityGuid: string,
    entityKind: "individual" | "group",
    data: Record<string, unknown>,
    externalId: string | undefined,
  ): Promise<void> {
    const raw = data.pendingProgramEnrolments;
    if (!Array.isArray(raw) || raw.length === 0) return;

    const fullSystem = this.resolveIdentifierSystem(data, entityKind === "group" ? "group" : "individual");
    const crSystem = stripFragment(fullSystem);
    const display =
      typeof data._displayName === "string"
        ? data._displayName
        : typeof data.name === "string"
          ? data.name
          : typeof data.groupName === "string"
            ? data.groupName
            : undefined;

    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const programId = (entry as { programId?: unknown }).programId;
      if (typeof programId !== "number" || !Number.isFinite(programId)) {
        log.warn({ entityGuid, entry }, "Skipping invalid pendingProgramEnrolment entry");
        continue;
      }
      try {
        await this.pushViaChangeRequest(
          entityGuid,
          entityKind,
          "enrol-in-program",
          { program_id: programId },
          crSystem,
          externalId,
          display,
          programId,
        );
      } catch (err) {
        if (err instanceof ChangeRequestRevisionNeededError) {
          // Bubble to caller — already classified.
          throw err;
        }
        log.warn(
          { entityGuid, programId, err },
          "Pending program enrolment CR push failed; will retry next sync",
        );
      }
    }
  }

  /**
   * Build the `registrant` field for a CR payload.
   *
   * - When `externalId` is present (UPDATE CRs), point at the OpenSPP-issued
   *   identifier so the operator's `$apply` resolves the existing registrant.
   * - When absent (CREATE CRs), fall back to a `datacollect:guid` placeholder.
   *   See {@link CR_GUID_REGISTRANT_SYSTEM} for caveats.
   */
  private buildRegistrantRef(
    entityGuid: string,
    identifierSystem: string,
    externalId: string | undefined,
    display: string | undefined,
  ): RegistrantRef {
    if (externalId) {
      const ref: RegistrantRef = { system: identifierSystem, value: externalId };
      if (display) ref.display = display;
      return ref;
    }
    const ref: RegistrantRef = { system: CR_GUID_REGISTRANT_SYSTEM, value: entityGuid };
    if (display) ref.display = display;
    return ref;
  }

  // ==================== Pull Logic ====================

  private async pullIndividuals(since?: string): Promise<{ pulled: number; failed: number; skipped: number; errors: SyncError[] }> {
    const entityStore = this.eventApplierService.getEntityStore();
    let offset = 0;
    const pageSize = 100;
    let hasMore = true;
    let pulled = 0;
    let failed = 0;
    let skipped = 0;
    const errors: SyncError[] = [];
    let consecutivePageFailures = 0;
    const maxConsecutivePageFailures = 3;

    while (hasMore) {
      const params: Record<string, string> = {
        _count: String(pageSize),
        _offset: String(offset),
      };
      if (since) {
        params._lastUpdated = `ge${since.split("T")[0]}`;
      }

      let individuals: IndividualResource[];
      try {
        const searchResult = await this.getClient().searchIndividuals(params);
        individuals = searchResult.data || [];
        consecutivePageFailures = 0;
      } catch (error) {
        consecutivePageFailures++;
        log.error({ offset, consecutivePageFailures, maxConsecutivePageFailures, err: error }, "Failed to search individuals, skipping page");
        failed++;
        errors.push({
          code: "SEARCH_FAILED",
          message: `Failed to search individuals (offset=${offset}): ${error instanceof Error ? error.message : String(error)}`,
          retryable: true,
        });
        if (consecutivePageFailures >= maxConsecutivePageFailures) {
          break;
        }
        offset += pageSize;
        continue;
      }

      if (individuals.length === 0) {
        hasMore = false;
        break;
      }

      for (const individual of individuals) {
        const identifier = this.extractIdentifier(individual) ?? this.extractAnyIdentifier(individual);
        if (!identifier) {
          log.warn("Individual without any identifier, skipping");
          skipped++;
          continue;
        }

        try {
          const existingEntity = await entityStore.getEntityByExternalId(identifier);
          const formSubmission = this.transformIndividualToFormSubmission(
            individual,
            existingEntity?.guid,
            identifier,
          );
          await this.eventApplierService.submitForm(formSubmission);
          pulled++;
        } catch (error) {
          log.error({ err: error }, "Failed to pull individual");
          failed++;
          errors.push({
            entityGuid: identifier,
            code: "PULL_FAILED",
            message: `Failed to pull individual ${identifier}: ${error instanceof Error ? error.message : String(error)}`,
            retryable: true,
          });
        }
      }

      offset += individuals.length;
      hasMore = individuals.length === pageSize;
    }

    return { pulled, failed, skipped, errors };
  }

  private async pullGroups(since?: string): Promise<{ pulled: number; failed: number; skipped: number; errors: SyncError[] }> {
    const entityStore = this.eventApplierService.getEntityStore();
    let offset = 0;
    const pageSize = 100;
    let hasMore = true;
    let pulled = 0;
    let failed = 0;
    let consecutivePageFailures = 0;
    const maxConsecutivePageFailures = 3;
    let skipped = 0;
    const errors: SyncError[] = [];

    while (hasMore) {
      const params: Record<string, string> = {
        _count: String(pageSize),
        _offset: String(offset),
      };
      if (since) {
        params._lastUpdated = `ge${since.split("T")[0]}`;
      }
      let groups: GroupResource[];
      try {
        const searchResult = await this.getClient().searchGroups(params);
        groups = searchResult.data || [];
        consecutivePageFailures = 0;
      } catch (error) {
        consecutivePageFailures++;
        log.error({ offset, consecutivePageFailures, maxConsecutivePageFailures, err: error }, "Failed to search groups, skipping page");
        failed++;
        errors.push({
          code: "SEARCH_FAILED",
          message: `Failed to search groups (offset=${offset}): ${error instanceof Error ? error.message : String(error)}`,
          retryable: true,
        });
        if (consecutivePageFailures >= maxConsecutivePageFailures) {
          break;
        }
        offset += pageSize;
        continue;
      }

      if (groups.length === 0) {
        hasMore = false;
        break;
      }

      for (const group of groups) {
        const identifier = this.extractGroupIdentifier(group) ?? this.extractAnyIdentifier(group);
        if (!identifier) {
          log.warn("Group without any identifier, skipping");
          skipped++;
          continue;
        }

        try {
          const existingEntity = await entityStore.getEntityByExternalId(identifier);
          const formSubmission = this.transformGroupToFormSubmission(
            group,
            existingEntity?.guid,
            identifier,
          );
          await this.eventApplierService.submitForm(formSubmission);
          pulled++;
        } catch (error) {
          log.error({ err: error }, "Failed to pull group");
          failed++;
          errors.push({
            entityGuid: identifier,
            code: "PULL_FAILED",
            message: `Failed to pull group ${identifier}: ${error instanceof Error ? error.message : String(error)}`,
            retryable: true,
          });
        }
      }

      offset += groups.length;
      hasMore = groups.length === pageSize;
    }

    return { pulled, failed, skipped, errors };
  }

  // ==================== Resource Builders ====================

  private async ensureClient(): Promise<void> {
    if (this.client) {
      return;
    }

    if (!this.url || !this.clientId || !this.clientSecret) {
      throw new Error("URL, clientId, and clientSecret are required");
    }

    this.client = new OpenSppV2Client({
      baseUrl: this.url,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      includeStudioExtensions: this.includeStudioExtensions,
    });

    await this.client.authenticate();
  }

  private getClient(): OpenSppV2Client {
    if (!this.client) {
      throw new Error("Client not initialized. Call ensureClient() first.");
    }
    return this.client;
  }

  private resolveExternalId(entity: { externalId?: string; data: Record<string, unknown> }): string | undefined {
    return entity.externalId ?? (entity.data.externalId as string | undefined);
  }

  /**
   * Resolve the OpenSPP identifier system URI from entity data.
   * Checks for an `identifierType` field in the form data, falling back to `national_id`.
   */
  private resolveIdentifierSystem(data: Record<string, unknown>, entityType: "individual" | "group" = "individual"): string {
    const formCode = data.identifierType as string | undefined;
    const defaultCode = entityType === "group" ? this.groupIdentifierType : this.identifierType;
    const code = formCode || defaultCode;
    if (code.startsWith(this.identifierNamespace)) {
      return code;
    }
    return `${this.identifierNamespace}${code}`;
  }

  /**
   * Check if an identifier system matches the configured namespace.
   */
  private isOpenSppIdentifier(system: string): boolean {
    return system.startsWith(this.identifierNamespace);
  }

  /**
   * Build an IndividualResource from entity data.
   * Uses `type` discriminator per ADR-019.
   */
  private buildIndividualResource(
    guid: string,
    data: Record<string, unknown>,
  ): IndividualResource {
    const fieldMappings = this.getFieldMappings();
    const system = this.resolveIdentifierSystem(data);
    const resource: IndividualResource = {
      type: "Individual",
      identifier: [this.getClient().createIdentifier(system, guid)],
      active: true,
    };

    // Use field mappings to resolve core fields; fall back to conventional names
    const resolve = (opensppField: string, ...fallbackKeys: string[]): string | undefined => {
      // Check field mappings first
      const mapping = fieldMappings.find((m) => m.opensppField === opensppField);
      if (mapping) {
        const raw = data[mapping.formField];
        if (raw !== null && raw !== undefined && raw !== "") {
          const transformer = createTransformer(
            mapping.transformer.type as TransformerType,
            mapping.transformer.options as Record<string, string> | undefined,
          );
          const val = transformer.transform(raw);
          if (val !== null && val !== undefined && val !== "") return String(val);
        }
      }
      // Fall back to conventional field names
      for (const key of fallbackKeys) {
        if (data[key] !== null && data[key] !== undefined && data[key] !== "") {
          return String(data[key]);
        }
      }
      return undefined;
    };

    const name: HumanName = {};
    name.given = resolve("name.given", "firstName", "first_name");
    name.family = resolve("name.family", "lastName", "last_name");
    name.middle = resolve("name.middle", "middleName", "middle_name");
    const fullName = resolve("name.text", "name", "fullName", "full_name");

    if (name.given || name.family) {
      name.text = fullName || [name.family, name.given].filter(Boolean).join(", ");
      resource.name = name;
    } else if (fullName) {
      name.text = fullName;
      resource.name = name;
    }

    const birthDate = resolve("birthDate", "birthDate", "dateOfBirth", "date_of_birth");
    if (birthDate) {
      resource.birthDate = birthDate;
    }

    const gender = resolve("gender", "gender");
    if (gender) {
      resource.gender = this.buildGenderCoding(gender);
    }

    const phone = resolve("telecom.phone", "phone", "phoneNumber", "phone_number");
    if (phone) {
      resource.telecom = [{ system: "phone", value: phone, use: "mobile" }];
    }

    const email = resolve("telecom.email", "email", "emailAddress", "email_address");
    if (email) {
      if (!resource.telecom) resource.telecom = [];
      resource.telecom.push({ system: "email", value: email });
    }

    // Studio extension fields from remaining mappings (not already used for core fields)
    const coreOpenSppFields = new Set(["name.given", "name.family", "name.middle", "name.text", "birthDate", "gender", "telecom.phone", "telecom.email"]);
    const studioMappings = fieldMappings.filter((m) => !coreOpenSppFields.has(m.opensppField));
    if (studioMappings.length > 0 && this.includeStudioExtensions) {
      const studioExtension = this.buildStudioExtension(data, studioMappings);
      if (Object.keys(studioExtension).length > 1) {
        resource.extension = {
          [STUDIO_INDIVIDUAL_EXTENSION_KEY]: studioExtension,
        };
      }
    }

    return resource;
  }

  /**
   * Build a GroupResource from entity data.
   * Uses `type` discriminator and `groupType` per ADR-019.
   */
  private buildGroupResource(
    guid: string,
    data: Record<string, unknown>,
  ): GroupResource {
    const system = this.resolveIdentifierSystem(data, "group");
    const resource: GroupResource = {
      type: "Group",
      identifier: [this.getClient().createIdentifier(system, guid)],
      active: true,
      groupType: "household",
    };

    if (data._displayName || data.name || data.groupName || data.group_name) {
      resource.name = String(data._displayName || data.name || data.groupName || data.group_name);
    }

    if (data.groupType || data.group_type) {
      const gt = String(data.groupType || data.group_type);
      if (["household", "family", "organization", "other"].includes(gt)) {
        resource.groupType = gt as GroupResource["groupType"];
      }
    }

    return resource;
  }

  private buildGenderCoding(gender: string): CodeableConcept {
    const normalized = gender.toLowerCase();
    const mapping = GENDER_TO_CODE[normalized] || { code: "0", display: "Unknown" };

    return {
      coding: [
        {
          system: "urn:iso:std:iso:5218",
          code: mapping.code,
          display: mapping.display,
        },
      ],
    };
  }

  private buildStudioExtension(
    data: Record<string, unknown>,
    fieldMappings: FieldMapping[],
  ): Extension {
    const extension: Extension = {
      url: STUDIO_INDIVIDUAL_EXTENSION_KEY,
    };

    for (const mapping of fieldMappings) {
      const formValue = data[mapping.formField];
      if (formValue === null || formValue === undefined || formValue === "") {
        continue;
      }

      const transformer = createTransformer(
        mapping.transformer.type as TransformerType,
        mapping.transformer.options as Record<string, string> | undefined,
      );

      const transformedValue = transformer.transform(formValue);
      if (transformedValue === null || transformedValue === undefined || transformedValue === "") {
        continue;
      }

      const apiFieldName = this.toCamelCase(mapping.opensppField);
      extension[apiFieldName] = transformedValue;
    }

    return extension;
  }

  private toCamelCase(str: string): string {
    const withoutPrefix = str.replace(/^x_/, "");
    return withoutPrefix.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  // ==================== Identifier Extraction ====================

  private extractIdentifier(individual: IndividualResource): string | undefined {
    const matchingId = individual.identifier?.find(
      (id) => this.isOpenSppIdentifier(id.system),
    );
    return matchingId?.value;
  }

  private extractGroupIdentifier(group: GroupResource): string | undefined {
    const matchingId = group.identifier?.find(
      (id) => this.isOpenSppIdentifier(id.system),
    );
    return matchingId?.value;
  }

  /**
   * Fallback identifier extraction for records created directly in OpenSPP
   * that don't carry a DataCollect-issued identifier.
   * Uses system|value composite so round-trips are stable.
   */
  private extractAnyIdentifier(resource: IndividualResource | GroupResource): string | undefined {
    const first = resource.identifier?.[0];
    if (!first) return undefined;
    return `${first.system}|${first.value}`;
  }

  // ==================== Transform to Form Submissions ====================

  private transformIndividualToFormSubmission(
    individual: IndividualResource,
    existingGuid?: string,
    resolvedIdentifier?: string,
  ): {
    guid: string;
    entityGuid: string;
    type: string;
    data: Record<string, unknown>;
    timestamp: string;
    userId: string;
    syncLevel: SyncLevel;
  } {
    const identifier = resolvedIdentifier ?? this.extractIdentifier(individual);
    const guid = existingGuid || identifier || uuidv4();

    const data: Record<string, unknown> = {
      entityName: "individual",
    };

    if (individual.name) {
      if (individual.name.given) data.firstName = individual.name.given;
      if (individual.name.family) data.lastName = individual.name.family;
      if (individual.name.middle) data.middleName = individual.name.middle;
      const displayParts = [individual.name.given, individual.name.family].filter(Boolean);
      if (displayParts.length > 0) {
        data.name = displayParts.join(" ");
      }
    }

    if (individual.birthDate) {
      data.dateOfBirth = individual.birthDate;
    }

    if (individual.gender?.coding?.[0]) {
      const genderCode = individual.gender.coding[0].code;
      data.gender = GENDER_FROM_CODE[genderCode] || "unknown";
    }

    if (individual.telecom) {
      const phone = individual.telecom.find((t) => t.system === "phone");
      const email = individual.telecom.find((t) => t.system === "email");
      if (phone) data.phone = phone.value;
      if (email) data.email = email.value;
    }

    if (individual.extension) {
      const studioExt = individual.extension[STUDIO_INDIVIDUAL_EXTENSION_KEY];
      if (studioExt) {
        for (const [key, value] of Object.entries(studioExt)) {
          if (key !== "url") {
            const fieldName = `x_${key.replace(/([A-Z])/g, "_$1").toLowerCase()}`;
            data[fieldName] = value;
          }
        }
      }
    }

    data.externalId = identifier;

    return {
      guid: uuidv4(),
      entityGuid: guid,
      type: existingGuid ? "update-individual" : "create-individual",
      data,
      timestamp: individual.meta?.lastUpdated ?? new Date().toISOString(),
      userId: SYNC_USER_ID,
      syncLevel: SyncLevel.EXTERNAL,
    };
  }

  private transformGroupToFormSubmission(
    group: GroupResource,
    existingGuid?: string,
    resolvedIdentifier?: string,
  ): {
    guid: string;
    entityGuid: string;
    type: string;
    data: Record<string, unknown>;
    timestamp: string;
    userId: string;
    syncLevel: SyncLevel;
  } {
    const identifier = resolvedIdentifier ?? this.extractGroupIdentifier(group);
    const guid = existingGuid || identifier || uuidv4();

    const data: Record<string, unknown> = {
      entityName: "group",
    };

    if (group.name) {
      data.name = group.name;
      data.groupName = group.name;
    }

    if (group.groupType) {
      data.groupType = group.groupType;
    }

    data.externalId = identifier;

    return {
      guid: uuidv4(),
      entityGuid: guid,
      type: existingGuid ? "update-group" : "create-group",
      data,
      timestamp: group.meta?.lastUpdated ?? new Date().toISOString(),
      userId: SYNC_USER_ID,
      syncLevel: SyncLevel.EXTERNAL,
    };
  }

  // ==================== Helpers ====================

  private getFieldMappings(): FieldMapping[] {
    const configWithMappings = this.config as ExternalSyncConfig & {
      fieldMappings?: FieldMapping[];
    };
    return configWithMappings.fieldMappings || [];
  }

  private async saveExternalIdToEntity(
    entityGuid: string,
    created: IndividualResource | GroupResource,
  ): Promise<void> {
    try {
      const entityPair = await this.eventApplierService.getEntityStore().getEntity(entityGuid);
      if (!entityPair) {
        log.warn({ entityGuid }, "Cannot save external ID: entity not found");
        return;
      }

      const identifier =
        created.type === "Individual"
          ? this.extractIdentifier(created as IndividualResource)
          : this.extractGroupIdentifier(created as GroupResource);
      if (!identifier) {
        return;
      }

      const updatedEntity = {
        ...entityPair.modified,
        externalId: identifier,
        data: {
          ...entityPair.modified.data,
          externalId: identifier,
        },
      };

      await this.eventApplierService.getEntityStore().saveEntity(entityPair.initial, updatedEntity);
    } catch (error) {
      log.error({ entityGuid, err: error }, "Error saving external ID to entity");
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Read `submitVia` from `ExternalSyncConfig.adapterConfig`, falling back to
 * the legacy `extraFields` shape. Anything other than `"change-request"`
 * (including `undefined`) resolves to `"direct"` so tenants without explicit
 * config retain the pre-#948 behaviour.
 */
function readSubmitVia(config: ExternalSyncConfig): ChangeRequestSubmitMode {
  const raw = getAdapterConfigValue<string>(config, "submitVia");
  return raw === "change-request" ? "change-request" : "direct";
}

/**
 * Read `changeRequestTypeMap` from config. The map is an object, not a
 * primitive, so we accept either:
 *   - `adapterConfig.changeRequestTypeMap` as a JSON-stringified record, or
 *   - the same field on the parent config as a real object (forwarded by
 *     callers that bypass `adapterConfig`'s primitive constraint).
 *
 * Returns `{}` when absent or unparseable so the resolver falls through to
 * {@link DEFAULT_CR_TYPE_MAP}.
 */
function readChangeRequestTypeMap(
  config: ExternalSyncConfig,
): Partial<Record<EventTypeKey, string>> {
  // Direct object on the parent config (set by V2 callers that hold the typed
  // options; not exposed on adapterConfig because it's not a primitive).
  const direct = (config as ExternalSyncConfig & {
    changeRequestTypeMap?: Partial<Record<EventTypeKey, string>>;
  }).changeRequestTypeMap;
  if (direct && typeof direct === "object") {
    return direct;
  }

  // String fallback for tenants that round-trip config through JSON.
  const raw = getAdapterConfigValue<string>(config, "changeRequestTypeMap");
  if (typeof raw !== "string" || raw.trim() === "") {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Partial<Record<EventTypeKey, string>>;
    }
  } catch {
    // Fall through to {} — the resolver will use defaults.
  }
  return {};
}

export type { OpenSppV2AdapterOptions };
export default OpenSppV2SyncAdapter;
