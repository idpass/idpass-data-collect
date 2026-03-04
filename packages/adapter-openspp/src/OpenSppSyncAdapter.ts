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
  FormSubmission,
  SyncLevel,
  getExternalField,
  EntityType,
} from "@idpass/data-collect-core";
import { EventApplierService } from "@idpass/data-collect-core";
import OdooClient from "./OdooClient";
import { IndividualTransformer } from "./pullTransformers/IndividualTransformer";
import type { OdooConfig } from "./odoo-types";
import type { OpenSppAdapterOptions } from "./OpenSppAdapterOptions";
import { parseOpenSppAdapterOptions } from "./OpenSppAdapterOptions";
import {
  type FieldMapping,
  buildOpenSppPayload,
  resolveExternalIdFromEntity,
  saveExternalIdToEntity,
} from "./shared";

class OpenSppSyncAdapter implements ExternalSyncAdapter {
  private url: string;
  private odooClient: InstanceType<typeof OdooClient> | null = null;
  private options: OpenSppAdapterOptions;
  private readonly batchSize: number;
  private readonly batchDelayMs: number;
  private readonly maxRetries: number;

  constructor(
    private eventStore: EventStore,
    private eventApplierService: EventApplierService,
    private config: ExternalSyncConfig,
  ) {
    this.url = (this.config?.url as string | undefined) ?? "";
    this.options = parseOpenSppAdapterOptions(config);

    // Configure batch size (default: 50 entities per batch)
    const configuredBatchSize = this.getOptionalField("batchSize");
    this.batchSize = configuredBatchSize ? parseInt(configuredBatchSize, 10) || 50 : 50;

    // Configure delay between batches in milliseconds (default: 1000ms = 1 second)
    const configuredDelay = this.getOptionalField("batchDelayMs");
    this.batchDelayMs = configuredDelay ? parseInt(configuredDelay, 10) || 1000 : 1000;

    // Configure max retries for failed entities (default: 2)
    const configuredRetries = this.getOptionalField("maxRetries");
    this.maxRetries = configuredRetries ? parseInt(configuredRetries, 10) || 2 : 2;
  }

  async authenticate(credentials?: ExternalSyncCredentials): Promise<boolean> {
    try {
      await this.ensureClient(credentials);
      return true;
    } catch (error) {
      console.error("OpenSPP authentication error:", error);
      return false;
    }
  }

