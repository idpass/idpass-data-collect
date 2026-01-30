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
  EntityType,
  SyncLevel,
  getAdapterConfigValue,
  FieldMapping,
} from "../../interfaces/types";
import { EventApplierService } from "../../services/EventApplierService";
import { OpenSppV2Client } from "./OpenSppV2Client";
import type {
  IndividualResource,
  HumanName,
  CodeableConcept,
  Extension,
} from "./types";
import { createTransformer, type TransformerType } from "../../utils/fieldTransformers";

/**
 * OpenSPP V2 Sync Adapter
 *
 * Synchronizes DataCollect entities with OpenSPP using the V2 REST API.
 * Features:
 * - OAuth2 client credentials authentication
 * - External identifiers with configurable namespace
 * - Studio extension support for custom fields
 * - Batch operations for efficient sync
 * - Field mapping with transformers
 */
class OpenSppV2SyncAdapter implements ExternalSyncAdapter {
  private client: OpenSppV2Client | null = null;
  private readonly url: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly identifierNamespace: string;
  private readonly includeStudioExtensions: boolean;
  private readonly batchSize: number;
  private readonly batchDelayMs: number;
  private readonly maxRetries: number;

  constructor(
    private eventStore: EventStore,
    private eventApplierService: EventApplierService,
    private config: ExternalSyncConfig,
  ) {
    this.url = config.url ?? "";
    this.clientId = getAdapterConfigValue<string>(config, "clientId") ?? "";
    this.clientSecret = getAdapterConfigValue<string>(config, "clientSecret") ?? "";
    this.identifierNamespace =
      getAdapterConfigValue<string>(config, "identifierNamespace") ?? "urn:datacollect:entity";
    this.includeStudioExtensions =
      getAdapterConfigValue<string>(config, "includeStudioExtensions") !== "false";
    this.batchSize = getAdapterConfigValue<number>(config, "batchSize", 50) ?? 50;
    this.batchDelayMs = getAdapterConfigValue<number>(config, "batchDelayMs", 1000) ?? 1000;
    this.maxRetries = getAdapterConfigValue<number>(config, "maxRetries", 2) ?? 2;
  }

  /**
   * Authenticate with OpenSPP using OAuth2 client credentials.
   */
  async authenticate(_credentials?: ExternalSyncCredentials): Promise<boolean> {
    try {
      await this.ensureClient();
      return true;
    } catch (error) {
      console.error("OpenSPP V2 authentication error:", error);
      return false;
    }
  }

