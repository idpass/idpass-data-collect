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
import MockSyncServerAdapter from "../services/MockSyncServerAdapter";
import { adapterRegistry } from "./AdapterRegistry";
import { createLogger } from "../utils/logger";

const log = createLogger("ExternalSyncManager");

/**
 * Constructor type for ExternalSyncAdapter implementations.
 */
type AdapterConstructor = new (
  eventStore: EventStore,
  eventApplierService: EventApplierService,
  config: ExternalSyncConfig,
) => ExternalSyncAdapter;

/**
 * Built-in adapter registry. Contains only adapters that are bundled with the core package.
 *
 * External adapters (OpenSPP, OpenFn) are registered at application startup using
 * ExternalSyncManager.registerAdapter() to avoid circular dependencies between packages.
 *
 * Adapter types:
 * - mock-sync-server: Mock adapter for testing
 */
const builtInAdaptersMapping: Record<string, AdapterConstructor> = {
  "mock-sync-server": MockSyncServerAdapter as unknown as AdapterConstructor,
};

/**
 * Runtime adapter registry. External adapters are registered here at application startup.
 * Keys are adapter type strings (e.g., "openspp-v2-adapter", "openfn-adapter").
 */
const runtimeAdapterRegistry: Record<string, AdapterConstructor> = {};

/**
 * Creates an empty SyncResult with the given duration.
 */
function emptySyncResult(duration: number): SyncResult {
  return {
    success: true,
    pushed: 0,
    pulled: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    duration,
  };
}

/**
 * Wraps a legacy ExternalSyncAdapter (V1) in the ExternalSyncAdapterV2 interface.
 *
 * This enables the ExternalSyncManager to work uniformly with both old and
 * adapters while the codebase transitions to the V2 interface.
 */
class LegacyAdapterWrapper implements ExternalSyncAdapterV2 {
  constructor(
    private legacyAdapter: ExternalSyncAdapter,
    private adapterType: string,
  ) {}

  descriptor() {
    return {
      type: this.adapterType,
      version: "1.0.0",
      capabilities: ["push" as const, "pull" as const],
      configSchema: {} as never, // Legacy adapters do not have a Zod schema
    };
  }

  async initialize(_config: Record<string, unknown>): Promise<void> {
    // Legacy adapters are initialized via their constructor; nothing to do here
  }

  async healthCheck(): Promise<HealthCheckResult> {
    // Legacy adapters do not support health checks; assume healthy if initialized
    return { healthy: true, message: "Legacy adapter (health check not supported)" };
  }

  async push(_entities: EntityPushPayload[]): Promise<SyncResult> {
    const startTime = Date.now();
    try {
      if (typeof this.legacyAdapter.pushData === "function") {
        await this.legacyAdapter.pushData();
      }
      return emptySyncResult(Date.now() - startTime);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        failed: 1,
        skipped: 0,
        errors: [{ code: "PUSH_FAILED", message, retryable: true }],
        duration: Date.now() - startTime,
      };
    }
  }

  async pull(_since?: string): Promise<SyncResult> {
    const startTime = Date.now();
    try {
      if (typeof this.legacyAdapter.pullData === "function") {
        await this.legacyAdapter.pullData();
      }
      return emptySyncResult(Date.now() - startTime);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        failed: 1,
        skipped: 0,
        errors: [{ code: "PULL_FAILED", message, retryable: true }],
        duration: Date.now() - startTime,
      };
    }
  }

  async disconnect(): Promise<void> {
    // Legacy adapters do not have a disconnect method
  }

  /**
   * Exposes the wrapped legacy adapter for authentication.
   */
  getLegacyAdapter(): ExternalSyncAdapter {
    return this.legacyAdapter;
  }
}

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
 * Basic usage with mock adapter:
 * ```typescript
 * const config: ExternalSyncConfig = {
 *   type: 'mock-sync-server',
 *   url: 'http://mock.example.com',
 *   timeout: 30000
 * };
 *
 * const externalSync = new ExternalSyncManager(
 *   eventStore,
 *   eventApplierService,
 *   config
 * );
 *
 * await externalSync.initialize();
 * await externalSync.synchronize();
 * ```
 *
 * @example
 * With authentication credentials:
 * ```typescript
 * const credentials: ExternalSyncCredentials = {
 *   username: 'sync_user',
 *   password: 'secure_password'
 * };
 *
 * await externalSync.synchronize(credentials);
 * ```
 *
 * @example
 * Custom adapter registration:
 * ```typescript
 * // In adaptersMapping (requires code modification):
 * const adaptersMapping = {
 *   "mock-sync-server": MockSyncServerAdapter,
 *   "openspp": OpenSppSyncAdapter,
 *   "custom-api": CustomApiSyncAdapter
 * };
 *
 * // Then use with config:
 * const opensppConfig: ExternalSyncConfig = {
 *   type: 'openspp',
 *   url: 'http://openspp.example.com',
 *   database: 'openspp_db'
 * };
 * ```
 */
