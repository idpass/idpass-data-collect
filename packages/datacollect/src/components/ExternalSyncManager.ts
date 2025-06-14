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
import { EventApplierService } from "../services/EventApplierService";
import MockSyncServerAdapter from "../services/MockSyncServerAdapter";
import OpenFnSyncAdapter from "./openfn/OpenFnSyncAdapter";

/**
 * Registry of available external sync adapters mapped by their type identifiers.
 *
 * Add new adapters here to make them available for external synchronization.
 */
const adaptersMapping = {
  "mock-sync-server": MockSyncServerAdapter,
  "openfn-adapter": OpenFnSyncAdapter,
};

/**
 * Manages synchronization with external third-party systems using pluggable adapters.
 *
 * The ExternalSyncManager provides a unified interface for syncing DataCollect data
 * with various external systems like OpenSPP, SCOPE, or custom APIs. It uses the
 * Strategy pattern with pluggable adapters to handle system-specific integration logic.
 *
 * Key features:
 * - **Pluggable Adapters**: Support for multiple external systems via adapter pattern
 * - **Dynamic Loading**: Adapters are instantiated based on configuration type
 * - **Credential Management**: Secure handling of authentication credentials
 * - **Error Handling**: Graceful handling of adapter initialization and sync failures
 * - **Configuration-Driven**: Flexible configuration per external system
 *
 * Architecture:
 * - Uses Strategy pattern for different external system integrations
 * - Adapters are registered in the adaptersMapping registry
 * - Each adapter implements the ExternalSyncAdapter interface
 * - Configuration determines which adapter to instantiate and how to configure it
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

  /**
   * Creates a new ExternalSyncManager instance.
   *
   * @param eventStore - Store for managing events and audit logs
   * @param eventApplierService - Service for applying events to entities
   * @param config - Configuration object specifying the external system type and settings
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
   * Initializes the external sync manager by instantiating the appropriate adapter.
   *
   * Looks up the adapter class based on the configuration type and creates an instance
   * with the provided dependencies. If the adapter type is not found in the registry,
   * the manager remains uninitialized (adapter will be null).
   *
   * This method must be called before attempting synchronization.
   *
   * @throws {Error} When adapter instantiation fails
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
    const adapterModule = adaptersMapping[this.config.type as keyof typeof adaptersMapping];

    if (!adapterModule) {
      return;
    }

    // @ts-expect-error - config is typed as ExternalSyncConfig but narrowed depending on the adapter
    this.adapter = new adapterModule(this.eventStore, this.eventApplierService, this.config);
  }

  /**
   * Performs synchronization with the external system using the configured adapter.
   *
   * Delegates the actual sync operation to the loaded adapter, which handles the
   * system-specific integration logic. The sync operation typically involves:
   * - Pulling data from the external system
   * - Transforming data to DataCollect format
   * - Applying changes using the EventApplierService
   * - Optionally pushing local changes to the external system
   *
   * @param credentials - Optional authentication credentials for the external system
   * @throws {Error} When adapter is not initialized or sync operation fails
   *
   * @example
   * ```typescript
   * // Simple sync without credentials (if adapter doesn't require them)
   * await manager.synchronize();
   *
   * // Sync with basic authentication
   * await manager.synchronize({
   *   username: 'integration_user',
   *   password: 'secure_password'
   * });
   * ```
   *
   * @example
   * Error handling:
   * ```typescript
   * try {
   *   await manager.synchronize(credentials);
   *   console.log('External sync completed successfully');
   * } catch (error) {
   *   if (error.message === 'Adapter not initialized') {
   *     console.log('Please call initialize() first');
   *   } else {
   *     console.error('External sync failed:', error.message);
   *   }
   * }
   * ```
   */
  async synchronize(credentials?: ExternalSyncCredentials) {
    if (!this.adapter) {
      throw new Error("Adapter not initialized");
    }
    await this.adapter.sync(credentials);
  }

  /**
   * Checks if the external sync manager has been properly initialized with an adapter.
   *
   * @returns True if an adapter is loaded and ready for synchronization
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
    return this.adapter !== null;
  }
}
