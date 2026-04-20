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

/**
 * Legacy V1 adapter support.
 *
 * Supports adapters that implement the deprecated `ExternalSyncAdapter` (V1)
 * interface. Responsible for:
 * - Maintaining a registry of V1 adapter classes keyed by type string
 * - Wrapping V1 instances in the V2 `ExternalSyncAdapterV2` shape so the rest
 *   of the sync pipeline can treat them uniformly
 *
 * Kept as a separate module from `ExternalSyncManager` to keep that class
 * focused on orchestration. When all V1 adapters sunset (e.g. OpenSPP Odoo
 * drops from support), this module can be deleted in one move.
 */

import { EventStore, ExternalSyncAdapter, ExternalSyncConfig } from "../interfaces/types";
import type {
  ExternalSyncAdapterV2,
  SyncResult,
  HealthCheckResult,
  EntityPushPayload,
} from "../interfaces/adapter";
import { EventApplierService } from "../services/EventApplierService";

/**
 * Constructor type for V1 `ExternalSyncAdapter` implementations.
 */
export type LegacyAdapterConstructor = new (
  eventStore: EventStore,
  eventApplierService: EventApplierService,
  config: ExternalSyncConfig,
) => ExternalSyncAdapter;

/**
 * Registry of V1 adapter classes. External packages (e.g. `@idpass/adapter-openspp`,
 * `@idpass/adapter-openfn`) populate this registry at application startup via
 * `ExternalSyncManager.registerAdapter(type, adapterClass)`.
 *
 * The registry is module-scoped so it persists across ExternalSyncManager instances.
 */
export const legacyAdapterRegistry: Record<string, LegacyAdapterConstructor> = {};

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
 * This enables the ExternalSyncManager to work uniformly with both old and new
 * adapters while the codebase transitions to the V2 interface.
 *
 * **Limitation:** The wrapper always returns `pushed: 0, pulled: 0` in its
 * SyncResult because the legacy V1 adapter interface (`pushData`/`pullData`)
 * does not provide entity counts. This means monitoring dashboards and admin
 * UI will show zero counts for any adapter still using the V1 interface.
 */
export class LegacyAdapterWrapper implements ExternalSyncAdapterV2 {
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

  /**
   * Push entities via the legacy adapter.
   * Note: pushed/pulled counts are always 0 because the V1 adapter interface
   * does not provide per-entity counts. Monitoring/admin UI will show zero
   * counts for V1 adapters — this is a known limitation of the legacy wrapper.
   */
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
