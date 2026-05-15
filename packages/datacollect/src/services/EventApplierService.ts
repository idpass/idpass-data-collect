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

import { cloneDeep } from "lodash";
import { v4 as uuidv4 } from "uuid";
import {
  AuditLogEntry,
  EntityDoc,
  EntityPair,
  EntityStore,
  EntityType,
  EventApplier,
  EventStore,
  FormSubmission,
  GroupDoc,
  IndividualDoc,
  RecordDoc,
  SearchCriteria,
  SyncLevel,
} from "../interfaces/types";
import { AppError } from "../utils/AppError";

import { validateFormSubmission } from "../utils/formValidation";
import { ConflictService } from "./ConflictService";
import { DuplicateDetectionService } from "./DuplicateDetectionService";
import { EventUpcasterService } from "./EventUpcasterService";
import { createLogger } from "../utils/logger";

const log = createLogger("EventApplierService");

type ConflictResolutionResult =
  | { resolution: "no-conflict"; baseEntity?: EntityDoc }
  | { resolution: "local-wins"; entity: EntityDoc }
  | { resolution: "remote-wins"; baseEntity?: EntityDoc };

/**
 * Service responsible for applying events (FormSubmissions) to entities in the event sourcing system.
 *
 * The EventApplierService is the core component that transforms events into entity state changes.
 * It handles all standard entity operations (create, update, delete, add/remove members) and supports
 * custom event appliers for domain-specific operations.
 *
 * Key features:
 * - **Event Processing**: Applies form submissions to create or modify entities.
 * - **Custom Event Support**: Allows registration of custom event appliers.
 * - **Audit Trail**: Maintains complete audit logs for all changes.
 * - **Duplicate Detection**: Automatically flags potential duplicates during entity creation.
 * - **Cascading Operations**: Handles complex operations like group member management.
 * - **Data Validation**: Validates all form submissions before processing.
 *
 * Architecture:
 * - Uses the Strategy pattern for pluggable event appliers.
 * - Maintains referential integrity for group-member relationships.
 * - Generates audit entries for all state changes.
 * - Integrates with duplicate detection algorithms.
 *
 * @example
 * Basic usage:
 * ```typescript
 * const service = new EventApplierService(
 *   eventStore,
 *   entityStore
 * );
 *
 * // Submit a form to create an individual
 * const individual = await service.submitForm({
 *   guid: uuidv4(),
 *   entityGuid: uuidv4(),
 *   type: 'create-individual',
 *   data: { name: 'John Doe', age: 30 },
 *   timestamp: new Date().toISOString(),
 *   userId: 'user-123',
 *   syncLevel: SyncLevel.LOCAL
 * });
 * ```
 *
 * @example
 * Custom event applier:
 * ```typescript
 * // Register a custom event applier
 * const customApplier: EventApplier = {
 *   apply: async (entity, form, getEntity, saveEntity) => {
 *     if (form.type === 'custom-verification') {
 *       const updated = {
 *         ...entity,
 *         data: { ...entity.data, verified: true, verifiedAt: form.timestamp }
 *       };
 *       return updated;
 *     }
 *     throw new Error(`Unsupported event type: ${form.type}`);
 *   }
 * };
 *
 * service.registerEventApplier('custom-verification', customApplier);
 *
 * // Now can process custom events
 * await service.submitForm({
 *   type: 'custom-verification',
 *   // ... other form properties
 * });
 * ```
 *
 * @example
 * Group operations:
 * ```typescript
 * // Create a group with members
 * const group = await service.submitForm({
 *   guid: uuidv4(),
 *   entityGuid: uuidv4(),
 *   type: 'create-group',
 *   data: {
 *     name: 'Smith Family',
 *     members: [
 *       { guid: 'person-1', name: 'John Smith', type: 'individual' },
 *       { guid: 'person-2', name: 'Jane Smith', type: 'individual' }
 *     ]
 *   },
 *   timestamp: new Date().toISOString(),
 *   userId: 'user-123',
 *   syncLevel: SyncLevel.LOCAL
 * });
 *
 * // Add a member to existing group
 * await service.submitForm({
 *   guid: uuidv4(),
 *   entityGuid: group.guid,
 *   type: 'add-member',
 *   data: {
 *     members: [{ guid: 'person-3', name: 'Bob Smith', type: 'individual' }]
 *   },
 *   timestamp: new Date().toISOString(),
 *   userId: 'user-123',
 *   syncLevel: SyncLevel.LOCAL
 * });
 * ```
 */
export class EventApplierService {
  /** Registry of custom event appliers mapped by event type */
  private eventAppliers: Map<string, EventApplier> = new Map();
  /** Service that performs duplicate detection asynchronously off the write path */
  private duplicateDetectionService: DuplicateDetectionService;
  /** Optional service for upcasting event data from older schema versions */
  private upcasterService?: EventUpcasterService;
  /** Optional service for recording detected conflicts */
  private conflictService?: ConflictService;
  /** Tenant ID for conflict recording (defaults to "default") */
  private tenantId: string;

