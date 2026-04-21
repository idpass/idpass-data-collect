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

import axios from "axios";
import { z } from "zod";
import type {
  ExternalSyncAdapterV2,
  AdapterDescriptor,
  HealthCheckResult,
  SyncResult,
  SyncError,
  EntityPushPayload,
} from "@idpass/data-collect-core";
import type {
  EventStore,
} from "@idpass/data-collect-core";
import {
  SyncLevel,
} from "@idpass/data-collect-core";
import { EventApplierService } from "@idpass/data-collect-core";
import { convertPulledDataToEvents } from "./shared";

/**
 * Zod config schema for the OpenFn adapter.
 */
const openFnConfigSchema = z.object({
  url: z.string().min(1),
  apiKey: z.string().min(1),
  callbackToken: z.string().optional(),
  batchSize: z.union([z.number(), z.string().transform(Number)]).optional(),
});

/**
 * OpenFn sync adapter implementing the ExternalSyncAdapterV2 interface.
 *
 * Wraps the existing OpenFn webhook-based integration with the standardized
 * V2 adapter contract, providing config validation, health checks, and
 * structured sync results.
 */
export class OpenFnSyncAdapterV2 implements ExternalSyncAdapterV2 {
  private config: z.infer<typeof openFnConfigSchema> | null = null;

  constructor(
    private readonly eventStore: EventStore,
    private readonly eventApplierService: EventApplierService,
  ) {}

  descriptor(): AdapterDescriptor {
    return {
      type: "openfn",
      version: "2.0.0",
      capabilities: ["push", "pull"],
      configSchema: openFnConfigSchema,
    };
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    const result = openFnConfigSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Invalid OpenFn config: ${result.error.message}`);
    }
    this.config = result.data;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.config) {
      return { healthy: false, message: "Not initialized" };
    }

    const startTime = Date.now();
    try {
      // Attempt a lightweight GET request to check connectivity
      await axios.get(this.config.url, {
        headers: { "X-Api-Key": this.config.apiKey },
        timeout: 10000,
      });
      const latency = Date.now() - startTime;
      return { healthy: true, latency, message: "Connected to OpenFn" };
    } catch (error) {
      const latency = Date.now() - startTime;
      // A 4xx response still means the server is reachable
      if (axios.isAxiosError(error) && error.response) {
        return { healthy: true, latency, message: `Reachable (HTTP ${error.response.status})` };
      }
      const message = error instanceof Error ? error.message : String(error);
      return { healthy: false, latency, message };
    }
  }

  async push(entities: EntityPushPayload[]): Promise<SyncResult> {
    const startTime = Date.now();

    if (!this.config) {
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

    if (entities.length === 0) {
      // When called with empty entities, push events since last sync (like legacy adapter)
      return this.pushEventsSinceLastSync(startTime);
    }

    const batchSize = this.config.batchSize ?? 100;
    let successCount = 0;
    let failedCount = 0;
    const errors: SyncError[] = [];

    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);

      try {
        await axios.post(
          this.config.url,
          { entities: batch },
          {
            headers: { "X-Api-Key": this.config.apiKey },
          },
        );
        successCount += batch.length;
      } catch (error) {
        failedCount += batch.length;
        const message = error instanceof Error ? error.message : String(error);
        errors.push({
          code: "PUSH_BATCH_FAILED",
          message,
          retryable: true,
        });
      }
    }

    return {
      success: failedCount === 0,
      pushed: successCount,
      pulled: 0,
      failed: failedCount,
      skipped: 0,
      errors,
      duration: Date.now() - startTime,
    };
  }

  async pull(since?: string): Promise<SyncResult> {
    const startTime = Date.now();

    if (!this.config) {
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

    let pulledCount = 0;
    let failedCount = 0;
    const errors: SyncError[] = [];

    try {
      const lastPullTimestamp = since ?? await this.eventStore.getLastPullExternalSyncTimestamp();

      const headers: Record<string, string> = {};
      if (this.config.apiKey) {
        headers["X-Api-Key"] = this.config.apiKey;
      }
      if (this.config.callbackToken) {
        headers["X-Callback-Token"] = this.config.callbackToken;
      }

      const params: Record<string, string> = {};
      if (lastPullTimestamp) {
        params.since = lastPullTimestamp;
      }

      const response = await axios.get(this.config.url, { params, headers });
      const events = convertPulledDataToEvents(response.data);

      if (events.length === 0) {
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

      const sortedEvents = events.sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

      for (const event of sortedEvents) {
        try {
          event.syncLevel = SyncLevel.REMOTE;
          await this.eventApplierService.submitForm(event);
          pulledCount++;
        } catch (error) {
          failedCount++;
          const message = error instanceof Error ? error.message : String(error);
          errors.push({
            entityGuid: event.entityGuid,
            code: "PULL_APPLY_FAILED",
            message,
            retryable: false,
          });
        }
      }

      const latestEventTimestamp = sortedEvents[sortedEvents.length - 1].timestamp;
      if (latestEventTimestamp) {
        await this.eventStore.setLastPullExternalSyncTimestamp(latestEventTimestamp);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ code: "PULL_FETCH_FAILED", message, retryable: true });
      return {
        success: false,
        pushed: 0,
        pulled: pulledCount,
        failed: failedCount + 1,
        skipped: 0,
        errors,
        duration: Date.now() - startTime,
      };
    }

    return {
      success: failedCount === 0,
      pushed: 0,
      pulled: pulledCount,
      failed: failedCount,
      skipped: 0,
      errors,
      duration: Date.now() - startTime,
    };
  }

  async disconnect(): Promise<void> {
    this.config = null;
  }

  /**
   * Push events since the last external sync timestamp (mirrors legacy behavior).
   */
  private async pushEventsSinceLastSync(startTime: number): Promise<SyncResult> {
    const errors: SyncError[] = [];

    try {
      const lastPushTimestamp = await this.eventStore.getLastPushExternalSyncTimestamp();
      const eventsToPush = await this.eventStore.getEventsSince(lastPushTimestamp);

      if (eventsToPush.length === 0) {
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

      const batchSize = this.config!.batchSize ?? 100;
      let successCount = 0;

      for (let i = 0; i < eventsToPush.length; i += batchSize) {
        const batch = eventsToPush.slice(i, i + batchSize);

        await axios.post(
          this.config!.url,
          { entities: batch },
          {
            headers: { "X-Api-Key": this.config!.apiKey },
          },
        );

        successCount += batch.length;

        const latestTimestamp = batch.reduce(
          (latest, event) => (event.timestamp > latest ? event.timestamp : latest),
          "",
        );
        if (latestTimestamp) {
          await this.eventStore.setLastPushExternalSyncTimestamp(latestTimestamp);
        }
      }

      return {
        success: true,
        pushed: successCount,
        pulled: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ code: "PUSH_EVENTS_FAILED", message, retryable: true });
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        failed: 1,
        skipped: 0,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

}