export class ExternalSyncManager {
  private adapter: ExternalSyncAdapter | null = null;
  private v2Adapter: ExternalSyncAdapterV2 | null = null;

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
  static registerAdapter(type: string, adapterClass: AdapterConstructor): void {
    runtimeAdapterRegistry[type] = adapterClass;
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
      const v2 = adapterRegistry.create(this.config.type);
      const descriptor = v2.descriptor();

      // Build config object from ExternalSyncConfig for validation
      const adapterConfig: Record<string, unknown> = {
        url: this.config.url,
        ...this.config.adapterConfig,
      };

      // Add extra fields to config for backwards compatibility
      if (this.config.extraFields) {
        for (const field of this.config.extraFields) {
          if (!(field.name in adapterConfig)) {
            adapterConfig[field.name] = field.value;
          }
        }
      }

      // Validate config against the adapter's Zod schema
      if (descriptor.configSchema && typeof descriptor.configSchema.safeParse === "function") {
        const validation = descriptor.configSchema.safeParse(adapterConfig);
        if (!validation.success) {
          throw new Error(
            `Invalid config for adapter "${this.config.type}": ${validation.error.message}`,
          );
        }
      }

      await v2.initialize(adapterConfig);
      this.v2Adapter = v2;
      log.info({ type: this.config.type }, "V2 adapter initialized");
      return;
    }

    // Fall back to legacy adapter registries
    const adapterModule =
      builtInAdaptersMapping[this.config.type] ??
      runtimeAdapterRegistry[this.config.type];

    if (!adapterModule) {
      log.warn(
        { type: this.config.type, builtIn: Object.keys(builtInAdaptersMapping), runtime: Object.keys(runtimeAdapterRegistry) },
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
  async synchronize(credentials?: ExternalSyncCredentials): Promise<SyncResult> {
    const startTime = Date.now();

    // Gather entities from the entity store to push to the external system
    const entityPayloads = await this.gatherEntityPayloads();

    // Use V2 adapter if available
    if (this.v2Adapter) {
      log.info("SYNC_STARTED (V2)");

      const pushResult = await this.v2Adapter.push(entityPayloads);
      const pullResult = await this.v2Adapter.pull();

      const combinedResult: SyncResult = {
        success: pushResult.success && pullResult.success,
        pushed: pushResult.pushed,
        pulled: pullResult.pulled,
        failed: pushResult.failed + pullResult.failed,
        skipped: pushResult.skipped + pullResult.skipped,
        errors: [...pushResult.errors, ...pullResult.errors],
        duration: Date.now() - startTime,
      };

      log.info("SYNC_COMPLETED (V2)");
      return combinedResult;
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

    const pushResult = await wrapper.push(entityPayloads);
    const pullResult = await wrapper.pull();

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
        } catch (error) {
          // Keep the original errors
        }
      }
    }

    log.info("SYNC_COMPLETED");
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
      data: pair.modified.data as Record<string, unknown>,
      version: pair.modified.version,
    }));
  }
}