  /**
   * Creates a new EventApplierService instance.
   *
   * @param eventStore Store for managing events and audit logs.
   * @param entityStore Store for managing current entity state.
   * @param duplicateDetectionService Optional service for async duplicate detection. A default instance is created if not provided.
   * @param upcasterService Optional service for event schema version upcasting. When provided, event data is automatically upcasted before being applied.
   * @param conflictService Optional service for recording detected conflicts.
   * @param tenantId Tenant ID for conflict recording (defaults to "default").
   */
  constructor(
    private eventStore: EventStore,
    private entityStore: EntityStore,
    duplicateDetectionService?: DuplicateDetectionService,
    upcasterService?: EventUpcasterService,
    conflictService?: ConflictService,
    tenantId?: string,
  ) {
    this.duplicateDetectionService =
      duplicateDetectionService ?? new DuplicateDetectionService(entityStore, eventStore);
    this.upcasterService = upcasterService;
    this.conflictService = conflictService;
    this.tenantId = tenantId ?? "default";
  }

  /**
   * Returns the duplicate detection service instance, primarily for testing
   * purposes (e.g., calling `flush()` to wait for async processing).
   */
  getDuplicateDetectionService(): DuplicateDetectionService {
    return this.duplicateDetectionService;
  }

  /**
   * Registers a custom event applier for a specific event type.
   *
   * Allows extending the system with domain-specific event processing logic.
   * Custom appliers take precedence over built-in event handling.
   *
   * @param eventType The event type to handle (e.g., 'custom-verification').
   * @param applier The event applier implementation.
   * @returns `void`.
   *
   * @example
   * ```typescript
   * const verificationApplier: EventApplier = {
   *   apply: async (entity, form, getEntity, saveEntity) => {
   *     const updated = {
   *       ...entity,
   *       data: { ...entity.data, verified: true, verifiedAt: form.timestamp }
   *     };
   *     await saveEntity('verify-entity', entity, updated, form.data);
   *     return updated;
   *   }
   * };
   *
   * service.registerEventApplier('custom-verification', verificationApplier);
   * ```
   */
  registerEventApplier(eventType: string, applier: EventApplier): void {
    this.eventAppliers.set(eventType, applier);
  }

  /**
   * Retrieves a registered event applier for a specific event type.
   *
   * @param eventType The event type to look up.
   * @returns The event applier if registered, `undefined` otherwise.
   *
   * @example
   * ```typescript
   * const applier = service.getEventApplier('custom-verification');
   * if (applier) {
   *   // Custom applier is available
   * }
   * ```
   */
  getEventApplier(eventType: string): EventApplier | undefined {
    return this.eventAppliers.get(eventType);
  }

  /**
   * Retrieves the entity store instance.
   *
   * @returns The entity store instance.
   */
  getEntityStore(): EntityStore {
    return this.entityStore;
  }

  /**
   * Processes a form submission to create or modify entities through the event sourcing system.
   *
   * This is the main entry point for all entity operations. The method:
   * 1. Validates the form submission data.
   * 2. Saves the event to the event store.
   * 3. Applies the event to create/update entities.
   * 4. Logs audit entries for all changes.
   * 5. Flags potential duplicates automatically.
   *
   * Supported event types:
   * - `create-group` / `update-group`: Create or modify group entities.
   * - `create-individual` / `update-individual`: Create or modify individual entities.
   * - `add-member`: Add a member to a group (supports both individuals and nested groups).
   * - `remove-member`: Remove a member from a group (cascades delete for subgroups).
   * - `delete-entity`: Delete an entity and all its descendants.
   * - `resolve-duplicate`: Resolve potential duplicate entities.
   * - Custom events: Handled by registered event appliers.
   *
   * @param formDataParam The form submission containing the event data.
   * @returns The resulting entity after applying the event, or null if deletion occurred.
   * @throws {AppError} When validation fails or required data is missing.
   *
   * @example
   * Create an individual:
   * ```typescript
   * const individual = await service.submitForm({
   *   guid: uuidv4(),
   *   entityGuid: uuidv4(),
   *   type: 'create-individual',
   *   data: { name: 'John Doe', age: 30, email: 'john@example.com' },
   *   timestamp: new Date().toISOString(),
   *   userId: 'user-123',
   *   syncLevel: SyncLevel.LOCAL
   * });
   * ```
   *
   * @example
   * Create a group with members:
   * ```typescript
   * const group = await service.submitForm({
   *   guid: uuidv4(),
   *   entityGuid: uuidv4(),
   *   type: 'create-group',
   *   data: {
   *     name: 'Smith Family',
   *     members: [
   *       { guid: uuidv4(), name: 'John Smith', type: 'individual' },
   *       { guid: uuidv4(), name: 'Jane Smith', type: 'individual' }
   *     ]
   *   },
   *   timestamp: new Date().toISOString(),
   *   userId: 'user-123',
   *   syncLevel: SyncLevel.LOCAL
   * });
   * ```
   *
   * @example
   * Add member to existing group:
   * ```typescript
   * await service.submitForm({
   *   guid: uuidv4(),
   *   entityGuid: existingGroupId,
   *   type: 'add-member',
   *   data: {
   *     members: [{ guid: uuidv4(), name: 'Bob Smith', type: 'individual' }]
   *   },
   *   timestamp: new Date().toISOString(),
   *   userId: 'user-123',
   *   syncLevel: SyncLevel.LOCAL
   * });
   * ```
   */
  async submitForm(formDataParam: FormSubmission): Promise<EntityDoc | null> {
    try {
      const formData = cloneDeep(formDataParam);
      validateFormSubmission(formData);

      // Upcast event data from older schema versions if an upcaster service is available
      if (this.upcasterService) {
        formData.data = this.upcasterService.upcastEvent(
          formData.type,
          formData.schemaVersion,
          formData.data as Record<string, unknown>,
        ) as Record<string, unknown>;
      }

      // Get existing entity if it exists
      const entityGuid = formData.entityGuid;
      const entityPair = await this.entityStore.getEntity(entityGuid);

      const eventGuid = await this.eventStore.saveEvent(formData);

      const updatedEntity = await this.applyEventToEntity(formData, eventGuid, entityPair);

      // Enqueue the entity for asynchronous duplicate detection so the write
      // path is never blocked by the O(n) entity scan.
      if (updatedEntity?.guid && !this.isRemoteEvent(formData)) {
        this.duplicateDetectionService.enqueue(updatedEntity.guid, eventGuid);
      }

      return updatedEntity;
    } catch (error) {
      // Log error with full details for debugging
      log.error({ err: error }, "Error in submitForm");
      // Re-throw the error - don't suppress it
      throw error;
    }
  }

