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
  createLogger,
  EntityType,
  type AdapterDescriptor,
  type EntityDoc,
  type EntityPair,
  type EntityPushPayload,
  type EventStore,
  type ExternalSyncAdapterV2,
  type HealthCheckResult,
  type SyncError,
  type SyncResult,
} from "@idpass/data-collect-core";
import { EventApplierService } from "@idpass/data-collect-core";
import { mockConfigSchema, type MockConfig } from "./config";
import {
  AuthError,
  ConflictError,
  MockRegistryClient,
  NonRetryableError,
  NotFoundError,
  PreconditionFailedError,
  RetryableError,
} from "./MockRegistryClient";
import { personToFormSubmission } from "./pullTransformers/personToFormSubmission";
import { groupToFormSubmission } from "./pullTransformers/groupToFormSubmission";
import {
  individualToPersonCreate,
  individualToPersonUpdate,
} from "./pushTransformers/individualToPerson";
import {
  groupToGroupCreate,
  groupToGroupUpdate,
} from "./pushTransformers/groupToGroup";

const log = createLogger("adapter-mock:v2");

/** Default page size for list endpoints. */
const DEFAULT_PAGE_SIZE = 100;

/** Safety cap on pagination loops to prevent infinite loops on misbehaving servers. */
const MAX_PAGES = 10_000;

/**
 * Mock Registry V2 sync adapter.
 *
 * Implements `ExternalSyncAdapterV2` against the Python mock registry server
 * (`examples/mock-server`). Uses the same protocol the production adapters
 * follow (OAuth2 + REST + optimistic concurrency) so it works as a reference
 * implementation for new adapters.
 *
 * Sync protocol:
 * - `pull(since?)` fetches persons + groups updated after `since`, paginates,
 *   transforms each record to a FormSubmission, and feeds them through
 *   `EventApplierService.submitForm`.
 * - `push([])` reads the push watermark from EventStore, fetches modified
 *   entities via `entityStore.getModifiedEntitiesSince`, filters out entities
 *   whose only recent change was an external pull (stale filter), and POSTs
 *   new records or PATCHes existing ones. On 412 conflicts, the entity is
 *   skipped (non-retryable, not failed).
 */
export class MockRegistrySyncAdapter implements ExternalSyncAdapterV2 {
  private config: MockConfig | null = null;
  private client: MockRegistryClient | null = null;

  constructor(
    private readonly eventStore: EventStore,
    private readonly eventApplierService: EventApplierService,
  ) {}

  // ==================== Descriptor ====================

  descriptor(): AdapterDescriptor {
    return {
      type: "mock",
      version: "2.0.0",
      capabilities: ["push", "pull"],
      configSchema: mockConfigSchema,
    };
  }

  // ==================== Lifecycle ====================

  async initialize(config: Record<string, unknown>): Promise<void> {
    const parsed = mockConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new Error(`Invalid mock adapter config: ${parsed.error.message}`);
    }
    this.config = parsed.data;

    this.client = new MockRegistryClient({
      baseUrl: this.config.url,
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      timeout: this.config.timeout,
    });

