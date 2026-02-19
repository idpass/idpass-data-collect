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
  createTransformer,
  type TransformerType,
} from "@idpass/data-collect-core";
import { EventApplierService } from "@idpass/data-collect-core";
import OdooClient from "./OdooClient";
import { IndividualTransformer } from "./pullTransformers/IndividualTransformer";
import type { OdooConfig, OpenSPPCreateIndividualPayload } from "./odoo-types";
import type { OpenSppAdapterOptions } from "./OpenSppAdapterOptions";
import { parseOpenSppAdapterOptions } from "./OpenSppAdapterOptions";

/**
 * Field mapping configuration from external sync config.
 * Matches the structure used in the admin UI.
 */
interface FieldMapping {
  formField: string;
  opensppField: string;
  transformer: {
    type: TransformerType;
    options?: {
      inputFormat?: "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY" | "auto";
      outputFormat?: "YYYY-MM-DD" | "MM/DD/YYYY" | "DD/MM/YYYY";
      delimiter?: string; // Multi-select transformer option
      truthyValue?: string; // Boolean transformer option
      falsyValue?: string; // Boolean transformer option
    };
  };
}

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
        const externalId = await this.resolveExternalIdFromEntity(entity.guid);

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
    const payload = this.buildOpenSppPayload(member.data);

    console.log("CREATING_INDIVIDUAL", payload);

    // Create the individual in OpenSPP
    const externalId = await this.odooClient.createIndividual(payload);

    console.log("CREATED_INDIVIDUAL", externalId);

    // Save the external ID back to the entity
    if (externalId) {
      await this.saveExternalIdToEntity(member.entityGuid, externalId);
    }

    return externalId;
  }

  private async resolveExternalIdFromEntity(entityGuid: string): Promise<number | undefined> {
    const entityPair = await this.eventApplierService.getEntityStore().getEntity(entityGuid);
    if (!entityPair) {
      return undefined;
    }

    // Check top-level externalId first (used by IndexedDB index), then fallback to data.externalId
    const externalId = entityPair.modified.externalId ?? entityPair.modified.data.externalId;
    if (!externalId) {
      return undefined;
    }

    // External ID can be stored as number or string
    const id = typeof externalId === "number" ? externalId : parseInt(String(externalId), 10);
    return isNaN(id) ? undefined : id;
  }

  async updateIndividualData(
    member: FormSubmission,
  ): Promise<number | undefined> {
    await this.ensureClient();

    if (!this.odooClient) {
      throw new Error("OdooClient not initialized");
    }

    // Get the external ID from the entity
    const externalId = await this.resolveExternalIdFromEntity(member.entityGuid);
    if (!externalId) {
      throw new Error(`Cannot update individual: entity ${member.entityGuid} does not have an externalId`);
    }

    // Build OpenSPP payload from form submission using field mappings
    const payload = this.buildOpenSppPayload(member.data);

    // Update the individual in OpenSPP
    await this.odooClient.write("res.partner", [externalId], payload as unknown as Record<string, unknown>);

    return externalId;
  }

  /**
   * Builds an OpenSPP payload from form submission data using configured field mappings.
   * Uses field transformers to convert values to the appropriate OpenSPP format.
   */
  private buildOpenSppPayload(formData: Record<string, unknown>): OpenSPPCreateIndividualPayload {
    const fieldMappings = this.getFieldMappings();
    const payload: Record<string, unknown> = {
      is_registrant: true,
      is_group: false,
    };

    // Apply field mappings with transformers
    for (const mapping of fieldMappings) {
      const formValue = formData[mapping.formField];

      // Skip if form field value is missing
      if (formValue === null || formValue === undefined || formValue === "") {
        continue;
      }

      // Create transformer for this field
      const transformer = createTransformer(
        mapping.transformer.type,
        mapping.transformer.options,
      );

      // For text transformers, normalize "false" strings to empty string before transformation
      // This handles cases where boolean false values are stored as strings for text fields
      let valueToTransform = formValue;
      if (mapping.transformer.type === "text" && (formValue === "false" || formValue === false)) {
        valueToTransform = "";
      }

      // Skip if normalized value is empty (for text fields)
      if (mapping.transformer.type === "text" && valueToTransform === "") {
        continue;
      }

      // Transform the value from form format to OpenSPP format
      const transformedValue = transformer.transform(valueToTransform);

      // Skip if transformed value is empty, null, or undefined
      // OpenSPP doesn't accept empty strings for text fields
      if (transformedValue === null || transformedValue === undefined || transformedValue === "") {
        continue;
      }

      // Map to OpenSPP field name
      payload[mapping.opensppField] = transformedValue;
    }

    // Ensure required fields are present
    const finalPayload: OpenSPPCreateIndividualPayload = {
      is_registrant: true,
      is_group: false,
      ...payload,
    };

    return finalPayload;
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

  /**
   * Saves the external ID back to the entity after successful creation in OpenSPP.
   * This prevents duplicates by ensuring the entity knows its external ID for future updates.
   *
   * IMPORTANT: This method directly updates the entity data without creating a new event
   * to avoid the event being picked up in the next sync cycle and causing duplicate processing.
   *
   * Sets the externalId at both the top-level (for IndexedDB index) and in data.externalId
   * (for consistency with form data structure).
   */
  private async saveExternalIdToEntity(entityGuid: string, externalId: number): Promise<void> {
    try {
      const entityPair = await this.eventApplierService.getEntityStore().getEntity(entityGuid);
      if (!entityPair) {
        console.warn(`Cannot save external ID: entity ${entityGuid} not found`);
        return;
      }

      // Check if external ID is already set to avoid unnecessary updates
      // Check both top-level and nested locations
      const currentTopLevel = entityPair.modified.externalId;
      const currentNested = entityPair.modified.data.externalId;
      const externalIdStr = String(externalId);

      // Compare top-level (stored as string) with string version
      const topLevelMatches = currentTopLevel === externalIdStr;

      // Compare nested (could be number or string) with both number and string versions
      const nestedMatches =
        currentNested === externalId ||
        currentNested === externalIdStr ||
        String(currentNested) === externalIdStr;

      if (topLevelMatches && nestedMatches) {
        return;
      }

      // Directly update the entity with external ID at both locations:
      // 1. Top-level externalId (used by IndexedDB index for getEntityByExternalId)
      // 2. data.externalId (for consistency with form data structure)
      // This prevents the update from being picked up in the next sync cycle
      const updatedEntity = {
        ...entityPair.modified,
        externalId: String(externalId), // Top-level for index lookup
        data: {
          ...entityPair.modified.data,
          externalId: externalId, // Nested for form data consistency
        },
        lastUpdated: new Date().toISOString(),
      };

      // Save directly to entity store without going through EventApplierService
      // to avoid creating a new event that would be processed in next sync
      await this.eventApplierService.getEntityStore().saveEntity(entityPair.modified, updatedEntity);
    } catch (error) {
      console.error(`Error saving external ID ${externalId} to entity ${entityGuid}:`, error);
      // Don't throw - we don't want to fail the entire sync if saving external ID fails
      // The next sync will try again
    }
  }
}

export default OpenSppSyncAdapter;