  /**
   * Replays an existing event from the event store against the entity store without
   * re-persisting the event. Used by ProjectionRebuildService to reconstruct entity
   * projections from the event log.
   *
   * @param formDataParam The event (FormSubmission) to replay.
   * @returns The resulting entity after applying the event, or null if deletion occurred.
   * @throws {AppError} When validation fails or required data is missing.
   */
  async replayEvent(formDataParam: FormSubmission): Promise<EntityDoc | null> {
    try {
      const formData = cloneDeep(formDataParam);
      validateFormSubmission(formData);

      // Upcast event data from older schema versions if an upcaster service is available
      if (this.upcasterService) {
        formData.data = this.upcasterService.upcastEvent(
          formData.type,
          formData.schemaVersion,
          formData.data as Record<string, unknown>,
        ) as Record<string, unknown>;
      }

      const entityGuid = formData.entityGuid;
      const entityPair = await this.entityStore.getEntity(entityGuid);
      const eventGuid = formData.guid;

      return await this.applyEventToEntity(formData, eventGuid, entityPair);
    } catch (error) {
      log.error({ err: error }, "Error in replayEvent");
      throw error;
    }
  }

  /**
   * Core event application logic shared by submitForm and replayEvent.
   * Applies the event to entity state without persisting the event itself.
   */
  private async applyEventToEntity(
    formData: FormSubmission,
    eventGuid: string,
    entityPair: EntityPair | null,
  ): Promise<EntityDoc | null> {
    const conflictResult = await this.handleIncomingConflict(entityPair, formData, eventGuid);

    if (conflictResult.resolution === "local-wins") {
      return conflictResult.entity;
    }

    const baseEntity = conflictResult.baseEntity ?? entityPair?.modified;
    const entityGuid = formData.entityGuid;

    let updatedEntity: EntityDoc | null = null;
    if (formData.type === "create-group" || formData.type === "update-group") {
      // log.debug(`Creating or updating group: ${JSON.stringify(formData)}`);
      updatedEntity = await this.createOrUpdateGroup(
        eventGuid,
        baseEntity as GroupDoc | undefined,
        formData,
      );
    } else if (formData.type === "create-individual" || formData.type === "update-individual") {
      // log.debug(`Creating or updating individual: ${JSON.stringify(formData)}`);
      updatedEntity = await this.createOrUpdateIndividual(
        eventGuid,
        baseEntity as IndividualDoc | undefined,
        formData,
      );
    } else if (formData.type === "create-record" || formData.type === "update-record") {
      updatedEntity = await this.createOrUpdateRecord(
        eventGuid,
        baseEntity as RecordDoc | undefined,
        formData,
      );
    } else if (formData.type === "add-member") {
      // log.debug(`Adding member: ${JSON.stringify(formData)}`);
      updatedEntity = await this.addMemberToGroup(eventGuid, entityGuid, formData);
    } else if (formData.type === "remove-member") {
      if (!formData.data.memberId) {
        throw new AppError("INVALID_MEMBER_DATA", "Member ID is required");
      }
      updatedEntity = await this.removeMemberFromGroup(eventGuid, formData);
    } else if (formData.type === "delete-entity") {
      // log.debug(`Deleting entity: ${JSON.stringify(formData)}`);
      await this.deleteEntity(entityPair, eventGuid, formData.userId);
    } else if (formData.type === "enrol-in-program") {
      updatedEntity = await this.enrolInProgram(eventGuid, entityGuid, formData);
    } else if (formData.type === "program-enrolment-applied") {
      updatedEntity = await this.applyProgramEnrolment(eventGuid, entityGuid, formData);
    } else if (formData.type === "resolve-duplicate") {
      log.debug(
        `Resolving duplicate: ${JSON.stringify(formData)} with shouldDelete: ${formData.data.shouldDelete}`,
      );
      await this.entityStore.resolvePotentialDuplicates(
        formData.data.duplicates as Array<{ entityGuid: string; duplicateGuid: string }>,
      );
      if (formData.data.shouldDelete) {
        await this.deleteEntity(entityPair, eventGuid, formData.entityGuid);
      }
    } else {
      const applier = this.getEventApplier(formData.type);
      if (!applier) {
        throw new Error(`No event applier found for event type: ${formData.type}`);
      }
      // log.debug(`Applying event: ${JSON.stringify(formData)}`);
      updatedEntity = await applier.apply(
        baseEntity || this.createNewEntity(entityGuid, formData),
        formData,
        async (entityId: string) => {
          return await this.entityStore.getEntity(entityId);
        },
        async (
          action: string,
          existingEntity: EntityDoc,
          modifiedEntity: EntityDoc,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          changes: Record<string, any>,
        ) => {
          await this.entityStore.saveEntity(existingEntity, modifiedEntity);
          await this.logAudit(formData.userId, action, eventGuid, modifiedEntity.guid, changes);
          return;
        },
      );
    }

    // After applying a remote event, reset the baseline so subsequent remote
    // events don't see stale differences and trigger false conflicts.
    if (updatedEntity && this.isRemoteEvent(formData)) {
      await this.entityStore.saveEntity(cloneDeep(updatedEntity), updatedEntity);
    }

    // log.debug(`Updated entity: ${JSON.stringify(updatedEntity)}`);

    return updatedEntity;
  }

