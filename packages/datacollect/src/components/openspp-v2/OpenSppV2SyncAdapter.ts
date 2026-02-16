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
  GroupResource,
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
 * - Individual and Group sync
 * - PATCH for partial updates, PUT for full replacement
 * - Batch operations with retry logic
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
   * Push local entities (Individuals and Groups) to OpenSPP.
   */
  async pushData(_credentials?: ExternalSyncCredentials): Promise<void> {
    await this.ensureClient();

    const entityStore = this.eventApplierService.getEntityStore();
    const allEntities = await entityStore.getAllEntities();

    const individualsToSync = allEntities.filter(
      (pair) => pair.modified.type === EntityType.Individual,
    );
    const groupsToSync = allEntities.filter(
      (pair) => pair.modified.type === EntityType.Group,
    );

    // Push individuals first (groups may reference them)
    if (individualsToSync.length > 0) {
      await this.pushEntities(individualsToSync, "individual");
    }

    // Push groups
    if (groupsToSync.length > 0) {
      await this.pushEntities(groupsToSync, "group");
    }

    if (individualsToSync.length === 0 && groupsToSync.length === 0) {
      console.log("No entities to sync");
    }
  }

  /**
   * Pull entities (Individuals and Groups) from OpenSPP.
   */
  async pullData(_credentials?: ExternalSyncCredentials): Promise<void> {
    await this.ensureClient();
    await this.pullIndividuals();
    await this.pullGroups();
  }

  /**
   * Combined sync operation.
   */
  async sync(credentials?: ExternalSyncCredentials): Promise<void> {
    await this.pushData(credentials);
    await this.pullData(credentials);
  }

  // ==================== Push Logic ====================

  private async pushEntities(
    entities: Array<{ modified: { guid: string; type: EntityType; externalId?: string; data: Record<string, unknown> } }>,
    entityType: "individual" | "group",
  ): Promise<void> {
    const label = entityType === "individual" ? "individuals" : "groups";
    console.log(`Syncing ${entities.length} ${label} in batches of ${this.batchSize}`);

    let successCount = 0;
    let failureCount = 0;
    const failedEntities: Array<{ guid: string; error: string }> = [];

    for (let i = 0; i < entities.length; i += this.batchSize) {
      const batch = entities.slice(i, i + this.batchSize);
      const batchNumber = Math.floor(i / this.batchSize) + 1;
      const totalBatches = Math.ceil(entities.length / this.batchSize);

      console.log(`Processing ${label} batch ${batchNumber}/${totalBatches} (${batch.length} entities)`);

      for (const entityPair of batch) {
        const entity = entityPair.modified;
        const externalId = this.resolveExternalId(entity);

        let attempt = 0;
        let lastError: Error | null = null;
        let success = false;

        while (attempt <= this.maxRetries && !success) {
          try {
            if (entityType === "individual") {
              await this.pushIndividual(entity.guid, entity.data, externalId);
            } else {
              await this.pushGroup(entity.guid, entity.data, externalId);
            }
            success = true;
            successCount++;
          } catch (error) {
            attempt++;
            lastError = error instanceof Error ? error : new Error(String(error));

            if (attempt <= this.maxRetries) {
              const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
              console.warn(
                `Retry ${attempt}/${this.maxRetries} for ${entityType} ${entity.guid} after ${delayMs}ms`,
              );
              await this.delay(delayMs);
            } else {
              failureCount++;
              failedEntities.push({ guid: entity.guid, error: lastError.message });
              console.error(
                `Failed to sync ${entityType} ${entity.guid} after ${this.maxRetries} retries:`,
                lastError,
              );
            }
          }
        }
      }

      if (i + this.batchSize < entities.length && this.batchDelayMs > 0) {
        await this.delay(this.batchDelayMs);
      }
    }

    console.log(`${label} sync complete: ${successCount} succeeded, ${failureCount} failed`);
    if (failedEntities.length > 0) {
      console.error(
        `Failed ${label} (${failedEntities.length}):`,
        failedEntities.map((e) => e.guid).join(", "),
      );
      throw new Error(
        `Sync completed with ${failureCount} failures out of ${entities.length} ${label}. ` +
          `First failure: ${failedEntities[0]?.error || "Unknown error"}`,
      );
    }
  }

  private async pushIndividual(
    guid: string,
    data: Record<string, unknown>,
    externalId?: string,
  ): Promise<void> {
    const resource = this.buildIndividualResource(guid, data);

    if (externalId) {
      const identifier = this.client!.formatIdentifier(guid);
      await this.client!.patchIndividual(identifier, {
        name: resource.name,
        birthDate: resource.birthDate,
        gender: resource.gender,
        telecom: resource.telecom,
        extension: resource.extension,
      });
    } else {
      const created = await this.client!.createIndividual(resource);
      await this.saveExternalIdToEntity(guid, created);
    }
  }

  private async pushGroup(
    guid: string,
    data: Record<string, unknown>,
    externalId?: string,
  ): Promise<void> {
    const resource = this.buildGroupResource(guid, data);

    if (externalId) {
      const identifier = this.client!.formatIdentifier(guid);
      await this.client!.patchGroup(identifier, {
        name: resource.name,
        groupType: resource.groupType,
        extension: resource.extension,
      });
    } else {
      const created = await this.client!.createGroup(resource);
      await this.saveExternalIdToEntity(guid, created);
    }
  }

  // ==================== Pull Logic ====================

  private async pullIndividuals(): Promise<void> {
    const entityStore = this.eventApplierService.getEntityStore();
    let offset = 0;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const searchResult = await this.client!.searchIndividuals({
        _count: String(pageSize),
        _offset: String(offset),
      });

      const individuals = searchResult.data || [];
      if (individuals.length === 0) {
        hasMore = false;
        break;
      }

      for (const individual of individuals) {
        const identifier = this.extractIdentifier(individual);
        if (!identifier) {
          console.warn("Individual without matching identifier, skipping");
          continue;
        }

        try {
          const existingEntity = await entityStore.getEntityByExternalId(identifier);
          const formSubmission = this.transformIndividualToFormSubmission(
            individual,
            existingEntity?.guid,
          );
          await this.eventApplierService.submitForm(formSubmission);
        } catch (error) {
          console.error(`Failed to pull individual ${identifier}:`, error);
        }
      }

      offset += individuals.length;
      hasMore = individuals.length === pageSize;
    }
  }

  private async pullGroups(): Promise<void> {
    const entityStore = this.eventApplierService.getEntityStore();
    let offset = 0;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const searchResult = await this.client!.searchGroups({
        _count: String(pageSize),
        _offset: String(offset),
      });

      const groups = searchResult.data || [];
      if (groups.length === 0) {
        hasMore = false;
        break;
      }

      for (const group of groups) {
        const identifier = this.extractGroupIdentifier(group);
        if (!identifier) {
          console.warn("Group without matching identifier, skipping");
          continue;
        }

        try {
          const existingEntity = await entityStore.getEntityByExternalId(identifier);
          const formSubmission = this.transformGroupToFormSubmission(
            group,
            existingEntity?.guid,
          );
          await this.eventApplierService.submitForm(formSubmission);
        } catch (error) {
          console.error(`Failed to pull group ${identifier}:`, error);
        }
      }

      offset += groups.length;
      hasMore = groups.length === pageSize;
    }
  }

  // ==================== Resource Builders ====================

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
   * Uses `type` discriminator per ADR-019.
   */
  private buildIndividualResource(
    guid: string,
    data: Record<string, unknown>,
  ): IndividualResource {
    const fieldMappings = this.getFieldMappings();
    const resource: IndividualResource = {
      type: "Individual",
      identifier: [this.client!.createIdentifier(guid)],
      active: true,
    };

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

    if (data.birthDate || data.dateOfBirth || data.date_of_birth) {
      resource.birthDate = String(data.birthDate || data.dateOfBirth || data.date_of_birth);
    }

    if (data.gender) {
      resource.gender = this.buildGenderCoding(String(data.gender));
    }

    if (data.phone || data.phoneNumber || data.phone_number) {
      const phone = String(data.phone || data.phoneNumber || data.phone_number);
      resource.telecom = [{ system: "phone", value: phone, use: "mobile" }];
    }

    if (data.email || data.emailAddress || data.email_address) {
      const email = String(data.email || data.emailAddress || data.email_address);
      if (!resource.telecom) resource.telecom = [];
      resource.telecom.push({ system: "email", value: email });
    }

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
   * Build a GroupResource from entity data.
   * Uses `type` discriminator and `groupType` per ADR-019.
   */
  private buildGroupResource(
    guid: string,
    data: Record<string, unknown>,
  ): GroupResource {
    const resource: GroupResource = {
      type: "Group",
      identifier: [this.client!.createIdentifier(guid)],
      active: true,
      groupType: "household",
    };

    if (data.name || data.groupName || data.group_name) {
      resource.name = String(data.name || data.groupName || data.group_name);
    }

    if (data.groupType || data.group_type) {
      const gt = String(data.groupType || data.group_type);
      if (["household", "family", "organization", "other"].includes(gt)) {
        resource.groupType = gt as GroupResource["groupType"];
      }
    }

    return resource;
  }

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

      const transformer = createTransformer(
        mapping.transformer.type as TransformerType,
        mapping.transformer.options as Record<string, string> | undefined,
      );

      const transformedValue = transformer.transform(formValue);
      if (transformedValue === null || transformedValue === undefined || transformedValue === "") {
        continue;
      }

      const apiFieldName = this.toCamelCase(mapping.opensppField);
      extension[apiFieldName] = transformedValue;
    }

    return extension;
  }

  private toCamelCase(str: string): string {
    const withoutPrefix = str.replace(/^x_/, "");
    return withoutPrefix.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  // ==================== Identifier Extraction ====================

  private extractIdentifier(individual: IndividualResource): string | undefined {
    const matchingId = individual.identifier.find(
      (id) => id.system === this.identifierNamespace,
    );
    return matchingId?.value;
  }

  private extractGroupIdentifier(group: GroupResource): string | undefined {
    const matchingId = group.identifier.find(
      (id) => id.system === this.identifierNamespace,
    );
    return matchingId?.value;
  }

  // ==================== Transform to Form Submissions ====================

  private transformIndividualToFormSubmission(
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

    if (individual.name) {
      if (individual.name.given) data.firstName = individual.name.given;
      if (individual.name.family) data.lastName = individual.name.family;
      if (individual.name.middle) data.middleName = individual.name.middle;
    }

    if (individual.birthDate) {
      data.dateOfBirth = individual.birthDate;
    }

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

    if (individual.telecom) {
      const phone = individual.telecom.find((t) => t.system === "phone");
      const email = individual.telecom.find((t) => t.system === "email");
      if (phone) data.phone = phone.value;
      if (email) data.email = email.value;
    }

    if (individual.extension) {
      const studioExt = individual.extension["urn:openspp:extension:studio-individual"];
      if (studioExt) {
        for (const [key, value] of Object.entries(studioExt)) {
          if (key !== "url") {
            const fieldName = `x_${key.replace(/([A-Z])/g, "_$1").toLowerCase()}`;
            data[fieldName] = value;
          }
        }
      }
    }

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

  private transformGroupToFormSubmission(
    group: GroupResource,
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
    const identifier = this.extractGroupIdentifier(group);
    const guid = existingGuid || identifier || crypto.randomUUID();

    const data: Record<string, unknown> = {
      entityName: "group",
    };

    if (group.name) {
      data.name = group.name;
      data.groupName = group.name;
    }

    if (group.groupType) {
      data.groupType = group.groupType;
    }

    data.externalId = identifier;

    return {
      guid: crypto.randomUUID(),
      entityGuid: guid,
      type: existingGuid ? "update-group" : "create-group",
      data,
      timestamp: new Date().toISOString(),
      userId: "openspp-v2-sync",
      syncLevel: SyncLevel.EXTERNAL,
    };
  }

  // ==================== Helpers ====================

  private getFieldMappings(): FieldMapping[] {
    const configWithMappings = this.config as ExternalSyncConfig & {
      fieldMappings?: FieldMapping[];
    };
    return configWithMappings.fieldMappings || [];
  }

  private async saveExternalIdToEntity(
    entityGuid: string,
    created: IndividualResource | GroupResource,
  ): Promise<void> {
    try {
      const entityPair = await this.eventApplierService.getEntityStore().getEntity(entityGuid);
      if (!entityPair) {
        console.warn(`Cannot save external ID: entity ${entityGuid} not found`);
        return;
      }

      const identifier =
        created.type === "Individual"
          ? this.extractIdentifier(created as IndividualResource)
          : this.extractGroupIdentifier(created as GroupResource);
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