    log.info({ baseUrl: this.config.url }, "Mock registry adapter initialized");
  }

  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.client) {
      return { healthy: false, message: "Not initialized" };
    }

    const startTime = Date.now();
    try {
      const result = await this.client.health();
      return {
        healthy: result.status === "ok" || result.status === "healthy",
        latency: Date.now() - startTime,
        message: `Mock registry reports status=${result.status}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        healthy: false,
        latency: Date.now() - startTime,
        message,
      };
    }
  }

  async disconnect(): Promise<void> {
    this.client?.clearToken();
    this.client = null;
    this.config = null;
  }

  // ==================== Pull ====================

  async pull(since?: string): Promise<SyncResult> {
    const startTime = Date.now();

    if (!this.client || !this.config) {
      return this.notInitializedResult(startTime);
    }

    const effectiveSince = since && since.length > 0 ? since : undefined;
    const errors: SyncError[] = [];
    let pulled = 0;
    let failed = 0;
    let skipped = 0;

    // Persons
    try {
      const r = await this.pullPersons(effectiveSince);
      pulled += r.pulled;
      failed += r.failed;
      skipped += r.skipped;
      errors.push(...r.errors);
    } catch (error) {
      failed++;
      errors.push(this.toSyncError(error, "PULL_PERSONS_FAILED"));
    }

    // Groups
    try {
      const r = await this.pullGroups(effectiveSince);
      pulled += r.pulled;
      failed += r.failed;
      skipped += r.skipped;
      errors.push(...r.errors);
    } catch (error) {
      failed++;
      errors.push(this.toSyncError(error, "PULL_GROUPS_FAILED"));
    }

    return {
      success: failed === 0,
      pushed: 0,
      pulled,
      failed,
      skipped,
      errors,
      duration: Date.now() - startTime,
    };
  }

  private async pullPersons(since?: string): Promise<{
    pulled: number;
    failed: number;
    skipped: number;
    errors: SyncError[];
  }> {
    const config = this.config!;
    const client = this.client!;
    const entityStore = this.eventApplierService.getEntityStore();

    let offset = 0;
    let pulled = 0;
    let failed = 0;
    let skipped = 0;
    const errors: SyncError[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await client.listPersons({
        updatedSince: since,
        limit: DEFAULT_PAGE_SIZE,
        offset,
      });

      if (!response || !Array.isArray(response.items)) {
        log.warn({ offset }, "Malformed person list response, aborting page loop");
        break;
      }

      if (response.items.length === 0) {
        break;
      }

      for (const person of response.items) {
        if (!person || !person.uuid) {
          skipped++;
          continue;
        }

        try {
          // The server-issued UUID is the stable external identifier used for
          // round-trip reconciliation. See personToFormSubmission for why.
          const externalId = person.uuid;

          const existing = await entityStore.getEntityByExternalId(externalId);
          const formSubmission = personToFormSubmission(
            person,
            config.identifierScheme,
            config.identifierType,
            existing?.guid,
          );

          if (!formSubmission) {
            skipped++;
            continue;
          }

          await this.eventApplierService.submitForm(formSubmission);
          pulled++;
        } catch (error) {
          failed++;
          errors.push(this.toSyncError(error, "PULL_PERSON_FAILED"));
        }
      }

      if (response.next_offset === null || response.next_offset === undefined) {
        break;
      }
      if (response.items.length < DEFAULT_PAGE_SIZE) {
        break;
      }
      offset = response.next_offset;
    }

    return { pulled, failed, skipped, errors };
  }

  private async pullGroups(since?: string): Promise<{
    pulled: number;
    failed: number;
    skipped: number;
    errors: SyncError[];
  }> {
    const config = this.config!;
    const client = this.client!;
    const entityStore = this.eventApplierService.getEntityStore();

    let offset = 0;
    let pulled = 0;
    let failed = 0;
    let skipped = 0;
    const errors: SyncError[] = [];

    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await client.listGroups({
        updatedSince: since,
        limit: DEFAULT_PAGE_SIZE,
        offset,
      });

      if (!response || !Array.isArray(response.items)) {
        log.warn({ offset }, "Malformed group list response, aborting page loop");
        break;
      }

      if (response.items.length === 0) {
        break;
      }

      for (const group of response.items) {
        if (!group || !group.uuid) {
          skipped++;
          continue;
        }

        try {
          // The server-issued UUID is the stable external identifier used for
          // round-trip reconciliation. See groupToFormSubmission for why.
          const externalId = group.uuid;

          const existing = await entityStore.getEntityByExternalId(externalId);
          const formSubmission = groupToFormSubmission(
            group,
            config.identifierScheme,
            config.identifierType,
            existing?.guid,
          );

          if (!formSubmission) {
            skipped++;
            continue;
          }

          await this.eventApplierService.submitForm(formSubmission);
          pulled++;
        } catch (error) {
          failed++;
          errors.push(this.toSyncError(error, "PULL_GROUP_FAILED"));
        }
      }

      if (response.next_offset === null || response.next_offset === undefined) {
        break;
      }
      if (response.items.length < DEFAULT_PAGE_SIZE) {
        break;
      }
      offset = response.next_offset;
    }

    return { pulled, failed, skipped, errors };
  }

  // ==================== Push ====================

  async push(_entities: EntityPushPayload[]): Promise<SyncResult> {
    const startTime = Date.now();

    if (!this.client || !this.config) {
      return this.notInitializedResult(startTime);
    }

    const entityStore = this.eventApplierService.getEntityStore();
    const lastPush = await this.eventStore.getLastPushExternalSyncTimestamp();
    const allModified: EntityPair[] = lastPush
      ? await entityStore.getModifiedEntitiesSince(lastPush)
      : await entityStore.getAllEntities();

    // Exclude entities whose only change was an external pull (initial.version
    // === modified.version with an externalId already attached).
    const toSync = allModified.filter((pair) => {
      if (
        pair.modified.externalId &&
        pair.initial &&
        pair.initial.version === pair.modified.version
      ) {
        return false;
      }
      return true;
    });

    let pushed = 0;
    let failed = 0;
    let skipped = 0;
    const errors: SyncError[] = [];

    for (const pair of toSync) {
      try {
        const result = await this.pushEntity(pair);
        if (result === "pushed") {
          pushed++;
        } else if (result === "skipped") {
          skipped++;
        }
      } catch (error) {
        failed++;
        errors.push(this.toSyncError(error, "PUSH_FAILED", pair.modified.guid));
      }
    }

    // Only advance the push watermark when every entity pushed cleanly.
    // Failed entities have lastUpdated from before this cycle — advancing
    // would permanently exclude them from future push attempts.
    if (failed === 0) {
      await this.eventStore.setLastPushExternalSyncTimestamp(new Date().toISOString());
    }

    return {
      success: failed === 0,
      pushed,
      pulled: 0,
      failed,
      skipped,
      errors,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Push a single entity. Returns "pushed" on success, "skipped" when a 412
   * conflict was encountered (non-retryable, not a failure).
   */
  private async pushEntity(
    pair: EntityPair,
  ): Promise<"pushed" | "skipped"> {
    const entity = pair.modified;
    const externalId = entity.externalId ?? (entity.data?.externalId as string | undefined);

    if (entity.type === EntityType.Individual) {
      return this.pushIndividual(entity, externalId);
    }

    if (entity.type === EntityType.Group) {
      return this.pushGroup(entity, externalId);
    }

    log.warn({ type: entity.type, guid: entity.guid }, "Unsupported entity type, skipping");
    return "skipped";
  }

  private async pushIndividual(
    entity: EntityDoc,
    externalId?: string,
  ): Promise<"pushed" | "skipped"> {
    const client = this.client!;

    if (externalId) {
      // PATCH existing — need current updated_at for If-Match precondition
      let ifMatch: string | undefined;
      try {
        const current = await client.getPerson(externalId);
        ifMatch = current?.updated_at;
      } catch (error) {
        if (error instanceof NotFoundError) {
          // External side dropped it — fall back to create
          log.warn({ externalId, guid: entity.guid }, "Person not found remotely, re-creating");
          return this.createIndividualAndSaveId(entity);
        }
        throw error;
      }

      if (!ifMatch) {
        log.warn({ externalId }, "Missing updated_at on fetched person, skipping PATCH");
        return "skipped";
      }

      const patch = individualToPersonUpdate(entity);
      try {
        await client.updatePerson(externalId, patch, ifMatch);
        return "pushed";
      } catch (error) {
        if (error instanceof PreconditionFailedError) {
          log.warn({ externalId, guid: entity.guid }, "Push skipped: If-Match precondition failed");
          return "skipped";
        }
        if (error instanceof ConflictError) {
          // 409 on PATCH: some other immutable conflict (e.g., duplicate
          // identifier constraint). Retrying won't fix it.
          log.warn(
            { guid: entity.guid },
            "Person push skipped: remote reported 409 Conflict on update",
          );
          return "skipped";
        }
        throw error;
      }
    }

    return this.createIndividualAndSaveId(entity);
  }

  private async createIndividualAndSaveId(
    entity: EntityDoc,
  ): Promise<"pushed" | "skipped"> {
    const config = this.config!;
    const client = this.client!;

    const payload = individualToPersonCreate(
      entity,
      config.identifierScheme,
      config.identifierType,
    );
    let created;
    try {
      created = await client.createPerson(payload);
    } catch (error) {
      if (error instanceof ConflictError) {
        // 409 on create: the identifier already exists remotely. Retrying
        // won't fix it — log (no PII: guid only) and treat as skipped so the
        // watermark can still advance past other cleanly-pushed entities.
        log.warn(
          { guid: entity.guid },
          "Person push skipped: remote reported 409 Conflict on create",
        );
        return "skipped";
      }
      throw error;
    }

    if (created?.uuid) {
      await this.saveExternalIdToEntity(entity.guid, created.uuid);
    }
    return "pushed";
  }

  private async pushGroup(
    entity: EntityDoc,
    externalId?: string,
  ): Promise<"pushed" | "skipped"> {
    const client = this.client!;

    if (externalId) {
      let ifMatch: string | undefined;
      try {
        const current = await client.getGroup(externalId);
        ifMatch = current?.updated_at;
      } catch (error) {
        if (error instanceof NotFoundError) {
          log.warn({ externalId, guid: entity.guid }, "Group not found remotely, re-creating");
          return this.createGroupAndSaveId(entity);
        }
        throw error;
      }

      if (!ifMatch) {
        log.warn({ externalId }, "Missing updated_at on fetched group, skipping PATCH");
        return "skipped";
      }

      const patch = groupToGroupUpdate(entity);
      try {
        await client.updateGroup(externalId, patch, ifMatch);
        return "pushed";
      } catch (error) {
        if (error instanceof PreconditionFailedError) {
          log.warn({ externalId, guid: entity.guid }, "Group push skipped: If-Match precondition failed");
          return "skipped";
        }
        if (error instanceof ConflictError) {
          log.warn(
            { guid: entity.guid },
            "Group push skipped: remote reported 409 Conflict on update",
          );
          return "skipped";
        }
        throw error;
      }
    }

    return this.createGroupAndSaveId(entity);
  }

  private async createGroupAndSaveId(
    entity: EntityDoc,
  ): Promise<"pushed" | "skipped"> {
    const config = this.config!;
    const client = this.client!;

    const payload = groupToGroupCreate(
      entity,
      config.identifierScheme,
      config.identifierType,
    );
    let created;
    try {
      created = await client.createGroup(payload);
    } catch (error) {
      if (error instanceof ConflictError) {
        log.warn(
          { guid: entity.guid },
          "Group push skipped: remote reported 409 Conflict on create",
        );
        return "skipped";
      }
      throw error;
    }

    if (created?.uuid) {
      await this.saveExternalIdToEntity(entity.guid, created.uuid);
    }
    return "pushed";
  }

  /**
   * Store the remote UUID on the DC entity so subsequent pushes use PATCH
   * instead of creating duplicate records.
   *
   * Throws on persistence failure. The outer `pushEntity` catch will count
   * the entity as `failed`, which prevents watermark advancement — this is
   * correct behavior: if the remote record exists but DC lost the externalId
   * pointer, the next push would create a duplicate on the remote side.
   * Silencing this error guarantees a duplicate.
   */
  private async saveExternalIdToEntity(
    entityGuid: string,
    externalId: string,
  ): Promise<void> {
    const entityStore = this.eventApplierService.getEntityStore();

    let pair;
    try {
      pair = await entityStore.getEntity(entityGuid);
    } catch (error) {
      log.error(
        { entityGuid, err: error instanceof Error ? error.message : String(error) },
        "Failed to read entity while persisting external ID",
      );
      throw new Error(
        `Failed to persist externalId for entity ${entityGuid}: cannot read entity`,
      );
    }

    if (!pair) {
      log.warn({ entityGuid }, "Cannot save external ID: entity not found");
      throw new Error(
        `Failed to persist externalId for entity ${entityGuid}: entity not found`,
      );
    }

    const updated: EntityDoc = {
      ...pair.modified,
      externalId,
      data: {
        ...pair.modified.data,
        externalId,
      },
    };

    try {
      await entityStore.saveEntity(pair.initial, updated);
    } catch (error) {
      log.error(
        { entityGuid, err: error instanceof Error ? error.message : String(error) },
        "Failed to save external ID to entity",
      );
      throw new Error(
        `Failed to persist externalId for entity ${entityGuid}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // ==================== Helpers ====================

  private notInitializedResult(startTime: number): SyncResult {
    return {
      success: false,
      pushed: 0,
      pulled: 0,
      failed: 0,
      skipped: 0,
      errors: [
        { code: "NOT_INITIALIZED", message: "Adapter not initialized", retryable: false },
      ],
      duration: Date.now() - startTime,
    };
  }

  private toSyncError(error: unknown, code: string, entityGuid?: string): SyncError {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = this.isRetryable(error);
    return {
      ...(entityGuid ? { entityGuid } : {}),
      code,
      message,
      retryable,
    };
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof RetryableError) return true;
    if (error instanceof AuthError) return true; // token cleared, next call re-auths
    if (error instanceof ConflictError) return false;
    if (error instanceof PreconditionFailedError) return false;
    if (error instanceof NotFoundError) return false;
    if (error instanceof NonRetryableError) return false;
    // Unknown errors — be conservative and mark retryable so callers don't
    // silently drop transient failures.
    return true;
  }
}

/**
 * Alias retained so default exports remain compatible with factory imports.
 */
export default MockRegistrySyncAdapter;