  private async handleIncomingConflict(
    entityPair: EntityPair | null,
    formData: FormSubmission,
    eventGuid: string,
  ): Promise<ConflictResolutionResult> {
    if (!entityPair) {
      return { resolution: "no-conflict" };
    }

    if (!this.isRemoteEvent(formData)) {
      return { resolution: "no-conflict", baseEntity: entityPair.modified };
    }

    if (!this.hasLocalChanges(entityPair)) {
      return { resolution: "no-conflict", baseEntity: entityPair.modified };
    }

    const localTimestamp = this.parseTimestamp(entityPair.modified.lastUpdated);
    const remoteTimestamp = this.parseTimestamp(formData.timestamp);

    if (localTimestamp >= remoteTimestamp) {
      await this.logConflictResolution(eventGuid, entityPair.modified.guid, formData, "kept-local", {
        localLastUpdated: entityPair.modified.lastUpdated,
        remoteTimestamp: formData.timestamp,
        localVersion: entityPair.modified.version,
      });
      // Record the conflict in the ConflictService for tracking and review
      if (this.conflictService) {
        await this.conflictService.recordConflict({
          entityGuid: entityPair.modified.guid,
          tenantId: this.tenantId,
          localVersion: entityPair.modified.data as Record<string, unknown>,
          remoteVersion: formData.data as Record<string, unknown>,
          localEventGuid: eventGuid,
          remoteEventGuid: formData.guid,
        });
      }
      return { resolution: "local-wins", entity: entityPair.modified };
    }

    await this.logConflictResolution(eventGuid, entityPair.modified.guid, formData, "applied-remote", {
      localLastUpdated: entityPair.modified.lastUpdated,
      remoteTimestamp: formData.timestamp,
      localVersion: entityPair.modified.version,
    });
    // Record the conflict in the ConflictService for tracking and review
    if (this.conflictService) {
      await this.conflictService.recordConflict({
        entityGuid: entityPair.modified.guid,
        tenantId: this.tenantId,
        localVersion: entityPair.modified.data as Record<string, unknown>,
        remoteVersion: formData.data as Record<string, unknown>,
        localEventGuid: eventGuid,
        remoteEventGuid: formData.guid,
      });
    }

    const baseline = entityPair.initial ? cloneDeep(entityPair.initial) : cloneDeep(entityPair.modified);
    return { resolution: "remote-wins", baseEntity: baseline };
  }

  private isRemoteEvent(formData: FormSubmission): boolean {
    return formData.syncLevel === SyncLevel.REMOTE || formData.syncLevel === SyncLevel.EXTERNAL;
  }

  private hasLocalChanges(entityPair: EntityPair): boolean {
    if (entityPair.initial === null) {
      return true;
    }
    return entityPair.initial.version !== entityPair.modified.version;
  }

