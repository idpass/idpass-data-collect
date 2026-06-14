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

import { EventStore, ExternalSyncAdapter, ExternalSyncConfig, ExternalSyncCredentials } from "../interfaces/types";
import type {
  ExternalSyncAdapterV2,
  SyncResult,
  HealthCheckResult,
  EntityPushPayload,
} from "../interfaces/adapter";
import { EventApplierService } from "../services/EventApplierService";
import { adapterRegistry } from "./AdapterRegistry";
import {
  LegacyAdapterConstructor,
  LegacyAdapterWrapper,
  legacyAdapterRegistry,
} from "./legacyAdapterSupport";
import { createLogger } from "../utils/logger";

export interface SyncProgress {
  phase: 'pushing' | 'pulling';
  pushed: number;
  pulled: number;
  failed: number;
  skipped: number;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

export interface SyncOptions {
  onProgress?: SyncProgressCallback;
  signal?: AbortSignal;
}

/**
 * Build the flat adapter config object that a V2 adapter's `configSchema` is
 * validated against, from an {@link ExternalSyncConfig}. Merges `url`, the
 * preferred `adapterConfig` map, and the legacy `extraFields` (without
 * overriding keys already set by `adapterConfig`).
 *
 * Shared by {@link ExternalSyncManager.initialize} and
 * {@link validateExternalSyncConfig} so validation done ahead of time (e.g. in
 * the backend create/update endpoints) matches what `initialize` will check —
 * preventing drift between the two call sites.
 */
export function buildAdapterConfig(config: ExternalSyncConfig): Record<string, unknown> {
  const adapterConfig: Record<string, unknown> = {
    url: config.url,
    ...config.adapterConfig,
  };
  if (config.extraFields) {
    for (const field of config.extraFields) {
      if (!(field.name in adapterConfig)) {
        adapterConfig[field.name] = field.value;
      }
    }
  }
  return adapterConfig;
}

/**
 * Result of {@link validateExternalSyncConfig}. `message` is populated only
 * when `valid` is false. Kept as a single shape (rather than a discriminated
 * union) so consumers can read `message` after a `!valid` check without relying
 * on control-flow narrowing — some toolchains compiling this shared source
 * (e.g. the mobile app's `vue-tsc`) do not narrow the union on negation.
 */
export interface ExternalSyncConfigValidation {
  valid: boolean;
  message?: string;
}

/**
 * Validate an {@link ExternalSyncConfig} against the target adapter's schema
 * WITHOUT instantiating stores or opening connections — safe to call before
 * persisting a config.
 *
 * Mirrors the validation branch of {@link ExternalSyncManager.initialize}:
 * - Unknown / legacy adapter types (not in the V2 registry) are treated as
 *   valid here; `initialize` only logs "external sync disabled" for them and
 *   does not throw.
 * - V2 adapters with a `configSchema` are validated against the assembled
 *   adapter config (see {@link buildAdapterConfig}).
 *
 * @returns `{ valid: true }` or `{ valid: false, message }` with the schema error.
 */
export function validateExternalSyncConfig(
  config: ExternalSyncConfig,
): ExternalSyncConfigValidation {
  if (!adapterRegistry.has(config.type)) {
    return { valid: true };
  }
  const descriptor = adapterRegistry.describe(config.type);
  if (!descriptor.configSchema || typeof descriptor.configSchema.safeParse !== "function") {
    return { valid: true };
  }
  const result = descriptor.configSchema.safeParse(buildAdapterConfig(config));
  if (result.success) {
    return { valid: true };
  }
  return {
    valid: false,
    message: `Invalid config for adapter "${config.type}": ${result.error.message}`,
  };
}

/**
 * Error thrown when a sync is requested while another is already in progress.
 */
export class SyncAlreadyInProgressError extends Error {
  constructor() {
    super("External sync already in progress");
    this.name = "SyncAlreadyInProgressError";
  }
}

const log = createLogger("ExternalSyncManager");

/**
 * Manages synchronization with external third-party systems using pluggable adapters.
 *
 * This class provides a unified interface for syncing DataCollect data with various
 * external systems (e.g., OpenSPP, custom APIs) by utilizing a Strategy pattern
 * with pluggable adapters.
 *
 * Key features:
 * - **Pluggable Adapters**: Support for multiple external systems via adapter pattern.
 * - **V1/V2 Compatibility**: Supports both legacy ExternalSyncAdapter and ExternalSyncAdapterV2.
 * - **AdapterRegistry Integration**: Uses the centralized AdapterRegistry for V2 adapters.
 * - **Dynamic Loading**: Adapters are instantiated based on configuration type.
 * - **Credential Management**: Secure handling of authentication credentials.
 * - **Health Checks**: Validate connectivity before sync operations.
 * - **Structured Results**: Returns SyncResult from sync operations.
 * - **Config Validation**: Validates config against adapter's Zod schema (V2 adapters).
 *
 * Architecture:
 * - Uses Strategy pattern for different external system integrations.
 * - V2 adapters are resolved from the AdapterRegistry first.
 * - Falls back to legacy adapter registries (built-in and runtime) for backwards compatibility.
 * - Each adapter implements ExternalSyncAdapterV2 (or is wrapped via LegacyAdapterWrapper).
 * - Configuration determines which adapter to instantiate and how to configure it.
 *
 * @example
 * Basic usage with a V2 adapter (mock registry server):
 * ```typescript
 * const config: ExternalSyncConfig = {
 *   type: 'mock',
 *   url: 'http://localhost:9999',
 *   adapterConfig: {
 *     clientId: 'mock-client',
 *     clientSecret: 'mock-secret',
 *   },
 * };
 *
 * const externalSync = new ExternalSyncManager(
 *   eventStore,
 *   eventApplierService,
 *   config
 * );
 *
 * await externalSync.initialize();
 * const result = await externalSync.synchronize();
 * console.log(`Pulled ${result.pulled}, pushed ${result.pushed}`);
 * ```
 */
export class ExternalSyncManager {
  private adapter: ExternalSyncAdapter | null = null;
  private v2Adapter: ExternalSyncAdapterV2 | null = null;
  private _isSyncing = false;