  async pushData(credentials?: ExternalSyncCredentials): Promise<void> {
    await this.ensureClient(credentials);

    const entityStore = this.eventApplierService.getEntityStore();

    // Get all individual entities that need to be synced
    // For now, we'll push entities that don't have an externalId set (new entities)
    // or entities that have been modified locally
    const allEntities = await entityStore.getAllEntities();

    const individualsToSync = allEntities.filter((pair) => {
      const entity = pair.modified;
      return (
        entity.type === EntityType.Individual &&
        entity.data.entityName === this.options.individual.entityName
      );
    });

    if (individualsToSync.length === 0) {
      console.log("No individuals to sync");
      return;
    }

    console.log(`Syncing ${individualsToSync.length} individuals in batches of ${this.batchSize}`);

    // Track statistics
    let successCount = 0;
    let failureCount = 0;
    const failedEntities: Array<{ guid: string; error: string }> = [];

    // Process entities in batches to avoid overwhelming the API
    for (let i = 0; i < individualsToSync.length; i += this.batchSize) {
      const batch = individualsToSync.slice(i, i + this.batchSize);
      const batchNumber = Math.floor(i / this.batchSize) + 1;
      const totalBatches = Math.ceil(individualsToSync.length / this.batchSize);

      console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} entities)`);

      // Process batch with retry logic
      for (const entityPair of batch) {
        const entity = entityPair.modified;
        const externalId = await resolveExternalIdFromEntity(this.eventApplierService, entity.guid);

        let attempt = 0;
        let lastError: Error | null = null;
        let success = false;

        while (attempt <= this.maxRetries && !success) {
          try {
            if (externalId) {
              // Entity exists in OpenSPP, update it
              await this.updateIndividualData({
                guid: entity.guid,
                entityGuid: entity.guid,
                type: "update-individual",
                data: entity.data,
                timestamp: entity.lastUpdated,
                userId: entity.guid,
                syncLevel: SyncLevel.LOCAL,
              });
            } else {
              // New entity, create it
              await this.createIndividualData({
                guid: entity.guid,
                entityGuid: entity.guid,
                type: "create-individual",
                data: entity.data,
                timestamp: entity.lastUpdated,
                userId: entity.guid,
                syncLevel: SyncLevel.LOCAL,
              });
            }
            success = true;
            successCount++;
          } catch (error) {
            attempt++;
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt <= this.maxRetries) {
              // Wait before retry (exponential backoff: 1s, 2s, 4s)
              const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
              console.warn(`Retry ${attempt}/${this.maxRetries} for entity ${entity.guid} after ${delayMs}ms`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
            } else {
              // Max retries exceeded
              failureCount++;
              const errorMessage = lastError.message || String(lastError);
              failedEntities.push({ guid: entity.guid, error: errorMessage });
              console.error(`Failed to sync individual ${entity.guid} after ${this.maxRetries} retries:`, lastError);
            }
          }
        }
      }

      // Add delay between batches to avoid rate limiting (except after the last batch)
      if (i + this.batchSize < individualsToSync.length && this.batchDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.batchDelayMs));
      }
    }

    // Log summary
    console.log(`Sync complete: ${successCount} succeeded, ${failureCount} failed`);
    if (failedEntities.length > 0) {
      console.error(`Failed entities (${failedEntities.length}):`, failedEntities.map(e => e.guid).join(", "));
      // Throw an error to alert the caller that some entities failed
      throw new Error(
        `Sync completed with ${failureCount} failures out of ${individualsToSync.length} entities. ` +
        `First failure: ${failedEntities[0]?.error || "Unknown error"}`
      );
    }
  }

  async pullData(): Promise<void> {
    await this.ensureClient();

    if (!this.odooClient) {
      throw new Error("OdooClient not initialized");
    }

    const entityStore = this.eventApplierService.getEntityStore();
    const fieldMappings = this.getFieldMappings();
    const transformer = new IndividualTransformer(this.options.individual, fieldMappings);

    // Fetch individuals modified since last sync (or all if first sync)
    const individuals = await this.odooClient.fetchIndividualsSince();

    for (const individual of individuals) {
      try {
        // Check if we already have this entity by externalId
        const existingEntity = individual.id
          ? await entityStore.getEntityByExternalId(String(individual.id))
          : null;

        // Transform OpenSPP individual to FormSubmission
        const formSubmission = transformer.transform(
          individual,
          undefined,
          existingEntity?.guid,
        );

        // Apply the event to create or update the entity
        await this.eventApplierService.submitForm(formSubmission);
      } catch (error) {
        console.error(`Failed to pull individual ${individual.id}:`, error);
        // Continue with other individuals
      }
    }
  }

  async sync(credentials?: ExternalSyncCredentials): Promise<void> {
    // Push local changes to OpenSPP first
    await this.pushData(credentials);

    // Then pull changes from OpenSPP
    await this.pullData();
  }

  private async ensureClient(_credentials?: ExternalSyncCredentials): Promise<void> {
    if (this.odooClient) {
      return;
    }

    const database = this.getRequiredField("database");
    const username = this.getRequiredField("username");
    const password = this.getRequiredField("password");
    const registrarGroup = this.getOptionalField("registrarGroup");

    if (!this.url || !database || !username || !password) {
      throw new Error("URL, database and credentials are required");
    }

    const odooConfig: OdooConfig = {
      host: this.url,
      database,
      username,
      password,
      registrarGroup,
    };

    this.odooClient = new OdooClient(odooConfig);
    await this.odooClient.login();
  }

  async createIndividualData(
    member: FormSubmission,
  ): Promise<number | undefined> {
    await this.ensureClient();

    if (!this.odooClient) {
      throw new Error("OdooClient not initialized");
    }

    // Build OpenSPP payload from form submission using field mappings
    const payload = buildOpenSppPayload(this.getFieldMappings(), member.data);

    console.log("CREATING_INDIVIDUAL", payload);

    // Create the individual in OpenSPP
    const externalId = await this.odooClient.createIndividual(payload);

    console.log("CREATED_INDIVIDUAL", externalId);

    // Save the external ID back to the entity
    if (externalId) {
      await saveExternalIdToEntity(this.eventApplierService, member.entityGuid, externalId);
    }

    return externalId;
  }

  async updateIndividualData(
    member: FormSubmission,
  ): Promise<number | undefined> {
    await this.ensureClient();

    if (!this.odooClient) {
      throw new Error("OdooClient not initialized");
    }

    // Get the external ID from the entity
    const externalId = await resolveExternalIdFromEntity(this.eventApplierService, member.entityGuid);
    if (!externalId) {
      throw new Error(`Cannot update individual: entity ${member.entityGuid} does not have an externalId`);
    }

    // Build OpenSPP payload from form submission using field mappings
    const payload = buildOpenSppPayload(this.getFieldMappings(), member.data);

    // Update the individual in OpenSPP
    await this.odooClient.write("res.partner", [externalId], payload as unknown as Record<string, unknown>);

    return externalId;
  }

  /**
   * Retrieves field mappings from the external sync config.
   * Field mappings can be stored either:
   * 1. Directly on config.fieldMappings as an array (preferred)
   * 2. As a JSON string in extraFields (legacy support)
   */
  private getFieldMappings(): FieldMapping[] {
    // Check if fieldMappings is directly on the config object (preferred)
    const configWithMappings = this.config as ExternalSyncConfig & { fieldMappings?: FieldMapping[] };
    if (configWithMappings.fieldMappings && Array.isArray(configWithMappings.fieldMappings)) {
      return configWithMappings.fieldMappings;
    }

    // Fallback: check extraFields for legacy JSON string format
    const mappingsJson = getExternalField(this.config, "fieldMappings");
    if (!mappingsJson) {
      // Return empty array if no mappings configured
      // The adapter will still work, just won't map any fields
      return [];
    }

    try {
      return JSON.parse(mappingsJson) as FieldMapping[];
    } catch (error) {
      console.warn("Failed to parse field mappings, using empty mapping:", error);
      return [];
    }
  }

  /**
   * Gets a required field from the external sync config.
   */
  private getRequiredField(name: string): string {
    const value = getExternalField(this.config, name);
    if (!value) {
      throw new Error(`Required field '${name}' is missing from external sync config`);
    }
    return value;
  }

  /**
   * Gets an optional field from the external sync config.
   */
  private getOptionalField(name: string): string | undefined {
    return getExternalField(this.config, name);
  }

}

export default OpenSppSyncAdapter;