  private parseTimestamp(value?: string): number {
    if (!value) {
      return 0;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  private async logConflictResolution(
    eventGuid: string,
    entityGuid: string,
    formData: FormSubmission,
    resolution: "kept-local" | "applied-remote",
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.logAudit("system", "conflict-resolution", eventGuid, entityGuid, {
      resolution,
      eventType: formData.type,
      ...details,
    });
  }

  /**
   * Creates a new individual or updates an existing one based on form data.
   *
   * @param eventGuid GUID of the event triggering this operation.
   * @param existingIndividual Current individual entity, if any.
   * @param formData Form submission containing the changes.
   * @returns The updated individual entity.
   *
   * @private
   */
  private async createOrUpdateIndividual(
    eventGuid: string,
    existingIndividual: IndividualDoc | undefined,
    formData: FormSubmission,
  ): Promise<IndividualDoc> {
    validateFormSubmission(formData);
    const individual: IndividualDoc = existingIndividual
      ? cloneDeep(existingIndividual)
      : {
          id: formData.entityGuid,
          guid: formData.entityGuid,
          type: EntityType.Individual,
          name: formData.data._displayName || formData.data.name || "Unnamed Individual",
          version: 0,
          data: { name: "Unnamed Individual" },
          lastUpdated: new Date().toISOString(),
        };
    individual.data = { ...individual.data, ...formData.data };
    individual.name = individual.data._displayName || individual.data.name || individual.name;

    if (formData.data.externalId) {
      individual.externalId = formData.data.externalId;
    }

    individual.version += 1;
    individual.lastUpdated = new Date().toISOString();

    await this.entityStore.saveEntity(existingIndividual ?? cloneDeep(individual), individual);
    await this.logAudit(formData.userId, formData.type, eventGuid, individual.guid, formData.data);

    return individual;
  }

  /**
   * Creates a new record or updates an existing one based on form data.
   *
   * Records represent activity data (training, referral, home visit, assistance)
   * that are linked to an entity but are not themselves people or households.
   *
   * @param eventGuid GUID of the event triggering this operation.
   * @param existingRecord Current record entity, if any.
   * @param formData Form submission containing the changes.
   * @returns The updated record entity.
   *
   * @private
   */
  private async createOrUpdateRecord(
    eventGuid: string,
    existingRecord: RecordDoc | undefined,
    formData: FormSubmission,
  ): Promise<RecordDoc> {
    validateFormSubmission(formData);
    const record: RecordDoc = existingRecord
      ? cloneDeep(existingRecord)
      : {
          id: formData.entityGuid,
          guid: formData.entityGuid,
          type: EntityType.Record,
          name: formData.data.name || formData.data.entityName || "Unnamed Record",
          version: 0,
          data: { name: "Unnamed Record" },
          lastUpdated: new Date().toISOString(),
          parentEntityGuid: formData.data.parentId,
        };
    record.data = { ...record.data, ...formData.data };
    record.name = record.data.name || record.name;
    if (formData.data.parentId) {
      record.parentEntityGuid = formData.data.parentId;
    }

    record.version += 1;
    record.lastUpdated = new Date().toISOString();

    await this.entityStore.saveEntity(existingRecord ?? cloneDeep(record), record);
    await this.logAudit(formData.userId, formData.type, eventGuid, record.guid, formData.data);

    return record;
  }

  /**
   * Creates a new group or updates an existing one, including member management.
   *
   * This method handles complex group operations:
   * - Processes nested member creation (both individuals and subgroups).
   * - Maintains referential integrity in member relationships.
   *
   * @param eventGuid GUID of the event triggering this operation.
   * @param existingGroup Current group entity, if any.
   * @param formData Form submission containing the changes and member data.
   * @returns The updated group entity.
   *
   * @private
   */
  private async createOrUpdateGroup(
    eventGuid: string,
    existingGroup: GroupDoc | undefined,
    formData: FormSubmission,
  ): Promise<GroupDoc> {
    // log.debug(
    //   `Creating or updating group: ${JSON.stringify({
    //     existingGroup,
    //     formData,
    //   })}`,
    // );
    validateFormSubmission(formData);
    const group: GroupDoc = existingGroup
      ? cloneDeep(existingGroup)
      : {
          id: formData.entityGuid,
          guid: formData.entityGuid,
          type: EntityType.Group,
          name: formData.data._displayName || formData.data.name || "Unnamed Group",
          version: 0,
          data: formData.data,
          lastUpdated: new Date().toISOString(),
          memberIds: [],
        };

    group.name = formData.data._displayName || formData.data.name || group.name;
    group.data.name = group.name || "Unnamed Group";

    if (Array.isArray(formData.data?.members)) {
      // log.debug(`Processing members: ${JSON.stringify(formData.data.members)}`);
      const newMemberIds = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formData.data.members.map(async (member: Record<string, any>) => {
          if (!member.guid) {
            throw new Error("Member GUID is required");
          }

          const { guid: memberGuid, ...memberData } = member;

          if (memberData && memberData.type === "group") {
            const existingPair = await this.entityStore.getEntity(memberGuid);
            const existingGroup = existingPair?.modified as GroupDoc | undefined;
            const subGroup = await this.createOrUpdateGroup(eventGuid, existingGroup, {
              guid: uuidv4(),
              entityGuid: memberGuid,
              data: memberData,
              type: "create-group",
              timestamp: new Date().toISOString(),
              userId: formData.userId,
              syncLevel: SyncLevel.LOCAL,
            });
            return subGroup.guid;
          } else if (memberData) {
            const existingPair = await this.entityStore.getEntity(memberGuid);
            const existingIndividual = existingPair?.modified as IndividualDoc | undefined;
            const individualDoc = await this.createOrUpdateIndividual(eventGuid, existingIndividual, {
              guid: uuidv4(),
              entityGuid: memberGuid,
              data: memberData,
              type: "create-individual",
              timestamp: new Date().toISOString(),
              userId: formData.userId,
              syncLevel: SyncLevel.LOCAL,
            });
            return individualDoc.guid;
          } else {
            throw new Error("Invalid member data");
          }
        }),
      );
      group.memberIds = [...new Set([...group.memberIds, ...newMemberIds])];
    }

    if (formData.data.externalId) {
      group.externalId = formData.data.externalId;
    }

    group.data = { ...group.data, ...formData.data };
    group.version += 1;
    group.lastUpdated = new Date().toISOString();
    delete group.data.members;

    log.debug(`Saving group: ${JSON.stringify(group)}`);
    await this.entityStore.saveEntity(existingGroup ?? cloneDeep(group), group);
    await this.logAudit(formData.userId, formData.type, eventGuid, group.guid, formData.data);

    return group;
  }

  private createNewEntity(entityGuid: string, formData: FormSubmission): EntityDoc {
    const type =
      formData.type === "create-group"
        ? EntityType.Group
        : formData.type === "create-record"
          ? EntityType.Record
          : EntityType.Individual;
    return {
      id: entityGuid,
      guid: entityGuid,
      type,
      version: 1,
      data: { name: "Unnamed Entity" },
      lastUpdated: formData.timestamp,
    };
  }

  private removeFromGroupStructure(group: GroupDoc, memberId: string): GroupDoc {
    const updatedMemberIds = group.memberIds.filter((id) => id !== memberId);

    return {
      ...group,
      memberIds: updatedMemberIds,
      version: group.version + 1,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Removes a member from a group with cascading delete support.
   *
   * @param eventGuid GUID of the event triggering this operation.
   * @param formData Form submission containing the member ID to remove.
   * @returns The updated group entity.
   * @throws {AppError} When group doesn't exist or member ID is missing.
   *
   * @private
   */
  async removeMemberFromGroup(eventGuid: string, formData: FormSubmission): Promise<GroupDoc> {
    const groupId = formData.entityGuid;
    const memberId = formData.data.memberId;

    const groupPair = await this.entityStore.getEntity(groupId);
    if (!groupPair || groupPair.modified.type !== "group") {
      throw new AppError("INVALID_GROUP", `Group with ID ${groupId} not found or is not a group`);
    }
    const updatedGroup = this.removeFromGroupStructure(groupPair.modified as GroupDoc, memberId);

    log.debug({ updatedGroup }, "Updated group");
    await this.entityStore.saveEntity(groupPair.initial, updatedGroup);
    await this.logAudit(formData.userId, formData.type, eventGuid, groupId, formData.data);

    // Perform cascading delete for subgroups
    const memberToRemove = await this.entityStore.getEntity(memberId);
    if (memberToRemove && memberToRemove.modified.type === "group") {
      await this.cascadeDeleteEntity(memberId, eventGuid, formData.userId);
    }

    return updatedGroup;
  }

  /**
   * Adds a member (individual or subgroup) to an existing group.
   *
   * @param eventGuid GUID of the event triggering this operation.
   * @param groupId ID of the group to add the member to.
   * @param formData Form submission containing member data.
   * @returns The updated group entity.
   * @throws {AppError} When group doesn't exist or member data is invalid.
   *
   * @private
   */
  async addMemberToGroup(eventGuid: string, groupId: string, formData: FormSubmission): Promise<GroupDoc> {
    // log.debug(`Adding member to group: ${JSON.stringify({ groupId, formData })}`);
    const groupPair = await this.entityStore.getEntity(groupId);

    if (!groupPair || groupPair.modified.type !== "group") {
      throw new AppError("INVALID_GROUP", `Group with ID ${groupId} not found or is not a group`);
    }

    const group = groupPair.modified as GroupDoc;

    let rawMemberData;
    if (formData.data.members && Array.isArray(formData.data.members)) {
      rawMemberData = formData.data.members[0];
    } else {
      throw new AppError("INVALID_MEMBER_DATA", "Member data is missing or in an invalid format");
    }

    if (!rawMemberData.guid) {
      throw new AppError("INVALID_MEMBER_DATA", "Member GUID is missing");
    }

    const { guid, ...memberData } = rawMemberData;

    if (memberData.type === "group") {
      // Only create the sub-group if it doesn't already exist
      const existingGroupPair = await this.entityStore.getEntity(guid);
      if (!existingGroupPair) {
        const subGroupForm: FormSubmission = {
          guid: uuidv4(),
          type: "create-group",
          entityGuid: guid,
          data: memberData,
          timestamp: new Date().toISOString(),
          userId: formData.userId,
          syncLevel: SyncLevel.LOCAL,
        };
        await this.createOrUpdateGroup(eventGuid, undefined, subGroupForm);
      }
    } else {
      // Only create the individual if it doesn't already exist
      const existingMemberPair = await this.entityStore.getEntity(guid);
      if (!existingMemberPair) {
        await this.createOrUpdateIndividual(eventGuid, undefined, {
          ...formData,
          entityGuid: guid,
          type: "create-individual",
          data: memberData,
        });
      }
    }

    // Ensure memberIds is always an array
    if (!Array.isArray(group.memberIds)) {
      group.memberIds = [];
    }

    if (!group.memberIds.includes(guid)) {
      group.memberIds.push(guid);
      group.version += 1;
      group.lastUpdated = new Date().toISOString();
    }

    // log.debug(`Updated group: ${JSON.stringify(group)}`);
    await this.entityStore.saveEntity(groupPair.initial, group);
    await this.logAudit(formData.userId, formData.type, eventGuid, groupId, formData.data);

    return group;
  }

  /**
   * Recursively deletes an entity and all its dependent entities.
   *
   * This method implements cascading deletion to maintain referential integrity:
   * - For groups: recursively deletes all member entities first.
   * - For individuals: deletes the entity directly.
   *
   * @param entityGuid GUID of the entity to delete.
   * @param eventGuid GUID of the triggering deletion event.
   * @param userId ID of the user performing the deletion.
   *
   * @private
   */
  private async cascadeDeleteEntity(entityGuid: string, eventGuid: string, userId: string): Promise<void> {
    const entityPair = await this.entityStore.getEntity(entityGuid);
    if (entityPair && entityPair.modified.type === EntityType.Group) {
      const group = entityPair.modified as GroupDoc;
      for (const memberId of group.memberIds) {
        await this.cascadeDeleteEntity(memberId, eventGuid, userId);
      }
    }
    await this.entityStore.deleteEntity(entityGuid);
    await this.logAudit(userId, "cascade-delete-entity", eventGuid, entityGuid, {
      type: "cascade-delete-entity",
      entityGuid: entityGuid,
    });
  }

  private async deleteEntity(entityPair: EntityPair | null, eventGuid: string, userId: string): Promise<void> {
    if (!entityPair) {
      return;
    }
    await this.cascadeDeleteEntity(entityPair.modified.guid, eventGuid, userId);
  }

  /**
   * Stamp a pending program-enrolment intent on an entity. The adapter push
   * path reads `data.pendingProgramEnrolments[]` and emits one
   * `assign_program` ChangeRequest per entry against OpenSPP.
   *
   * Idempotent on `programId`: re-applying the same enrolment is a no-op.
   *
   * @param eventGuid    GUID of the triggering form submission.
   * @param entityGuid   Target entity (typically a household group).
   * @param formData     Form submission carrying `{ programId, programName? }`.
   * @returns The updated entity with the new pending-enrolment marker.
   *
   * @private
   */
  private async enrolInProgram(
    eventGuid: string,
    entityGuid: string,
    formData: FormSubmission,
  ): Promise<EntityDoc> {
    const programIdRaw = (formData.data as Record<string, unknown>).programId;
    const programId =
      typeof programIdRaw === "number"
        ? programIdRaw
        : typeof programIdRaw === "string"
          ? Number.parseInt(programIdRaw, 10)
          : NaN;
    if (!Number.isFinite(programId)) {
      throw new AppError(
        "INVALID_PROGRAM_ID",
        "Enrol-in-program event requires a numeric data.programId",
      );
    }
    const programName = (formData.data as Record<string, unknown>).programName;

    const entityPair = await this.entityStore.getEntity(entityGuid);
    if (!entityPair) {
      throw new AppError("ENTITY_NOT_FOUND", `Entity ${entityGuid} not found`);
    }

    const entity = entityPair.modified;
    const existing = (entity.data as Record<string, unknown>).pendingProgramEnrolments;
    const pending: Array<{ programId: number; programName?: string; enrolledAt: string }> =
      Array.isArray(existing)
        ? (existing as Array<{ programId: number; programName?: string; enrolledAt: string }>).slice()
        : [];

    if (pending.some((p) => p.programId === programId)) {
      // Already pending — keep idempotent, just log + audit.
      await this.logAudit(formData.userId, formData.type, eventGuid, entityGuid, {
        programId,
        skipped: true,
        reason: "already-pending",
      });
      return entity;
    }

    pending.push({
      programId,
      ...(typeof programName === "string" ? { programName } : {}),
      enrolledAt: formData.timestamp ?? new Date().toISOString(),
    });
    (entity.data as Record<string, unknown>).pendingProgramEnrolments = pending;
    entity.version += 1;
    entity.lastUpdated = new Date().toISOString();

    await this.entityStore.saveEntity(entityPair.initial, entity);
    await this.logAudit(formData.userId, formData.type, eventGuid, entityGuid, {
      programId,
      programName,
    });
    return entity;
  }

  /**
   * Project a server-applied program enrolment back onto an entity. Triggered
   * by the OpenSPP V2 adapter when a previously-submitted `assign_program`
   * ChangeRequest transitions to `applied` on OpenSPP. The mobile pending
   * chip flips to "enrolled" on the next sync because:
   *   - the matching `(programId)` entry is removed from
   *     `data.pendingProgramEnrolments[]`
   *   - the program is appended to `data.enrolledPrograms[]`
   *
   * Idempotent on `programId`: re-applying the same applied-event is a no-op
   * (the pending slot stays removed, the enrolled slot is not duplicated).
   * This matches the "test the second sync" rule — if a re-pull leaks the
   * same event, entity state is unchanged.
   *
   * Expected `formData.data` shape:
   *   `{ programId: number, programName?: string, appliedAt?: string,
   *      crId?: string, crName?: string }`
   *
   * @param eventGuid    GUID of the triggering form submission.
   * @param entityGuid   Target entity (typically a household group).
   * @param formData     Form submission carrying enrolment-applied metadata.
   * @returns The updated entity with pending slot removed + enrolled slot added.
   *
   * @private
   */
  private async applyProgramEnrolment(
    eventGuid: string,
    entityGuid: string,
    formData: FormSubmission,
  ): Promise<EntityDoc> {
    const data = formData.data as Record<string, unknown>;
    const programIdRaw = data.programId;
    const programId =
      typeof programIdRaw === "number"
        ? programIdRaw
        : typeof programIdRaw === "string"
          ? Number.parseInt(programIdRaw, 10)
          : NaN;
    if (!Number.isFinite(programId)) {
      throw new AppError(
        "INVALID_PROGRAM_ID",
        "program-enrolment-applied event requires a numeric data.programId",
      );
    }
    const programName = typeof data.programName === "string" ? data.programName : undefined;
    const appliedAt =
      typeof data.appliedAt === "string"
        ? data.appliedAt
        : (formData.timestamp ?? new Date().toISOString());
    const crId = typeof data.crId === "string" ? data.crId : undefined;
    const crName = typeof data.crName === "string" ? data.crName : undefined;

    const entityPair = await this.entityStore.getEntity(entityGuid);
    if (!entityPair) {
      throw new AppError("ENTITY_NOT_FOUND", `Entity ${entityGuid} not found`);
    }

    const entity = entityPair.modified;
    const entityData = entity.data as Record<string, unknown>;

    // Drop matching pending entry (idempotent: missing entry is fine).
    const pendingRaw = entityData.pendingProgramEnrolments;
    const pending: Array<{ programId: number; programName?: string; enrolledAt?: string }> =
      Array.isArray(pendingRaw)
        ? (pendingRaw as Array<{ programId: number; programName?: string; enrolledAt?: string }>)
            .filter((p) => p && typeof p === "object" && p.programId !== programId)
        : [];
    entityData.pendingProgramEnrolments = pending;

    // Add to enrolled list (idempotent on programId).
    const enrolledRaw = entityData.enrolledPrograms;
    const enrolled: Array<{
      programId: number;
      programName?: string;
      appliedAt: string;
      crId?: string;
      crName?: string;
    }> = Array.isArray(enrolledRaw)
      ? (enrolledRaw as Array<{
          programId: number;
          programName?: string;
          appliedAt: string;
          crId?: string;
          crName?: string;
        }>).slice()
      : [];

    if (!enrolled.some((p) => p.programId === programId)) {
      enrolled.push({
        programId,
        ...(programName ? { programName } : {}),
        appliedAt,
        ...(crId ? { crId } : {}),
        ...(crName ? { crName } : {}),
      });
    }
    entityData.enrolledPrograms = enrolled;

    entity.version += 1;
    entity.lastUpdated = new Date().toISOString();

    await this.entityStore.saveEntity(entityPair.initial, entity);
    await this.logAudit(formData.userId, formData.type, eventGuid, entityGuid, {
      programId,
      programName,
      appliedAt,
      crId,
      crName,
    });
    return entity;
  }

  /**
   * Creates and saves an audit log entry for tracking all system changes.
   *
   * @param userId ID of the user who performed the action.
   * @param action Type of action performed (e.g., 'create-individual').
   * @param eventGuid GUID of the related event/form submission.
   * @param entityGuid GUID of the entity that was affected.
   * @param changes Object containing the actual changes made.
   *
   * @private
   *
   * TODO: Implement cryptographic signature generation for tamper detection
   */
  private async logAudit(
    userId: string,
    action: string,
    eventGuid: string,
    entityGuid: string,
    changes: object,
  ): Promise<void> {
    const auditEntry: AuditLogEntry = {
      guid: uuidv4(),
      timestamp: new Date().toISOString(),
      userId,
      action,
      eventGuid,
      entityGuid,
      changes,
      signature: "", // TODO: Implement signature generation
    };
    await this.eventStore.logAuditEntry(auditEntry);
  }

  /**
   * Searches entities using the provided criteria.
   *
   * @param criteria Search criteria array with query conditions.
   * @returns Array of entity pairs matching the criteria.
   *
   * @example
   * ```typescript
   * // Search for adults
   * const adults = await service.searchEntities([
   *   { "data.age": { $gte: 18 } },
   *   { "type": "individual" }
   * ]);
   *
   * // Search for groups with specific name
   * const smithFamilies = await service.searchEntities([
   *   { "data.name": { $regex: /smith/i } },
   *   { "type": "group" }
   * ]);
   * ```
   */
  async searchEntities(criteria: SearchCriteria): Promise<EntityPair[]> {
    return await this.entityStore.searchEntities(criteria);
  }

}