  /**
   * Push local entities to OpenSPP.
   */
  async pushData(_credentials?: ExternalSyncCredentials): Promise<void> {
    await this.ensureClient();

    const entityStore = this.eventApplierService.getEntityStore();
    const allEntities = await entityStore.getAllEntities();

    // Filter individuals that need to be synced
    const individualsToSync = allEntities.filter((pair) => {
      const entity = pair.modified;
      return entity.type === EntityType.Individual;
    });

    if (individualsToSync.length === 0) {
      console.log("No individuals to sync");
      return;
    }

    console.log(
      `Syncing ${individualsToSync.length} individuals in batches of ${this.batchSize}`,
    );

    let successCount = 0;
    let failureCount = 0;
    const failedEntities: Array<{ guid: string; error: string }> = [];

    // Process entities in batches
    for (let i = 0; i < individualsToSync.length; i += this.batchSize) {
      const batch = individualsToSync.slice(i, i + this.batchSize);
      const batchNumber = Math.floor(i / this.batchSize) + 1;
      const totalBatches = Math.ceil(individualsToSync.length / this.batchSize);

      console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} entities)`);

      for (const entityPair of batch) {
        const entity = entityPair.modified;
        const externalId = this.resolveExternalId(entity);

        let attempt = 0;
        let lastError: Error | null = null;
        let success = false;

        while (attempt <= this.maxRetries && !success) {
          try {
            const individualResource = this.buildIndividualResource(entity.guid, entity.data);

            if (externalId) {
              // Update existing individual
              const identifier = this.client!.formatIdentifier(entity.guid);
              await this.client!.updateIndividual(identifier, individualResource);
            } else {
              // Create new individual
              const created = await this.client!.createIndividual(individualResource);
              // Save external ID back to entity
              await this.saveExternalIdToEntity(entity.guid, created);
            }

            success = true;
            successCount++;
          } catch (error) {
            attempt++;
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt <= this.maxRetries) {
              const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
              console.warn(
                `Retry ${attempt}/${this.maxRetries} for entity ${entity.guid} after ${delayMs}ms`,
              );
              await this.delay(delayMs);
            } else {
              failureCount++;
              const errorMessage = lastError.message || String(lastError);
              failedEntities.push({ guid: entity.guid, error: errorMessage });
              console.error(
                `Failed to sync individual ${entity.guid} after ${this.maxRetries} retries:`,
                lastError,
              );
            }
          }
        }
      }

      // Delay between batches
      if (i + this.batchSize < individualsToSync.length && this.batchDelayMs > 0) {
        await this.delay(this.batchDelayMs);
      }
    }

    console.log(`Sync complete: ${successCount} succeeded, ${failureCount} failed`);
    if (failedEntities.length > 0) {
      console.error(
        `Failed entities (${failedEntities.length}):`,
        failedEntities.map((e) => e.guid).join(", "),
      );
      throw new Error(
        `Sync completed with ${failureCount} failures out of ${individualsToSync.length} entities. ` +
          `First failure: ${failedEntities[0]?.error || "Unknown error"}`,
      );
    }
  }

  /**
   * Pull entities from OpenSPP.
   */
  async pullData(_credentials?: ExternalSyncCredentials): Promise<void> {
    await this.ensureClient();

    const entityStore = this.eventApplierService.getEntityStore();

    // Search for individuals with pagination
    let offset = 0;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const searchResult = await this.client!.searchIndividuals({
        _count: String(pageSize),
        _offset: String(offset),
      });

      const entries = searchResult.entry || [];
      if (entries.length === 0) {
        hasMore = false;
        break;
      }

      for (const entry of entries) {
        if (!entry.resource) continue;

        const individual = entry.resource;
        const identifier = this.extractIdentifier(individual);

        if (!identifier) {
          console.warn("Individual without matching identifier, skipping");
          continue;
        }

        try {
          // Check if we already have this entity
          const existingEntity = await entityStore.getEntityByExternalId(identifier);

          // Transform OpenSPP individual to form submission
          const formSubmission = this.transformToFormSubmission(
            individual,
            existingEntity?.guid,
          );

          // Apply the event
          await this.eventApplierService.submitForm(formSubmission);
        } catch (error) {
          console.error(`Failed to pull individual ${identifier}:`, error);
        }
      }

      offset += entries.length;
      hasMore = entries.length === pageSize;
    }
  }

  /**
   * Combined sync operation.
   */
  async sync(credentials?: ExternalSyncCredentials): Promise<void> {
    await this.pushData(credentials);
    await this.pullData(credentials);
  }

  // ==================== Private Methods ====================

  private async ensureClient(): Promise<void> {
    if (this.client) {
      return;
    }

    if (!this.url || !this.clientId || !this.clientSecret) {
      throw new Error("URL, clientId, and clientSecret are required");
    }

    this.client = new OpenSppV2Client({
      baseUrl: this.url,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      identifierNamespace: this.identifierNamespace,
      includeStudioExtensions: this.includeStudioExtensions,
    });

    await this.client.authenticate();
  }

  private resolveExternalId(entity: { externalId?: string; data: Record<string, unknown> }): string | undefined {
    return entity.externalId ?? (entity.data.externalId as string | undefined);
  }

  /**
   * Build an IndividualResource from entity data.
   */
  private buildIndividualResource(
    guid: string,
    data: Record<string, unknown>,
  ): IndividualResource {
    const fieldMappings = this.getFieldMappings();
    const resource: IndividualResource = {
      resourceType: "Individual",
      identifier: [this.client!.createIdentifier(guid)],
      active: true,
    };

    // Build name
    const name: HumanName = {};
    if (data.firstName || data.first_name) {
      name.given = String(data.firstName || data.first_name);
    }
    if (data.lastName || data.last_name) {
      name.family = String(data.lastName || data.last_name);
    }
    if (data.middleName || data.middle_name) {
      name.middle = String(data.middleName || data.middle_name);
    }
    if (name.given || name.family) {
      name.text = [name.family, name.given].filter(Boolean).join(", ");
      resource.name = name;
    }

    // Birth date
    if (data.birthDate || data.dateOfBirth || data.date_of_birth) {
      resource.birthDate = String(data.birthDate || data.dateOfBirth || data.date_of_birth);
    }

    // Gender
    if (data.gender) {
      resource.gender = this.buildGenderCoding(String(data.gender));
    }

    // Phone
    if (data.phone || data.phoneNumber || data.phone_number) {
      const phone = String(data.phone || data.phoneNumber || data.phone_number);
      resource.telecom = [{ system: "phone", value: phone, use: "mobile" }];
    }

    // Email
    if (data.email || data.emailAddress || data.email_address) {
      const email = String(data.email || data.emailAddress || data.email_address);
      if (!resource.telecom) resource.telecom = [];
      resource.telecom.push({ system: "email", value: email });
    }

    // Apply field mappings for Studio extensions
    if (fieldMappings.length > 0 && this.includeStudioExtensions) {
      const studioExtension = this.buildStudioExtension(data, fieldMappings);
      if (Object.keys(studioExtension).length > 1) {
        resource.extension = {
          "studio-individual": studioExtension,
        };
      }
    }

    return resource;
  }

  /**
   * Build gender coding from string value.
   */
  private buildGenderCoding(gender: string): CodeableConcept {
    const genderMap: Record<string, { code: string; display: string }> = {
      male: { code: "1", display: "Male" },
      m: { code: "1", display: "Male" },
      female: { code: "2", display: "Female" },
      f: { code: "2", display: "Female" },
      other: { code: "9", display: "Not applicable" },
    };

    const normalized = gender.toLowerCase();
    const mapping = genderMap[normalized] || { code: "0", display: "Unknown" };

    return {
      coding: [
        {
          system: "urn:iso:std:iso:5218",
          code: mapping.code,
          display: mapping.display,
        },
      ],
    };
  }

  /**
   * Build Studio extension from field mappings.
   */
  private buildStudioExtension(
    data: Record<string, unknown>,
    fieldMappings: FieldMapping[],
  ): Extension {
    const extension: Extension = {
      url: "urn:openspp:extension:studio-individual",
    };

    for (const mapping of fieldMappings) {
      const formValue = data[mapping.formField];
      if (formValue === null || formValue === undefined || formValue === "") {
        continue;
      }

      // Create transformer
      const transformer = createTransformer(
        mapping.transformer.type as TransformerType,
        mapping.transformer.options as Record<string, string> | undefined,
      );

      // Transform value
      const transformedValue = transformer.transform(formValue);
      if (transformedValue === null || transformedValue === undefined || transformedValue === "") {
        continue;
      }

      // Convert field name to camelCase for API
      const apiFieldName = this.toCamelCase(mapping.opensppField);
      extension[apiFieldName] = transformedValue;
    }

    return extension;
  }

  /**
   * Convert snake_case to camelCase.
   */
  private toCamelCase(str: string): string {
    // Remove x_ prefix if present (Studio field convention)
    const withoutPrefix = str.replace(/^x_/, "");
    return withoutPrefix.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Extract the matching identifier from an individual resource.
   */
  private extractIdentifier(individual: IndividualResource): string | undefined {
    const matchingId = individual.identifier.find(
      (id) => id.system === this.identifierNamespace,
    );
    return matchingId?.value;
  }

  /**
   * Transform an OpenSPP individual to a form submission.
   */
  private transformToFormSubmission(
    individual: IndividualResource,
    existingGuid?: string,
  ): {
    guid: string;
    entityGuid: string;
    type: string;
    data: Record<string, unknown>;
    timestamp: string;
    userId: string;
    syncLevel: SyncLevel;
  } {
    const identifier = this.extractIdentifier(individual);
    const guid = existingGuid || identifier || crypto.randomUUID();

    const data: Record<string, unknown> = {
      entityName: "individual",
    };

    // Extract name
    if (individual.name) {
      if (individual.name.given) data.firstName = individual.name.given;
      if (individual.name.family) data.lastName = individual.name.family;
      if (individual.name.middle) data.middleName = individual.name.middle;
    }

    // Extract birth date
    if (individual.birthDate) {
      data.dateOfBirth = individual.birthDate;
    }

    // Extract gender
    if (individual.gender?.coding?.[0]) {
      const genderCode = individual.gender.coding[0].code;
      const genderMap: Record<string, string> = {
        "1": "male",
        "2": "female",
        "9": "other",
        "0": "unknown",
      };
      data.gender = genderMap[genderCode] || "unknown";
    }

    // Extract telecom
    if (individual.telecom) {
      const phone = individual.telecom.find((t) => t.system === "phone");
      const email = individual.telecom.find((t) => t.system === "email");
      if (phone) data.phone = phone.value;
      if (email) data.email = email.value;
    }

    // Extract Studio extensions
    if (individual.extension) {
      const studioExt = individual.extension["urn:openspp:extension:studio-individual"];
      if (studioExt) {
        for (const [key, value] of Object.entries(studioExt)) {
          if (key !== "url") {
            // Convert camelCase back to snake_case with x_ prefix
            const fieldName = `x_${key.replace(/([A-Z])/g, "_$1").toLowerCase()}`;
            data[fieldName] = value;
          }
        }
      }
    }

    // Store external ID
    data.externalId = identifier;

    return {
      guid: crypto.randomUUID(),
      entityGuid: guid,
      type: existingGuid ? "update-individual" : "create-individual",
      data,
      timestamp: new Date().toISOString(),
      userId: "openspp-v2-sync",
      syncLevel: SyncLevel.EXTERNAL,
    };
  }

  /**
   * Get field mappings from config.
   */
  private getFieldMappings(): FieldMapping[] {
    const configWithMappings = this.config as ExternalSyncConfig & {
      fieldMappings?: FieldMapping[];
    };
    return configWithMappings.fieldMappings || [];
  }

  /**
   * Save external ID back to entity after creation.
   */
  private async saveExternalIdToEntity(
    entityGuid: string,
    created: IndividualResource,
  ): Promise<void> {
    try {
      const entityPair = await this.eventApplierService.getEntityStore().getEntity(entityGuid);
      if (!entityPair) {
        console.warn(`Cannot save external ID: entity ${entityGuid} not found`);
        return;
      }

      const identifier = this.extractIdentifier(created);
      if (!identifier) {
        return;
      }

      const updatedEntity = {
        ...entityPair.modified,
        externalId: identifier,
        data: {
          ...entityPair.modified.data,
          externalId: identifier,
        },
        lastUpdated: new Date().toISOString(),
      };

      await this.eventApplierService.getEntityStore().saveEntity(entityPair.modified, updatedEntity);
    } catch (error) {
      console.error(`Error saving external ID to entity ${entityGuid}:`, error);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default OpenSppV2SyncAdapter;