  /**
   * Creates a new ExternalSyncManager instance.
   *
   * @param eventStore Store for managing events and audit logs.
   * @param eventApplierService Service for applying events to entities.
   * @param config Configuration object specifying the external system type and settings.
   *
   * @example
   * ```typescript
   * const config: ExternalSyncConfig = {
   *   type: 'openspp',
   *   url: 'http://openspp.example.com',
   *   database: 'openspp_production',
   *   timeout: 60000
   * };
   *
   * const manager = new ExternalSyncManager(
   *   eventStore,
   *   eventApplierService,
   *   config
   * );
   * ```
   */
  constructor(
    private eventStore: EventStore,
    private eventApplierService: EventApplierService,
    private config: ExternalSyncConfig,
  ) {}

  /**
   * Registers an external adapter class for a given type identifier.
   *
   * Call this at application startup to make adapters from external packages
   * (e.g., @idpass/adapter-openspp, @idpass/adapter-openfn) available to the manager.
   *
   * @param type The adapter type string used in ExternalSyncConfig.type
   * @param adapterClass The adapter constructor to register
   *
   * @example
   * ```typescript
   * import { OpenSppV2SyncAdapter } from '@idpass/adapter-openspp';
   * import { OpenFnSyncAdapter } from '@idpass/adapter-openfn';
   *
   * ExternalSyncManager.registerAdapter('openspp-v2-adapter', OpenSppV2SyncAdapter);
   * ExternalSyncManager.registerAdapter('openfn-adapter', OpenFnSyncAdapter);
   * ```
   */
  static registerAdapter(type: string, adapterClass: LegacyAdapterConstructor): void {
    legacyAdapterRegistry[type] = adapterClass;
  }

