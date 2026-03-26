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

import type { ExternalSyncAdapterV2, AdapterDescriptor } from "../interfaces/adapter";
import type { EventStore, ExternalSyncConfig } from "../interfaces/types";
import type { EventApplierService } from "../services/EventApplierService";
import { createLogger } from "../utils/logger";

const log = createLogger("AdapterRegistry");

/**
 * Dependencies provided to adapter factories by ExternalSyncManager.
 */
export interface AdapterDeps {
  eventStore: EventStore;
  eventApplierService: EventApplierService;
  syncConfig: ExternalSyncConfig;
}

/**
 * Factory function type for creating adapter instances.
 * Receives optional dependencies for adapters that need access to stores.
 */
export type AdapterFactory = (deps?: AdapterDeps) => ExternalSyncAdapterV2;

/**
 * Registry for external sync adapters.
 *
 * Provides a centralized mechanism for registering, discovering, and
 * instantiating ExternalSyncAdapterV2 implementations. Each adapter
 * is registered with a type string and a factory function.
 *
 * @example
 * ```typescript
 * import { adapterRegistry } from "@idpass/data-collect-core";
 *
 * // Register an adapter
 * adapterRegistry.register("openspp", () => new OpenSppOdooSyncAdapter(eventStore, eventApplierService));
 *
 * // Create an instance
 * const adapter = adapterRegistry.create("openspp");
 * await adapter.initialize(config);
 * ```
 */
export class AdapterRegistry {
  private factories: Map<string, AdapterFactory> = new Map();
  private descriptorCache: Map<string, AdapterDescriptor> = new Map();

  /**
   * Register an adapter factory for a given type.
   *
   * @param type The adapter type string (e.g., "openspp", "openfn")
   * @param factory Factory function that creates a new adapter instance
   * @throws {Error} If type is empty or factory is not a function
   */
  register(type: string, factory: AdapterFactory): void {
    if (!type) {
      throw new Error("Adapter type must be a non-empty string");
    }
    if (typeof factory !== "function") {
      throw new Error("Adapter factory must be a function");
    }

    this.factories.set(type, factory);
    // Clear cached descriptor for this type since we have a new factory
    this.descriptorCache.delete(type);
    log.info({ type }, "Adapter registered");
  }

  /**
   * Create a new adapter instance for the given type.
   *
   * @param type The adapter type string
   * @returns A new ExternalSyncAdapterV2 instance
   * @throws {Error} If no factory is registered for the given type
   */
  create(type: string, deps?: AdapterDeps): ExternalSyncAdapterV2 {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error(
        `No adapter registered for type "${type}". ` +
        `Available types: ${this.types().join(", ") || "(none)"}`,
      );
    }
    return factory(deps);
  }

  /**
   * Check if an adapter factory is registered for the given type.
   *
   * @param type The adapter type string to check
   * @returns true if a factory is registered for this type
   */
  has(type: string): boolean {
    return this.factories.has(type);
  }

  /**
   * List all registered adapter types.
   *
   * @returns Array of registered type strings
   */
  types(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Get the descriptor for an adapter type without retaining the instance.
   *
   * Creates a temporary adapter instance to retrieve its descriptor,
   * then discards the instance. Results are cached to avoid repeated
   * instantiation.
   *
   * @param type The adapter type string
   * @returns The adapter's descriptor
   * @throws {Error} If no factory is registered for the given type
   */
  describe(type: string): AdapterDescriptor {
    const cached = this.descriptorCache.get(type);
    if (cached) {
      return cached;
    }

    const adapter = this.create(type);
    const descriptor = adapter.descriptor();
    this.descriptorCache.set(type, descriptor);
    return descriptor;
  }
}

/**
 * Singleton adapter registry instance.
 *
 * External adapter packages register their adapters at import time:
 * ```typescript
 * import { adapterRegistry } from "@idpass/data-collect-core";
 * adapterRegistry.register("openspp", () => new OpenSppOdooSyncAdapter(...));
 * ```
 */
export const adapterRegistry = new AdapterRegistry();
