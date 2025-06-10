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
  SearchCriteria,
  SyncLevel,
} from "../interfaces/types";
import { AppError } from "../utils/AppError";

import { validateFormSubmission } from "../utils/formValidation";

/**
 * Service responsible for applying events (FormSubmissions) to entities in the event sourcing system.
 * 
 * The EventApplierService is the core component that transforms events into entity state changes.
 * It handles all standard entity operations (create, update, delete, add/remove members) and supports
 * custom event appliers for domain-specific operations.
 * 
 * Key features:
 * - **Event Processing**: Applies form submissions to create or modify entities
 * - **Custom Event Support**: Allows registration of custom event appliers
 * - **Audit Trail**: Maintains complete audit logs for all changes
 * - **Duplicate Detection**: Automatically flags potential duplicates during entity creation
 * - **Cascading Operations**: Handles complex operations like group member management
 * - **Data Validation**: Validates all form submissions before processing
 * 
 * Architecture:
 * - Uses the Strategy pattern for pluggable event appliers
 * - Maintains referential integrity for group-member relationships
 * - Generates audit entries for all state changes
 * - Integrates with duplicate detection algorithms
 * 
 * @example
 * Basic usage:
 * ```typescript
 * const service = new EventApplierService(
 *   'user-123',
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
  /** Logger instance for debugging and monitoring */
  private logger = console;
  /** Registry of custom event appliers mapped by event type */
  private eventAppliers: Map<string, EventApplier> = new Map();

  /**
   * Creates a new EventApplierService instance.
   * 
   * @param userId - Default user ID for system-generated events
   * @param eventStore - Store for managing events and audit logs
   * @param entityStore - Store for managing current entity state
   */
  constructor(
    private userId: string,
    private eventStore: EventStore,
    private entityStore: EntityStore,
  ) {}

  /**
   * Registers a custom event applier for a specific event type.
   * 
   * Allows extending the system with domain-specific event processing logic.
   * Custom appliers take precedence over built-in event handling.
   * 
   * @param eventType - The event type to handle (e.g., 'custom-verification')
   * @param applier - The event applier implementation
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
   * @param eventType - The event type to look up
   * @returns The event applier if registered, undefined otherwise
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
   * Processes a form submission to create or modify entities through the event sourcing system.
   * 
   * This is the main entry point for all entity operations. The method:
   * 1. Validates the form submission data
   * 2. Saves the event to the event store  
   * 3. Applies the event to create/update entities
   * 4. Logs audit entries for all changes
   * 5. Flags potential duplicates automatically
   * 
   * Supported event types:
   * - `create-group` / `update-group`: Create or modify group entities
   * - `create-individual` / `update-individual`: Create or modify individual entities
   * - `add-member`: Add a member to a group (supports both individuals and nested groups)
   * - `remove-member`: Remove a member from a group (cascades delete for subgroups)
   * - `delete-entity`: Delete an entity and all its descendants
   * - `resolve-duplicate`: Resolve potential duplicate entities
   * - Custom events: Handled by registered event appliers
   * 
   * @param formDataParam - The form submission containing the event data
   * @returns The resulting entity after applying the event, or null if deletion occurred
   * @throws {AppError} When validation fails or required data is missing
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
      this.logger.info(`Submitting form: ${JSON.stringify(formData)}`);
      validateFormSubmission(formData);

      // Get existing entity if it exists
      const entityGuid = formData.entityGuid;
      const entityPair = await this.entityStore.getEntity(entityGuid);

      const eventGuid = await this.eventStore.saveEvent(formData);

      let updatedEntity: EntityDoc | null = null;
      if (formData.type === "create-group" || formData.type === "update-group") {
        this.logger.debug(`Creating or updating group: ${JSON.stringify(formData)}`);
        updatedEntity = await this.createOrUpdateGroup(
          eventGuid,
          entityPair?.modified as GroupDoc | undefined,
          formData,
        );
      } else if (formData.type === "create-individual" || formData.type === "update-individual") {
        this.logger.debug(`Creating or updating individual: ${JSON.stringify(formData)}`);
        updatedEntity = await this.createOrUpdateIndividual(
          eventGuid,
          entityPair?.modified as IndividualDoc | undefined,
          formData,
        );
      } else if (formData.type === "add-member") {
        this.logger.debug(`Adding member: ${JSON.stringify(formData)}`);
        updatedEntity = await this.addMemberToGroup(eventGuid, entityGuid, formData);
      } else if (formData.type === "remove-member") {
        if (!formData.data.memberId) {
          throw new AppError("INVALID_MEMBER_DATA", "Member ID is required");
        }
        updatedEntity = await this.removeMemberFromGroup(eventGuid, formData);
      } else if (formData.type === "delete-entity") {
        this.logger.debug(`Deleting entity: ${JSON.stringify(formData)}`);
        await this.deleteEntity(entityPair, eventGuid, formData.userId);
      } else if (formData.type === "resolve-duplicate") {
        this.logger.debug(
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
        this.logger.debug(`Applying event: ${JSON.stringify(formData)}`);
        updatedEntity = await applier.apply(
          entityPair?.modified || this.createNewEntity(entityGuid, formData),
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

      this.logger.debug(`Updated entity: ${JSON.stringify(updatedEntity)}`);

      if (updatedEntity?.guid) {
        await this.flagPotentialDuplicate(updatedEntity.guid, eventGuid);
      }

      return updatedEntity;
    } catch (error) {
      console.log("Error in submitForm:", error);
      // this.logger.error(`Error in submitForm: ${error}`);
      throw error;
      // if (error instanceof AppError) throw error;
      // if (error instanceof Error) {
      //   throw new AppError('SUBMIT_FORM_ERROR', error.message, { formData, originalError: error });
      // }
      // throw new AppError('SUBMIT_FORM_ERROR', 'Failed to submit form', { formData, originalError: error });
    }
  }

  /**
   * Creates a new individual or updates an existing one based on form data.
   * 
   * This method handles the core logic for individual entity management:
   * - Creates new individuals with default values if none exist
   * - Merges form data with existing individual data
   * - Increments version number for optimistic concurrency control
   * - Updates timestamps and external IDs as needed
   * - Saves the entity and logs audit entries
   * 
   * @param eventGuid - GUID of the event triggering this operation
   * @param existingIndividual - Current individual entity, if any
   * @param formData - Form submission containing the changes
   * @returns The updated individual entity
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
          name: formData.data.name || "Unnamed Individual",
          version: 0,
          data: { name: "Unnamed Individual" },
          lastUpdated: new Date().toISOString(),
        };
    individual.data = { ...individual.data, ...formData.data };
    individual.name = individual.data.name || individual.name;

    if (formData.data.externalId) {
      individual.externalId = formData.data.externalId;
    }

    individual.version += 1;
    individual.lastUpdated = new Date().toISOString();

    await this.entityStore.saveEntity(existingIndividual || individual, individual);
    await this.logAudit(formData.userId, formData.type, eventGuid, individual.guid, formData.data);

    return individual;
  }

  /**
   * Creates a new group or updates an existing one, including member management.
   * 
   * This method handles complex group operations:
   * - Creates new groups with default values if none exist
   * - Processes nested member creation (both individuals and subgroups)
   * - Maintains referential integrity in member relationships
   * - Handles recursive group creation for nested structures
   * - Increments version numbers and updates timestamps
   * - Saves the entity and logs audit entries
   * 
   * @param eventGuid - GUID of the event triggering this operation
   * @param existingGroup - Current group entity, if any
   * @param formData - Form submission containing the changes and member data
   * @returns The updated group entity
   * 
   * @private
   */
  private async createOrUpdateGroup(
    eventGuid: string,
    existingGroup: GroupDoc | undefined,
    formData: FormSubmission,
  ): Promise<GroupDoc> {
    this.logger.debug(
      `Creating or updating group: ${JSON.stringify({
        existingGroup,
        formData,
      })}`,
    );
    validateFormSubmission(formData);
    const group: GroupDoc = existingGroup || {
      id: formData.entityGuid,
      guid: formData.entityGuid,
      type: EntityType.Group,
      name: formData.data.name || "Unnamed Group",
      version: 0,
      data: formData.data,
      lastUpdated: new Date().toISOString(),
      memberIds: [],
    };

    group.name = formData.data.name || group.name;
    group.data.name = group.name || "Unnamed Group";

    if (formData.data?.members) {
      this.logger.debug(`Processing members: ${JSON.stringify(formData.data.members)}`);
      const newMemberIds = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formData.data.members.map(async (member: Record<string, any>) => {
          if (!member.guid) {
            throw new Error("Member GUID is required");
          }

          const memberGuid = member.guid;
          delete member.guid;

          if (member && member.type === "group") {
            const subGroup = await this.createOrUpdateGroup(eventGuid, undefined, {
              guid: uuidv4(),
              entityGuid: memberGuid,
              data: member,
              type: "create-group",
              timestamp: new Date().toISOString(),
              userId: this.userId,
              syncLevel: SyncLevel.LOCAL,
            });
            return subGroup.guid;
          } else if (member) {
            const individualDoc = await this.createOrUpdateIndividual(eventGuid, undefined, {
              guid: uuidv4(),
              entityGuid: memberGuid,
              data: member,
              type: "create-individual",
              timestamp: new Date().toISOString(),
              userId: this.userId,
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

    this.logger.debug(`Saving group: ${JSON.stringify(group)}`);
    await this.entityStore.saveEntity(group, group);
    await this.logAudit(formData.userId, formData.type, eventGuid, group.guid, formData.data);

    return group;
  }

  private createNewEntity(entityGuid: string, formData: FormSubmission): EntityDoc {
    return {
      id: entityGuid,
      guid: entityGuid,
      type: formData.type === "create-group" ? EntityType.Group : EntityType.Individual,
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
   * This method handles member removal with:
   * - Validation of group existence and member ID
   * - Removal of member from the group's memberIds array
   * - Cascading deletion for subgroups (groups that are members)
   * - Version increment and timestamp updates
   * - Audit logging of the removal operation
   * 
   * @param eventGuid - GUID of the event triggering this operation
   * @param formData - Form submission containing the member ID to remove
   * @returns The updated group entity
   * @throws {AppError} When group doesn't exist or member ID is missing
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

    console.log("updated group", updatedGroup);
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
   * This method handles dynamic member addition with:
   * - Validation of group existence and member data
   * - Creation of new individual or subgroup entities as needed
   * - Prevention of duplicate member additions
   * - Maintenance of memberIds array integrity
   * - Audit logging of the membership change
   * 
   * @param eventGuid - GUID of the event triggering this operation
   * @param groupId - ID of the group to add the member to
   * @param formData - Form submission containing member data
   * @returns The updated group entity
   * @throws {AppError} When group doesn't exist or member data is invalid
   * 
   * @private
   */
  async addMemberToGroup(eventGuid: string, groupId: string, formData: FormSubmission): Promise<GroupDoc> {
    this.logger.debug(`Adding member to group: ${JSON.stringify({ groupId, formData })}`);
    const groupPair = await this.entityStore.getEntity(groupId);

    if (!groupPair || groupPair.modified.type !== "group") {
      throw new AppError("INVALID_GROUP", `Group with ID ${groupId} not found or is not a group`);
    }

    const group = groupPair.modified as GroupDoc;

    let memberData;
    if (formData.data.members && Array.isArray(formData.data.members)) {
      memberData = formData.data.members[0];
    } else {
      throw new AppError("INVALID_MEMBER_DATA", "Member data is missing or in an invalid format");
    }

    if (!memberData.guid) {
      throw new AppError("INVALID_MEMBER_DATA", "Member GUID is missing");
    }

    const guid = memberData.guid;
    delete memberData.guid;

    if (memberData.type === "group") {
      // If the new member is a group, create a new group
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
    } else {
      await this.createOrUpdateIndividual(eventGuid, undefined, {
        ...formData,
        entityGuid: guid,
        type: "create-individual",
        data: memberData,
      });
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

    this.logger.debug(`Updated group: ${JSON.stringify(group)}`);
    await this.entityStore.saveEntity(groupPair.initial, group);
    await this.logAudit(formData.userId, formData.type, eventGuid, groupId, formData.data);

    return group;
  }

  /**
   * Recursively deletes an entity and all its dependent entities.
   * 
   * This method implements cascading deletion to maintain referential integrity:
   * - For groups: recursively deletes all member entities first
   * - For individuals: deletes the entity directly
   * - Logs audit entries for each deletion
   * - Ensures no orphaned references remain in the system
   * 
   * This prevents broken references when groups containing subgroups are deleted.
   * 
   * @param entityGuid - GUID of the entity to delete
   * @param eventGuid - GUID of the triggering deletion event
   * @param userId - ID of the user performing the deletion
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

  // private createDataMember(member: EntityDoc): any {
  //   const baseMember = {
  //     id: member.guid,
  //     ...member.data,
  //   };

  //   if (member.type === "group") {
  //     const groupMember = member as GroupDoc;
  //     return {
  //       ...baseMember,
  //       members: groupMember.data.members ? groupMember.data.members.map((m: any) => this.createDataMember(m)) : [],
  //     };
  //   }

  //   return baseMember;
  // }

  // private async applyEvents(entity: EntityDoc): Promise<EntityDoc> {
  //   const events = await this.eventStore.getEvents(entity.guid, entity.version);
  //   let updatedEntity = { ...entity };

  //   if (Array.isArray(events)) {
  //     for (const event of events) {
  //       const applier = this.getEventApplier(event.type);
  //       if (applier) {
  //         updatedEntity = await applier.apply(updatedEntity, event, this.submitForm);
  //       }
  //     }
  //   } else {
  //     this.logger.warn(`No events found for entity ${entity.guid}`);
  //   }

  //   return updatedEntity;
  // }

  // async resolveDuplicate(
  //   entityGuid: string,
  //   duplicateId: string,
  //   resolution: "keep" | "merge" | "delete"
  // ): Promise<void> {
  //   const [entity1, entity2] = await Promise.all([this.getEntity(entityGuid), this.getEntity(duplicateId)]);

  //   switch (resolution) {
  //     case "keep":
  //       await this.entityStore.deleteEntity(duplicateId);
  //       break;
  //     case "merge":
  //       const mergedEntity = this.mergeEntities(entity1.modified, entity2.modified);
  //       await this.entityStore.saveEntity(entity1.initial, mergedEntity);
  //       await this.entityStore.deleteEntity(duplicateId);
  //       break;
  //     case "delete":
  //       await this.entityStore.deleteEntity(entityGuid);
  //       break;
  //   }

  //   const flaggedDuplicates = await this.entityStore.getFlaggedDuplicates();
  //   const updatedFlaggedDuplicates = flaggedDuplicates.filter(
  //     (item) => !(item.entityGuid === entityGuid && item.duplicateId === duplicateId)
  //   );
  //   await this.entityStore.saveFlaggedDuplicates(updatedFlaggedDuplicates);
  //   await this.logAudit("resolveDuplicate", entityGuid, { duplicateId, resolution }, "system");
  // }

  // async exportData(format: "json" | "binary"): Promise<Buffer> {
  //   return this.exportImportManager.exportData(format);
  // }

  // async importData(data: Buffer): Promise<ImportResult> {
  //   return this.exportImportManager.importData(data);
  // }

  /**
   * Creates and saves an audit log entry for tracking all system changes.
   * 
   * This method generates comprehensive audit trails by:
   * - Creating unique audit entry GUIDs
   * - Recording timestamps, user IDs, and action types
   * - Linking audit entries to their triggering events
   * - Capturing the specific changes made to entities
   * - Supporting tamper-evident logging (signature field for future use)
   * 
   * Audit logs provide complete traceability for compliance and debugging.
   * 
   * @param userId - ID of the user who performed the action
   * @param action - Type of action performed (e.g., 'create-individual')
   * @param eventGuid - GUID of the related event/form submission
   * @param entityGuid - GUID of the entity that was affected
   * @param changes - Object containing the actual changes made
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

  // async handleLinkedRecord(entityGuid: string, linkedRecord: LinkedRecord): Promise<void> {
  //   try {
  //     const entityPair = await this.entityStore.getEntity(entityGuid);
  //     if (!entityPair) {
  //       throw new AppError("ENTITY_NOT_FOUND", `Entity with ID ${entityGuid} not found`);
  //     }

  //     const updatedEntity = {
  //       ...entityPair.modified,
  //       linkedRecords: [...entityPair.modified.linkedRecords, linkedRecord],
  //     };

  //     await this.entityStore.saveEntity(entityPair.initial, updatedEntity);
  //     await this.logAudit("addLinkedRecord", entityGuid, { linkedRecordId: linkedRecord.guid }, "system");
  //   } catch (error) {
  //     if (error instanceof AppError) throw error;
  //     throw new AppError("LINKED_RECORD_ERROR", `Failed to handle linked record for entity ${entityGuid}`, {
  //       entityGuid,
  //       linkedRecord,
  //       originalError: error,
  //     });
  //   }
  // }

  /**
   * Searches entities using the provided criteria.
   * 
   * Delegates to the EntityStore's search functionality to find entities
   * matching the specified criteria.
   * 
   * @param criteria - Search criteria array with query conditions
   * @returns Array of entity pairs matching the criteria
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
  async searchEntities(criteria: SearchCriteria): Promise<{ initial: EntityDoc; modified: EntityDoc }[]> {
    return await this.entityStore.searchEntities(criteria);
  }

  // async createOrModifyGroups(groupData: FormSubmission[]): Promise<GroupDoc[]> {
  //   const createdGroups: GroupDoc[] = [];
  //   for (const data of groupData) {
  //     const group = (await this.submitForm(data)) as GroupDoc;
  //     if (group.type === "group") {
  //       group.name = data.name || "Unnamed Group"; // Ensure name is set
  //       if (data.members && data.members.length > 0) {
  //         for (const memberData of data.members) {
  //           if (memberData.type === "group") {
  //             const [subGroup] = await this.createOrModifyGroups([memberData]);
  //             await this.addMemberToGroup(group.guid, subGroup.guid as string);
  //           } else {
  //             const member = (await this.submitForm(memberData)) as IndividualDoc;
  //             await this.addMemberToGroup(group.guid, member.guid as string);
  //           }
  //         }
  //       }
  //       createdGroups.push(group);
  //     } else {
  //       console.warn(`Entity ${group.guid} is not a group`);
  //     }
  //   }
  //   return createdGroups;
  // }

  /**
   * Automatically flags potential duplicate entities based on data similarity.
   * 
   * This method implements intelligent duplicate detection by:
   * - Extracting searchable fields from entity data
   * - Building search criteria from non-empty values
   * - Finding entities with similar data patterns
   * - Flagging potential duplicates for manual review
   * - Logging duplicate detection events for audit trails
   * 
   * The duplicate detection helps maintain data quality by identifying
   * entities that may represent the same real-world person or group.
   * 
   * @param entityGuid - GUID of the entity to check for duplicates
   * @param eventGuid - GUID of the event that created/updated the entity
   * 
   * @private
   */
  private async flagPotentialDuplicate(entityGuid: string, eventGuid: string): Promise<void> {
    const entity = await this.entityStore.getEntity(entityGuid);
    if (!entity) {
      throw new AppError("ENTITY_NOT_FOUND", `Entity with GUID ${entityGuid} not found`);
    }

    if (!entity.modified.data) {
      this.logger.warn(`Entity ${entityGuid} has no data property, skipping duplicate check`);
      return;
    }

    // Flatten the nested data structure and extract searchable fields
    const searchableFields = this.extractSearchableFields(entity.modified.data);
    if (Object.keys(searchableFields).length === 0) {
      this.logger.warn(`No searchable fields found for entity ${entityGuid}, skipping duplicate check`);
      return;
    }

    const searchCriteria = Object.entries(searchableFields)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .filter(([_, value]) => value !== null && value !== undefined && value !== "")
      .map(([key, value]) => ({ [key]: value }));

    const potentialDuplicates = await this.searchEntities(searchCriteria);

    for (const duplicate of potentialDuplicates) {
      if (duplicate.initial.guid !== entityGuid) {
        await this.entityStore.savePotentialDuplicates([{ entityGuid, duplicateGuid: duplicate.modified.guid }]);
        this.logger.info(`Flagging potential duplicate: ${duplicate.modified.guid}`);
        await this.logAudit("system", "flag-potential-duplicate", eventGuid, entityGuid, {
          entityId: entityGuid,
          duplicateId: duplicate.modified.guid,
        });
      }
    }
  }

  /**
   * Extracts searchable fields from entity data for duplicate detection.
   * 
   * This method recursively processes entity data to extract primitive values
   * that can be used for similarity matching. It:
   * - Flattens nested object structures using dot notation
   * - Excludes arrays and complex objects from search criteria
   * - Filters out null, undefined, and empty string values
   * - Creates field paths like "data.address.street" for nested properties
   * 
   * @param data - The entity data object to process
   * @returns Flattened object with searchable field paths and values
   * 
   * @private
   * 
   * @example
   * Input: { name: "John", address: { street: "123 Main", city: "Boston" } }
   * Output: { name: "John", "address.street": "123 Main", "address.city": "Boston" }
   */
  private extractSearchableFields(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Helper function to recursively extract primitive values
    const extractFields = (obj: unknown, prefix = ""): void => {
      if (!obj || typeof obj !== "object") {
        return;
      }

      Object.entries(obj as Record<string, unknown>).forEach(([key, value]) => {
        const fieldPath = prefix ? `${prefix}.${key}` : key;

        if (value !== null && value !== undefined && value !== "") {
          if (typeof value === "object" && !Array.isArray(value)) {
            // Recursively process nested objects
            extractFields(value, fieldPath);
          } else if (!Array.isArray(value)) {
            // Only include primitive values (excluding arrays)
            result[fieldPath] = value;
          }
        }
      });
    };

    extractFields(data);
    return result;
  }
}