  /**
   * Initializes the external sync manager by instantiating the appropriate adapter.
   *
   * Resolution order:
   * 1. Check AdapterRegistry for V2 adapters (preferred)
   * 2. Check built-in legacy adapter registry
   * 3. Check runtime legacy adapter registry
   *
   * For V2 adapters, the config is validated against the adapter's Zod schema
   * and the adapter is initialized with the validated config.
   *
   * This method must be called before attempting synchronization.
   *
   * @returns A Promise that resolves when the adapter is initialized.
   * @throws {Error} When adapter instantiation or config validation fails.
   *
   * @example
   * ```typescript
   * const manager = new ExternalSyncManager(eventStore, eventApplierService, config);
   *
   * await manager.initialize();
   *
   * // Check if adapter was successfully loaded
   * if (manager.isInitialized()) {
   *   await manager.synchronize();
   * } else {
   *   console.log('No adapter available for type:', config.type);
   * }
   * ```
   */
  async initialize() {
    // Try V2 adapter registry first
    if (adapterRegistry.has(this.config.type)) {
      const v2 = adapterRegistry.create(this.config.type, {
        eventStore: this.eventStore,
        eventApplierService: this.eventApplierService,
        syncConfig: this.config,
      });
      // Build the adapter config and validate it against the adapter's Zod
      // schema. Both steps are shared with `validateExternalSyncConfig` so an
      // ahead-of-time check (e.g. the backend create/update endpoints) rejects
      // exactly what `initialize` would reject here.
      const adapterConfig = buildAdapterConfig(this.config);
      const validation = validateExternalSyncConfig(this.config);
      if (!validation.valid) {
        throw new Error(validation.message);
      }

      await v2.initialize(adapterConfig);
      this.v2Adapter = v2;
      log.info({ type: this.config.type }, "V2 adapter initialized");
      return;
    }

    // Fall back to legacy adapter registries
    const adapterModule = legacyAdapterRegistry[this.config.type];

    if (!adapterModule) {
      log.warn(
        { type: this.config.type, registered: Object.keys(legacyAdapterRegistry) },
        "No adapter registered for type; external sync disabled",
      );
      return;
    }

    this.adapter = new adapterModule(this.eventStore, this.eventApplierService, this.config);
  }

  /**
   * Performs synchronization with the external system using the configured adapter.
   *
   * For V2 adapters, returns a combined SyncResult with push and pull counts.
   * For legacy adapters, returns a SyncResult wrapping the push/pull operations.
   *
   * @param credentials Optional authentication credentials for the external system.
   * @returns A SyncResult with counts and any errors from the sync operation.
   * @throws {Error} When adapter is not initialized or sync operation fails.
   *
   * @example
   * ```typescript
   * // Simple sync without credentials (if adapter doesn't require them)
   * const result = await manager.synchronize();
   * console.log(`Pushed: ${result.pushed}, Pulled: ${result.pulled}`);
   *
   * // Sync with basic authentication
   * const result = await manager.synchronize({
   *   username: 'integration_user',
   *   password: 'secure_password'
   * });
   * ```
   */
  async synchronize(credentials?: ExternalSyncCredentials, options?: SyncOptions): Promise<SyncResult> {
    if (this._isSyncing) {
      throw new SyncAlreadyInProgressError();
    }
    this._isSyncing = true;
    try {
      return await this.performSync(credentials, options);
    } finally {
      this._isSyncing = false;
    }
  }

  /**
   * Whether an external sync is currently in progress.
   */
  get isSyncing(): boolean {
    return this._isSyncing;
  }

