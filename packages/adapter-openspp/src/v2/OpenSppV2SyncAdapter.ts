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
  createTransformer,
  type TransformerType,
  type SyncError,
} from "@idpass/data-collect-core";
import { EventApplierService } from "@idpass/data-collect-core";
import { OpenSppV2Client } from "./OpenSppV2Client";
import type {
  IndividualResource,
  GroupResource,
  HumanName,
  CodeableConcept,
  Extension,
} from "./types";
import { v4 as uuidv4 } from "uuid";

/** User ID for sync-originated events */
const SYNC_USER_ID = "openspp-v2-sync";

/** Extension key for Studio individual custom fields (OpenSPP V2 API) */
const STUDIO_INDIVIDUAL_EXTENSION_KEY = "urn:openspp:extension:studio-individual";

/**
 * Gender codes per ISO/IEC 5218 (representation of human sexes).
 * Push: text -> code; Pull: code -> text.
 */
const GENDER_TO_CODE: Record<string, { code: string; display: string }> = {
  male: { code: "1", display: "Male" },
  m: { code: "1", display: "Male" },
  female: { code: "2", display: "Female" },
  f: { code: "2", display: "Female" },
  other: { code: "9", display: "Not applicable" },
};

const GENDER_FROM_CODE: Record<string, string> = {
  "1": "male",
  "2": "female",
  "9": "other",
  "0": "unknown",
};

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
  private readonly identifierType: string;
  private readonly groupIdentifierType: string;

  constructor(
    private eventStore: EventStore,
    private eventApplierService: EventApplierService,
    private config: ExternalSyncConfig,
  ) {
    this.url = config.url ?? "";
    this.clientId = getAdapterConfigValue<string>(config, "clientId") ?? "";
    this.clientSecret = getAdapterConfigValue<string>(config, "clientSecret") ?? "";
    this.identifierNamespace =
      getAdapterConfigValue<string>(config, "identifierNamespace") ?? "urn:openspp:vocab:id-type#";
    this.includeStudioExtensions =
      getAdapterConfigValue<string>(config, "includeStudioExtensions") !== "false";
    this.batchSize = getAdapterConfigValue<number>(config, "batchSize", 50) ?? 50;
    this.batchDelayMs = getAdapterConfigValue<number>(config, "batchDelayMs", 1000) ?? 1000;
    this.maxRetries = getAdapterConfigValue<number>(config, "maxRetries", 2) ?? 2;
    this.identifierType =
      getAdapterConfigValue<string>(config, "identifierType") ?? "national_id";
    this.groupIdentifierType =
      getAdapterConfigValue<string>(config, "groupIdentifierType") ?? this.identifierType;
  }

  /**
   * Authenticate with OpenSPP using OAuth2 client credentials.
   */
  async authenticate(_credentials?: ExternalSyncCredentials): Promise<boolean> {
    try {
      await this.ensureClient();
      return true;
    } catch (error) {
      console.error(
        "[OpenSppV2SyncAdapter] Authentication failed:",
        error instanceof Error ? error.message : error,
      );
      return false;
    }
  }

  /**
   * Push local entities (Individuals and Groups) to OpenSPP.
   * Syncs all entities each invocation (matching V1 adapter behavior).
   * Incremental sync via getModifiedEntitiesSince() is a planned optimization.
   */
  async pushData(_credentials?: ExternalSyncCredentials): Promise<{ pushed: number; failed: number; skipped: number; errors: SyncError[] }> {
    await this.ensureClient();

    const entityStore = this.eventApplierService.getEntityStore();
    const allEntities = await entityStore.getAllEntities();

    const individualsToSync = allEntities.filter(
      (pair) => pair.modified.type === EntityType.Individual,
    );
    const groupsToSync = allEntities.filter(
      (pair) => pair.modified.type === EntityType.Group,
    );

    let totalPushed = 0;
    let totalFailed = 0;
    const allErrors: SyncError[] = [];

    if (individualsToSync.length > 0) {
      const result = await this.pushEntities(individualsToSync, "individual");
      totalPushed += result.pushed;
      totalFailed += result.failed;
      allErrors.push(...result.errors.map(e => ({
        entityGuid: e.guid,
        code: "PUSH_FAILED",
        message: e.error,
        retryable: true,
      })));
    }

    if (groupsToSync.length > 0) {
      const result = await this.pushEntities(groupsToSync, "group");
      totalPushed += result.pushed;
      totalFailed += result.failed;
      allErrors.push(...result.errors.map(e => ({
        entityGuid: e.guid,
        code: "PUSH_FAILED",
        message: e.error,
        retryable: true,
      })));
    }

    return { pushed: totalPushed, failed: totalFailed, skipped: 0, errors: allErrors };
  }

  /**
   * Pull entities (Individuals and Groups) from OpenSPP.
   * Supports optional _lastUpdated filter when config.lastSyncTimestamp is set.
   */
  async pullData(_credentials?: ExternalSyncCredentials): Promise<{ pulled: number; failed: number; skipped: number; errors: SyncError[] }> {
    await this.ensureClient();
    const since = (this.config as { lastSyncTimestamp?: string }).lastSyncTimestamp;

    const indResult = await this.pullIndividuals(since);
    const grpResult = await this.pullGroups(since);

    return {
      pulled: indResult.pulled + grpResult.pulled,
      failed: indResult.failed + grpResult.failed,
      skipped: indResult.skipped + grpResult.skipped,
      errors: [...indResult.errors, ...grpResult.errors],
    };
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
  ): Promise<{ pushed: number; failed: number; errors: Array<{ guid: string; error: string }> }> {
    const failedEntities: Array<{ guid: string; error: string }> = [];

    for (let i = 0; i < entities.length; i += this.batchSize) {
      const batch = entities.slice(i, i + this.batchSize);
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

    return {
      pushed: entities.length - failedEntities.length,
      failed: failedEntities.length,
      errors: failedEntities,
    };
  }

  private async pushIndividual(
    guid: string,
    data: Record<string, unknown>,
    externalId?: string,
  ): Promise<void> {
    const resource = this.buildIndividualResource(guid, data);
    const system = this.resolveIdentifierSystem(data);

    if (externalId) {
      const identifier = this.getClient().formatIdentifier(system, guid);
      await this.getClient().patchIndividual(identifier, {
        name: resource.name,
        birthDate: resource.birthDate,
        gender: resource.gender,
        telecom: resource.telecom,
        extension: resource.extension,
      });
    } else {
      const created = await this.getClient().createIndividual(resource);
      await this.saveExternalIdToEntity(guid, created);
    }
  }

  private async pushGroup(
    guid: string,
    data: Record<string, unknown>,
    externalId?: string,
  ): Promise<void> {
    const resource = this.buildGroupResource(guid, data);
    const system = this.resolveIdentifierSystem(data, "group");

    if (externalId) {
      const identifier = this.getClient().formatIdentifier(system, guid);
      await this.getClient().patchGroup(identifier, {
        name: resource.name,
        groupType: resource.groupType,
        extension: resource.extension,
      });
    } else {
      const created = await this.getClient().createGroup(resource);
      await this.saveExternalIdToEntity(guid, created);
    }
  }

  // ==================== Pull Logic ====================

  private async pullIndividuals(since?: string): Promise<{ pulled: number; failed: number; skipped: number; errors: SyncError[] }> {
    const entityStore = this.eventApplierService.getEntityStore();
    let offset = 0;
    const pageSize = 100;
    let hasMore = true;
    let pulled = 0;
    let failed = 0;
    let skipped = 0;
    const errors: SyncError[] = [];

    while (hasMore) {
      const params: Record<string, string> = {
        _count: String(pageSize),
        _offset: String(offset),
      };
      if (since) {
        params._lastUpdated = since;
      }

      let individuals: IndividualResource[];
      try {
        const searchResult = await this.getClient().searchIndividuals(params);
        individuals = searchResult.data || [];
      } catch (error) {
        console.error(`Failed to search individuals (offset=${offset}):`, error);
        failed++;
        errors.push({
          code: "SEARCH_FAILED",
          message: `Failed to search individuals (offset=${offset}): ${error instanceof Error ? error.message : String(error)}`,
          retryable: true,
        });
        break;
      }

      if (individuals.length === 0) {
        hasMore = false;
        break;
      }

      for (const individual of individuals) {
        const identifier = this.extractIdentifier(individual);
        if (!identifier) {
          console.warn("Individual without matching identifier, skipping");
          skipped++;
          continue;
        }

        try {
          const existingEntity = await entityStore.getEntityByExternalId(identifier);
          const formSubmission = this.transformIndividualToFormSubmission(
            individual,
            existingEntity?.guid,
          );
          await this.eventApplierService.submitForm(formSubmission);
          pulled++;
        } catch (error) {
          console.error(`Failed to pull individual ${identifier}:`, error);
          failed++;
          errors.push({
            entityGuid: identifier,
            code: "PULL_FAILED",
            message: `Failed to pull individual ${identifier}: ${error instanceof Error ? error.message : String(error)}`,
            retryable: true,
          });
        }
      }

      offset += individuals.length;
      hasMore = individuals.length === pageSize;
    }

    return { pulled, failed, skipped, errors };
  }

  private async pullGroups(since?: string): Promise<{ pulled: number; failed: number; skipped: number; errors: SyncError[] }> {
    const entityStore = this.eventApplierService.getEntityStore();
    let offset = 0;
    const pageSize = 100;
    let hasMore = true;
    let pulled = 0;
    let failed = 0;
    let skipped = 0;
    const errors: SyncError[] = [];

    while (hasMore) {
      const params: Record<string, string> = {
        _count: String(pageSize),
        _offset: String(offset),
      };
      if (since) {
        params._lastUpdated = since;
      }
      let groups: GroupResource[];
      try {
        const searchResult = await this.getClient().searchGroups(params);
        groups = searchResult.data || [];
      } catch (error) {
        console.error(`Failed to search groups (offset=${offset}):`, error);
        failed++;
        errors.push({
          code: "SEARCH_FAILED",
          message: `Failed to search groups (offset=${offset}): ${error instanceof Error ? error.message : String(error)}`,
          retryable: true,
        });
        break;
      }

      if (groups.length === 0) {
        hasMore = false;
        break;
      }

      for (const group of groups) {
        const identifier = this.extractGroupIdentifier(group);
        if (!identifier) {
          console.warn("Group without matching identifier, skipping");
          skipped++;
          continue;
        }

        try {
          const existingEntity = await entityStore.getEntityByExternalId(identifier);
          const formSubmission = this.transformGroupToFormSubmission(
            group,
            existingEntity?.guid,
          );
          await this.eventApplierService.submitForm(formSubmission);
          pulled++;
        } catch (error) {
          console.error(`Failed to pull group ${identifier}:`, error);
          failed++;
          errors.push({
            entityGuid: identifier,
            code: "PULL_FAILED",
            message: `Failed to pull group ${identifier}: ${error instanceof Error ? error.message : String(error)}`,
            retryable: true,
          });
        }
      }

      offset += groups.length;
      hasMore = groups.length === pageSize;
    }

    return { pulled, failed, skipped, errors };
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
      includeStudioExtensions: this.includeStudioExtensions,
    });

    await this.client.authenticate();
  }

  private getClient(): OpenSppV2Client {
    if (!this.client) {
      throw new Error("Client not initialized. Call ensureClient() first.");
    }
    return this.client;
  }

  private resolveExternalId(entity: { externalId?: string; data: Record<string, unknown> }): string | undefined {
    return entity.externalId ?? (entity.data.externalId as string | undefined);
  }

  /**
   * Resolve the OpenSPP identifier system URI from entity data.
   * Checks for an `identifierType` field in the form data, falling back to `national_id`.
   */
  private resolveIdentifierSystem(data: Record<string, unknown>, entityType: "individual" | "group" = "individual"): string {
    const formCode = data.identifierType as string | undefined;
    const defaultCode = entityType === "group" ? this.groupIdentifierType : this.identifierType;
    const code = formCode || defaultCode;
    if (code.startsWith(this.identifierNamespace)) {
      return code;
    }
    return `${this.identifierNamespace}${code}`;
  }

  /**
   * Check if an identifier system matches the configured namespace.
   */
  private isOpenSppIdentifier(system: string): boolean {
    return system.startsWith(this.identifierNamespace);
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
    const system = this.resolveIdentifierSystem(data);
    const resource: IndividualResource = {
      type: "Individual",
      identifier: [this.getClient().createIdentifier(system, guid)],
      active: true,
    };

    // Use field mappings to resolve core fields; fall back to conventional names
    const resolve = (opensppField: string, ...fallbackKeys: string[]): string | undefined => {
      // Check field mappings first
      const mapping = fieldMappings.find((m) => m.opensppField === opensppField);
      if (mapping) {
        const raw = data[mapping.formField];
        if (raw !== null && raw !== undefined && raw !== "") {
          const transformer = createTransformer(
            mapping.transformer.type as TransformerType,
            mapping.transformer.options as Record<string, string> | undefined,
          );
          const val = transformer.transform(raw);
          if (val !== null && val !== undefined && val !== "") return String(val);
        }
      }
      // Fall back to conventional field names
      for (const key of fallbackKeys) {
        if (data[key] !== null && data[key] !== undefined && data[key] !== "") {
          return String(data[key]);
        }
      }
      return undefined;
    };

    const name: HumanName = {};
    name.given = resolve("name.given", "firstName", "first_name");
    name.family = resolve("name.family", "lastName", "last_name");
    name.middle = resolve("name.middle", "middleName", "middle_name");
    const fullName = resolve("name.text", "name", "fullName", "full_name");

    if (name.given || name.family) {
      name.text = fullName || [name.family, name.given].filter(Boolean).join(", ");
      resource.name = name;
    } else if (fullName) {
      name.text = fullName;
      resource.name = name;
    }

    const birthDate = resolve("birthDate", "birthDate", "dateOfBirth", "date_of_birth");
    if (birthDate) {
      resource.birthDate = birthDate;
    }

    const gender = resolve("gender", "gender");
    if (gender) {
      resource.gender = this.buildGenderCoding(gender);
    }

    const phone = resolve("telecom.phone", "phone", "phoneNumber", "phone_number");
    if (phone) {
      resource.telecom = [{ system: "phone", value: phone, use: "mobile" }];
    }

    const email = resolve("telecom.email", "email", "emailAddress", "email_address");
    if (email) {
      if (!resource.telecom) resource.telecom = [];
      resource.telecom.push({ system: "email", value: email });
    }

    // Studio extension fields from remaining mappings (not already used for core fields)
    const coreOpenSppFields = new Set(["name.given", "name.family", "name.middle", "name.text", "birthDate", "gender", "telecom.phone", "telecom.email"]);
    const studioMappings = fieldMappings.filter((m) => !coreOpenSppFields.has(m.opensppField));
    if (studioMappings.length > 0 && this.includeStudioExtensions) {
      const studioExtension = this.buildStudioExtension(data, studioMappings);
      if (Object.keys(studioExtension).length > 1) {
        resource.extension = {
          [STUDIO_INDIVIDUAL_EXTENSION_KEY]: studioExtension,
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
    const system = this.resolveIdentifierSystem(data, "group");
    const resource: GroupResource = {
      type: "Group",
      identifier: [this.getClient().createIdentifier(system, guid)],
      active: true,
      groupType: "household",
    };

    if (data._displayName || data.name || data.groupName || data.group_name) {
      resource.name = String(data._displayName || data.name || data.groupName || data.group_name);
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
    const normalized = gender.toLowerCase();
    const mapping = GENDER_TO_CODE[normalized] || { code: "0", display: "Unknown" };

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
      url: STUDIO_INDIVIDUAL_EXTENSION_KEY,
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
      (id) => this.isOpenSppIdentifier(id.system),
    );
    return matchingId?.value;
  }

  private extractGroupIdentifier(group: GroupResource): string | undefined {
    const matchingId = group.identifier.find(
      (id) => this.isOpenSppIdentifier(id.system),
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
    const guid = existingGuid || identifier || uuidv4();

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
      data.gender = GENDER_FROM_CODE[genderCode] || "unknown";
    }

    if (individual.telecom) {
      const phone = individual.telecom.find((t) => t.system === "phone");
      const email = individual.telecom.find((t) => t.system === "email");
      if (phone) data.phone = phone.value;
      if (email) data.email = email.value;
    }

    if (individual.extension) {
      const studioExt = individual.extension[STUDIO_INDIVIDUAL_EXTENSION_KEY];
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
      guid: uuidv4(),
      entityGuid: guid,
      type: existingGuid ? "update-individual" : "create-individual",
      data,
      timestamp: new Date().toISOString(),
      userId: SYNC_USER_ID,
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
    const guid = existingGuid || identifier || uuidv4();

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
      guid: uuidv4(),
      entityGuid: guid,
      type: existingGuid ? "update-group" : "create-group",
      data,
      timestamp: new Date().toISOString(),
      userId: SYNC_USER_ID,
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
