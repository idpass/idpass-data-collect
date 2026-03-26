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
  SyncError,
  EntityPushPayload,
} from "@idpass/data-collect-core";
import type {
  EventStore,
  ExternalSyncConfig,
} from "@idpass/data-collect-core";
import {
  getExternalField,
} from "@idpass/data-collect-core";
import { EventApplierService } from "@idpass/data-collect-core";
import OdooClient from "./OdooClient";
import { IndividualTransformer } from "./pullTransformers/IndividualTransformer";
import type { OdooConfig } from "./odoo-types";
import { parseOpenSppAdapterOptions } from "./OpenSppAdapterOptions";
import type { OpenSppAdapterOptions } from "./OpenSppAdapterOptions";
import {
  type FieldMapping,
  buildOpenSppPayload,
  resolveExternalIdFromEntity,
  saveExternalIdToEntity,
} from "./shared";

/**
 * Zod config schema for the OpenSPP adapter.
 */
const openSppConfigSchema = z.object({
  url: z.string().min(1),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  registrarGroup: z.string().optional(),
  batchSize: z.union([z.number(), z.string().transform(Number)]).optional(),
  batchDelayMs: z.union([z.number(), z.string().transform(Number)]).optional(),
  maxRetries: z.union([z.number(), z.string().transform(Number)]).optional(),
});

/**
 * OpenSPP sync adapter implementing the ExternalSyncAdapterV2 interface.
 *
 * Wraps the existing OpenSPP/Odoo JSON-RPC integration with the standardized
 * V2 adapter contract, providing config validation, health checks, and
 * structured sync results.
 */
export class OpenSppSyncAdapterV2 implements ExternalSyncAdapterV2 {
  private odooClient: InstanceType<typeof OdooClient> | null = null;
  private config: z.infer<typeof openSppConfigSchema> | null = null;
  private options: OpenSppAdapterOptions;
  private fieldMappings: FieldMapping[] = [];

  constructor(
    private eventStore: EventStore,
    private eventApplierService: EventApplierService,
    private externalSyncConfig: ExternalSyncConfig,
  ) {
    this.options = parseOpenSppAdapterOptions(externalSyncConfig);

    // Load field mappings from config
    const configWithMappings = externalSyncConfig as ExternalSyncConfig & { fieldMappings?: FieldMapping[] };
    if (configWithMappings.fieldMappings && Array.isArray(configWithMappings.fieldMappings)) {
      this.fieldMappings = configWithMappings.fieldMappings;
    } else {
      const mappingsJson = getExternalField(externalSyncConfig, "fieldMappings");
      if (mappingsJson) {
        try {
          this.fieldMappings = JSON.parse(mappingsJson) as FieldMapping[];
        } catch {
          this.fieldMappings = [];
        }
      }
    }
  }

  descriptor(): AdapterDescriptor {
    return {
      type: "openspp",
      version: "2.0.0",
      capabilities: ["push", "pull"],
      configSchema: openSppConfigSchema,
    };
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    const result = openSppConfigSchema.safeParse(config);
    if (!result.success) {
      throw new Error(`Invalid OpenSPP config: ${result.error.message}`);
    }

    this.config = result.data;

    const odooConfig: OdooConfig = {
      host: this.config.url,
      database: this.config.database,
      username: this.config.username,
      password: this.config.password,
      registrarGroup: this.config.registrarGroup,
    };

    this.odooClient = new OdooClient(odooConfig);
    await this.odooClient.login();
  }

  async healthCheck(): Promise<HealthCheckResult> {
    if (!this.odooClient) {
      return { healthy: false, message: "Not initialized" };
    }

    const startTime = Date.now();
    try {
      const isAuth = this.odooClient.isAuthenticated();
      const latency = Date.now() - startTime;
      return {
        healthy: isAuth,
        latency,
        message: isAuth ? "Connected to OpenSPP" : "Not authenticated",
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);
      return { healthy: false, latency, message };
    }
  }

  async push(entities: EntityPushPayload[]): Promise<SyncResult> {
    const startTime = Date.now();

    if (!this.odooClient || !this.config) {
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

    const batchSize = this.config.batchSize ?? 50;
    const batchDelayMs = this.config.batchDelayMs ?? 1000;
    const maxRetries = this.config.maxRetries ?? 2;

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const errors: SyncError[] = [];

    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);

      for (const entityPayload of batch) {
        if (entityPayload.type !== "individual") {
          skippedCount++;
          continue;
        }

        const externalId = await resolveExternalIdFromEntity(this.eventApplierService, entityPayload.guid);

        let attempt = 0;
        let success = false;

        while (attempt <= maxRetries && !success) {
          try {
            const payload = buildOpenSppPayload(this.fieldMappings, entityPayload.data);

            if (externalId) {
              await this.odooClient!.write("res.partner", [externalId], payload as unknown as Record<string, unknown>);
            } else {
              const createdId = await this.odooClient!.createIndividual(payload);
              if (createdId) {
                await saveExternalIdToEntity(this.eventApplierService, entityPayload.guid, createdId);
              }
            }

            success = true;
            successCount++;
          } catch (error) {
            attempt++;
            if (attempt > maxRetries) {
              failedCount++;
              const message = error instanceof Error ? error.message : String(error);
              errors.push({
                entityGuid: entityPayload.guid,
                code: "PUSH_FAILED",
                message,
                retryable: true,
              });
            } else {
              const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
              await new Promise(resolve => setTimeout(resolve, delayMs));
            }
          }
        }
      }

      // Delay between batches
      if (i + batchSize < entities.length && batchDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, batchDelayMs));
      }
    }

    return {
      success: failedCount === 0,
      pushed: successCount,
      pulled: 0,
      failed: failedCount,
      skipped: skippedCount,
      errors,
      duration: Date.now() - startTime,
    };
  }

  async pull(since?: string): Promise<SyncResult> {
    const startTime = Date.now();

    if (!this.odooClient || !this.config) {
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

    const entityStore = this.eventApplierService.getEntityStore();
    const transformer = new IndividualTransformer(this.options.individual, this.fieldMappings);

    let pulledCount = 0;
    let failedCount = 0;
    const errors: SyncError[] = [];

    try {
      const individuals = await this.odooClient.fetchIndividualsSince(since);

      for (const individual of individuals) {
        try {
          const existingEntity = individual.id
            ? await entityStore.getEntityByExternalId(String(individual.id))
            : null;

          const formSubmission = transformer.transform(
            individual,
            undefined,
            existingEntity?.guid,
          );

          await this.eventApplierService.submitForm(formSubmission);
          pulledCount++;
        } catch (error) {
          failedCount++;
          const message = error instanceof Error ? error.message : String(error);
          errors.push({
            entityGuid: individual.id ? String(individual.id) : undefined,
            code: "PULL_TRANSFORM_FAILED",
            message,
            retryable: false,
          });
        }
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
    this.odooClient = null;
    this.config = null;
  }

}