  /**
   * Internal sync implementation.
   * @private
   */
  private async performSync(credentials?: ExternalSyncCredentials, options?: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();

    // Use V2 adapter if available
    if (this.v2Adapter) {
      log.info("SYNC_STARTED");

      // Pull first so remote changes are ingested before local data is pushed,
      // preventing stale local data from overwriting newer remote edits.
      options?.onProgress?.({ phase: 'pulling', pushed: 0, pulled: 0, failed: 0, skipped: 0 });
      const since = await this.eventStore.getLastPullExternalSyncTimestamp();
      const pullResult = await this.v2Adapter.pull(since || undefined);

      // Advance the pull watermark whenever no records failed. Skipped records
      // are, by definition, not retryable (malformed response, missing required
      // fields, etc.) — advancing over them prevents a livelock where every
      // subsequent sync re-fetches the same batch and skips the same record
      // forever. On a fresh first sync that pulled nothing, keep the watermark
      // at the epoch so the second sync will do a full sweep.
      if (pullResult.failed === 0 && (pullResult.pulled > 0 || since)) {
        await this.eventStore.setLastPullExternalSyncTimestamp(new Date().toISOString());
      }

      if (options?.signal?.aborted) {
        const error = new Error('Sync cancelled');
        error.name = 'AbortError';
        throw error;
      }

      // The adapter manages its own push delta via getModifiedEntitiesSince
      options?.onProgress?.({ phase: 'pushing', pushed: 0, pulled: pullResult.pulled, failed: pullResult.failed, skipped: pullResult.skipped });
      const pushResult = await this.v2Adapter.push([]);

      return {
        success: pushResult.success && pullResult.success,
        pushed: pushResult.pushed,
        pulled: pullResult.pulled,
        failed: pushResult.failed + pullResult.failed,
        skipped: pushResult.skipped + pullResult.skipped,
        errors: [...pushResult.errors, ...pullResult.errors],
        duration: Date.now() - startTime,
      };
    }

    // Fall back to legacy adapter
    if (!this.adapter) {
      throw new Error("Adapter not initialized");
    }
    if (this.adapter.authenticate) {
      const isAuthenticated = await this.adapter.authenticate(credentials);
      if (!isAuthenticated) {
        throw new Error("External authentication failed");
      }
    }

    log.info("SYNC_STARTED");

    const wrapper = new LegacyAdapterWrapper(this.adapter, this.config.type);

    // Pull first for legacy adapters too
    options?.onProgress?.({ phase: 'pulling', pushed: 0, pulled: 0, failed: 0, skipped: 0 });
    const pullResult = await wrapper.pull();

    if (options?.signal?.aborted) {
      const error = new Error('Sync cancelled');
      error.name = 'AbortError';
      throw error;
    }

    const entityPayloads = await this.gatherEntityPayloads();
    options?.onProgress?.({ phase: 'pushing', pushed: 0, pulled: pullResult.pulled, failed: pullResult.failed, skipped: pullResult.skipped });
    const pushResult = await wrapper.push(entityPayloads);

    const combinedResult: SyncResult = {
      success: pushResult.success && pullResult.success,
      pushed: pushResult.pushed,
      pulled: pullResult.pulled,
      failed: pushResult.failed + pullResult.failed,
      skipped: pushResult.skipped + pullResult.skipped,
      errors: [...pushResult.errors, ...pullResult.errors],
      duration: Date.now() - startTime,
    };

    if (!pushResult.success || !pullResult.success) {
      // Also use the legacy fallback for sync() method
      if (typeof this.adapter.sync === "function" && !pushResult.success && !pullResult.success) {
        try {
          await this.adapter.sync(credentials);
          combinedResult.success = true;
          combinedResult.errors = [];
          combinedResult.failed = 0;
        } catch {
          // Keep the original errors
        }
      }
    }

    return combinedResult;
  }

  /**
   * Checks connectivity and health of the external system.
   *
   * For V2 adapters, delegates to the adapter's healthCheck() method.
   * For legacy adapters, returns a basic result indicating that health checks
   * are not supported.
   *
   * @returns A HealthCheckResult with status and optional latency/message.
   * @throws {Error} When adapter is not initialized.
   *
   * @example
   * ```typescript
   * const health = await manager.healthCheck();
   * if (health.healthy) {
   *   console.log(`External system is reachable (latency: ${health.latency}ms)`);
   * } else {
   *   console.error(`External system is down: ${health.message}`);
   * }
   * ```
   */
  async healthCheck(): Promise<HealthCheckResult> {
    if (this.v2Adapter) {
      return this.v2Adapter.healthCheck();
    }

    if (this.adapter) {
      return { healthy: true, message: "Legacy adapter (health check not supported)" };
    }

    return { healthy: false, message: "Adapter not initialized" };
  }

  /**
   * Checks if the external sync manager has been properly initialized with an adapter.
   *
   * @returns `true` if an adapter is loaded and ready for synchronization, `false` otherwise.
   *
   * @example
   * ```typescript
   * const manager = new ExternalSyncManager(eventStore, eventApplierService, config);
   * await manager.initialize();
   *
   * if (manager.isInitialized()) {
   *   console.log('Ready for external sync');
   * } else {
   *   console.log('No adapter available for:', config.type);
   * }
   * ```
   */
  isInitialized(): boolean {
    return this.adapter !== null || this.v2Adapter !== null;
  }

  /**
   * Gathers entities from the entity store and transforms them into push payloads
   * for the external system.
   *
   * @returns Array of entity push payloads ready for the adapter's push() method.
   * @private
   */
  private async gatherEntityPayloads(): Promise<EntityPushPayload[]> {
    const entityStore = this.eventApplierService.getEntityStore();
    const allEntities = await entityStore.getAllEntities();

    return allEntities.map((pair) => ({
      guid: pair.guid,
      type: pair.modified.type,
      data: this.stripInternalFields(pair.modified.data as Record<string, unknown>),
      version: pair.modified.version,
    }));
  }

  private stripInternalFields(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (!key.startsWith("_")) {
        result[key] = value;
      }
    }
    return result;
  }
}
