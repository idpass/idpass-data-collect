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

import { z } from "zod";
import type {
  ExternalSyncAdapterV2,
  AdapterDescriptor,
  HealthCheckResult,
  SyncResult,
  EntityPushPayload,
} from "@idpass/data-collect-core";

/**
 * Zod config schema for the mock adapter.
 */
const mockConfigSchema = z.object({
  type: z.literal("mock"),
  latencyMs: z.number().optional(),
});

/**
 * Stored entity representation within the mock adapter's in-memory storage.
 */
interface StoredEntity {
  guid: string;
  type: string;
  data: Record<string, unknown>;
  version: number;
  pushedAt: string;
}

/**
 * Mock sync adapter implementing the ExternalSyncAdapterV2 interface.
 *
 * Stores pushed entities in memory and returns them on pull.
 * Useful for testing sync flows without any network dependency.
 */
export class MockSyncAdapterV2 implements ExternalSyncAdapterV2 {
  private config: z.infer<typeof mockConfigSchema> | null = null;
  private initialized = false;
  private storage: Map<string, StoredEntity> = new Map();

  descriptor(): AdapterDescriptor {
    return {
      type: "mock",
      version: "2.0.0",
      capabilities: ["push", "pull"],
      configSchema: mockConfigSchema,
    };
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    const result = mockConfigSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Invalid mock config: ${result.error.message}`);
    }

    this.config = result.data;
    this.initialized = true;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.initialized) {
      return { healthy: false, message: "Not initialized" };
    }

    const startTime = Date.now();
    if (this.config?.latencyMs) {
      await new Promise((resolve) => setTimeout(resolve, this.config!.latencyMs!));
    }
    const latency = Date.now() - startTime;

    return {
      healthy: true,
      latency,
      message: "Mock adapter healthy",
    };
  }

  async push(entities: EntityPushPayload[]): Promise<SyncResult> {
    const startTime = Date.now();

    if (!this.initialized || !this.config) {
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        failed: 0,
        skipped: 0,
        errors: [{ code: "NOT_INITIALIZED", message: "Adapter not initialized", retryable: false }],
        duration: Date.now() - startTime,
      };
    }

    if (this.config.latencyMs) {
      await new Promise((resolve) => setTimeout(resolve, this.config!.latencyMs!));
    }

    if (entities.length === 0) {
      return {
        success: true,
        pushed: 0,
        pulled: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        duration: Date.now() - startTime,
      };
    }

    let pushedCount = 0;
    for (const entity of entities) {
      this.storage.set(entity.guid, {
        guid: entity.guid,
        type: entity.type,
        data: { ...entity.data },
        version: entity.version,
        pushedAt: new Date().toISOString(),
      });
      pushedCount++;
    }

    return {
      success: true,
      pushed: pushedCount,
      pulled: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      duration: Date.now() - startTime,
    };
  }

  async pull(since?: string): Promise<SyncResult> {
    const startTime = Date.now();

    if (!this.initialized || !this.config) {
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        failed: 0,
        skipped: 0,
        errors: [{ code: "NOT_INITIALIZED", message: "Adapter not initialized", retryable: false }],
        duration: Date.now() - startTime,
      };
    }

    if (this.config.latencyMs) {
      await new Promise((resolve) => setTimeout(resolve, this.config!.latencyMs!));
    }

    let pulledCount = 0;
    for (const [, entity] of this.storage) {
      if (since && entity.pushedAt < since) {
        continue;
      }
      pulledCount++;
    }

    return {
      success: true,
      pushed: 0,
      pulled: pulledCount,
      failed: 0,
      skipped: 0,
      errors: [],
      duration: Date.now() - startTime,
    };
  }

  async disconnect(): Promise<void> {
    this.initialized = false;
    this.config = null;
  }

  /**
   * Returns the number of entities stored in memory.
   * Useful for test assertions.
   */
  getStoredEntityCount(): number {
    return this.storage.size;
  }

  /**
   * Returns a stored entity by GUID.
   * Useful for test assertions.
   */
  getStoredEntity(guid: string): StoredEntity | undefined {
    return this.storage.get(guid);
  }

  /**
   * Returns all stored entities.
   * Useful for test assertions.
   */
  getAllStoredEntities(): StoredEntity[] {
    return Array.from(this.storage.values());
  }

  /**
   * Clears all stored entities.
   * Useful for resetting test state between tests.
   */
  clearStorage(): void {
    this.storage.clear();
  }
}
