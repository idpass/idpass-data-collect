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

import { v4 as uuidv4 } from "uuid";
import {
  AuditLogEntry,
  DetailEntityDoc,
  DetailGroupDoc,
  EntityDoc,
  EntityStore,
  EventStore,
  FormSubmission,
  GroupDoc,
  SearchCriteria,
  SyncLevel,
  ExternalSyncCredentials,
  PasswordCredentials,
  TokenCredentials,
} from "../interfaces/types";
import { EventApplierService } from "../services/EventApplierService";
import { AppError } from "../utils/AppError";
import { ExternalSyncManager } from "./ExternalSyncManager";
import { InternalSyncManager } from "./InternalSyncManager";
import { AuthManager } from "./AuthManager";

// const MAX_GROUP_DEPTH = 5; // Maximum allowed depth for nested groups

/**
 * Primary API interface for the ID PASS DataCollect library.
 *
 * The EntityDataManager orchestrates all data operations including:
 * - Form submission and event processing
 * - Entity creation, modification, and querying
 * - Data synchronization with remote servers and external systems
 * - Audit trail management and duplicate detection
 *
 * This class implements the Command Query Responsibility Segregation (CQRS) pattern,
 * where all changes go through events (FormSubmissions) and queries access the
 * current state through the EntityStore.
 *
 * @example
 * Basic usage:
 * ```typescript
 * import { EntityDataManager, EntityType, SyncLevel } from 'idpass-data-collect';
 *
 * // Initialize the manager (typically done once)
 * const manager = new EntityDataManager(
 *   eventStore,
 *   entityStore,
 *   eventApplierService,
 *   externalSyncManager,
 *   internalSyncManager
 * );
 *
 * // Create a new individual
 * const individual = await manager.submitForm({
 *   guid: uuidv4(),
 *   entityGuid: uuidv4(),
 *   type: 'create-individual',
 *   data: { name: 'John Doe', age: 30 },
 *   timestamp: new Date().toISOString(),
 *   userId: 'user-123',
 *   syncLevel: SyncLevel.LOCAL
 * });
 *
 * // Create a household group
 * const group = await manager.submitForm({
 *   guid: uuidv4(),
 *   entityGuid: uuidv4(),
 *   type: 'create-group',
 *   data: { name: 'Smith Family' },
 *   timestamp: new Date().toISOString(),
 *   userId: 'user-123',
 *   syncLevel: SyncLevel.LOCAL
 * });
 *
 * // Add individual to group
 * await manager.submitForm({
 *   guid: uuidv4(),
 *   entityGuid: group.guid,
 *   type: 'add-member',
 *   data: { members: [{ guid: individual.guid, name: individual.data.name }] },
 *   timestamp: new Date().toISOString(),
 *   userId: 'user-123',
 *   syncLevel: SyncLevel.LOCAL
 * });
 * ```
 *
 * @example
 * Offline-first usage:
 * ```typescript
 * // Works completely offline
 * const offlineManager = new EntityDataManager(
 *   eventStore,
 *   entityStore,
 *   eventApplierService
 *   // No sync managers - offline only
 * );
 *
 * // All operations work locally
 * const entity = await offlineManager.submitForm(formData);
 * const allEntities = await offlineManager.getAllEntities();
 * ```
 *
 * @example
 * With synchronization:
 * ```typescript
 * // Sync with remote server
 * if (manager.hasInternalSyncManager()) {
 *   await manager.sync();
 * }
 *
 * // Check sync status
 * if (manager.isSyncing()) {
 *   console.log('Sync in progress...');
 * }
 * ```
 */
export class EntityDataManager {
  private logger = console; // You can replace this with a more sophisticated logger if needed

  /**
   * Creates a new EntityDataManager instance.
   *
   * @param eventStore - Store for managing events/form submissions
   * @param entityStore - Store for managing current entity state
   * @param eventApplierService - Service for applying events to entities
   * @param externalSyncManager - Optional manager for external system sync
   * @param internalSyncManager - Optional manager for server sync
   */
  constructor(
    private eventStore: EventStore,
    private entityStore: EntityStore,
    private eventApplierService: EventApplierService,
    private externalSyncManager?: ExternalSyncManager,
    private internalSyncManager?: InternalSyncManager,
    private authManager?: AuthManager,
  ) {}

  /**
   * Checks if a synchronization operation is currently in progress.
   *
   * @returns True if sync is active, false otherwise
   */
  isSyncing(): boolean {
    if (this.internalSyncManager) {
      return this.internalSyncManager.isSyncing;
    }
    return false;
  }

  /**
   * Submits a form to create or modify entities through the event sourcing system.
   *
   * This is the primary method for making changes to entities. All modifications
   * go through events (FormSubmissions) which are applied to create the new state.
   *
   * @param formData - The form submission containing the event data
   * @returns The resulting entity after applying the event, or null if creation failed
   *
   * @example
   * ```typescript
   * // Create a new individual
   * const individual = await manager.submitForm({
   *   guid: uuidv4(),
   *   entityGuid: uuidv4(),
   *   type: 'create-individual',
   *   data: { name: 'John Doe', age: 30, email: 'john@example.com' },
   *   timestamp: new Date().toISOString(),
   *   userId: 'user-123',
   *   syncLevel: SyncLevel.LOCAL
   * });
   *
   * // Update an existing individual
   * const updated = await manager.submitForm({
   *   guid: uuidv4(),
   *   entityGuid: individual.guid,
   *   type: 'update-individual',
   *   data: { age: 31 }, // Only changed fields
   *   timestamp: new Date().toISOString(),
   *   userId: 'user-123',
   *   syncLevel: SyncLevel.LOCAL
   * });
   * ```
   */
  async submitForm(formData: FormSubmission): Promise<EntityDoc | null> {
    return await this.eventApplierService.submitForm(formData);
  }

  /**
   * Retrieves all events (form submissions) from the event store.
   *
   * Provides access to the complete audit trail of all changes made to entities.
   * Events are returned in chronological order.
   *
   * @returns Array of all form submissions/events
   *
   * @example
   * ```typescript
   * const events = await manager.getAllEvents();
   *
   * // Filter events by type
   * const createEvents = events.filter(e => e.type.startsWith('create-'));
   *
   * // Filter events by user
   * const userEvents = events.filter(e => e.userId === 'user-123');
   *
   * // Filter events by entity
   * const entityEvents = events.filter(e => e.entityGuid === 'entity-456');
   * ```
   */
  async getAllEvents(): Promise<FormSubmission[]> {
    return await this.eventStore.getAllEvents();
  }

  /**
   * Retrieves all entities from the entity store.
   *
   * Returns EntityPairs containing both the initial state (when first loaded/synced)
   * and the current modified state. This enables change tracking and conflict resolution.
   *
   * @returns Array of entity pairs with initial and current state
   *
   * @example
   * ```typescript
   * const entities = await manager.getAllEntities();
   *
   * // Find entities that have been modified locally
   * const modifiedEntities = entities.filter(pair =>
   *   pair.initial.version !== pair.modified.version
   * );
   *
   * // Get only individuals
   * const individuals = entities.filter(pair =>
   *   pair.modified.type === EntityType.Individual
   * );
   *
   * // Get only groups
   * const groups = entities.filter(pair =>
   *   pair.modified.type === EntityType.Group
   * );
   * ```
   */
  async getAllEntities(): Promise<{ initial: EntityDoc; modified: EntityDoc }[]> {
    return await this.entityStore.getAllEntities();
  }

  /**
   * Retrieves a specific entity by its internal database ID.
   *
   * For groups, this method automatically loads member details to provide
   * a complete view of the group structure.
   *
   * @param id - Internal database ID of the entity
   * @returns Entity pair with initial and current state
   * @throws {AppError} When entity is not found
   *
   * @example
   * ```typescript
   * try {
   *   const entityPair = await manager.getEntity('entity-123');
   *
   *   console.log('Original state:', entityPair.initial);
   *   console.log('Current state:', entityPair.modified);
   *
   *   // Check if entity has been modified
   *   const hasChanges = entityPair.initial.version !== entityPair.modified.version;
   *
   *   if (entityPair.modified.type === EntityType.Group) {
   *     const group = entityPair.modified as GroupDoc;
   *     console.log('Group members:', group.memberIds);
   *   }
   * } catch (error) {
   *   if (error instanceof AppError && error.code === 'ENTITY_NOT_FOUND') {
   *     console.log('Entity does not exist');
   *   }
   * }
   * ```
   */
  async getEntity(id: string): Promise<{ initial: EntityDoc; modified: EntityDoc }> {
    try {
      const entityPair = await this.entityStore.getEntity(id);
      if (!entityPair) {
        throw new AppError("ENTITY_NOT_FOUND", `Entity with ID ${id} not found`);
      }

      this.logger.debug(`Retrieved entity pair: ${JSON.stringify(entityPair)}`);

      const updatedEntity = entityPair.modified;

      this.logger.debug(`Updated entity after applying events: ${JSON.stringify(updatedEntity)}`);

      if (updatedEntity.type === "group") {
        const groupWithDetails = await this.loadGroupDetails(updatedEntity as GroupDoc);
        this.logger.debug(`Group with loaded details: ${JSON.stringify(groupWithDetails)}`);
        return {
          initial: entityPair.initial,
          modified: groupWithDetails,
        };
      }

      return { initial: entityPair.initial, modified: updatedEntity };
    } catch (error) {
      this.logger.error(`Error in getEntity: ${error}`);
      throw error;
      //   if (error instanceof Error) {
      //     this.logger.error(`Error stack: ${error.stack}`);
      //   }
      //   throw new AppError('GET_ENTITY_ERROR', `Failed to get entity with ID ${id}`, { id, originalError: error });
    }
  }

  /**
   * Loads detailed information for a group including member data.
   *
   * Private helper method that recursively loads member information
   * and handles missing members by automatically updating the group.
   *
   * @param group - The group document to load details for
   * @returns Detailed group document with loaded member information
   *
   * @private
   *
   * TODO: Consider making the missing member cleanup optional
   * TODO: Add depth limit to prevent infinite recursion in nested groups
   */
  private async loadGroupDetails(group: GroupDoc): Promise<DetailGroupDoc> {
    this.logger.debug(`Loading group details for group: ${group.id}`);
    if (!group.memberIds || group.memberIds.length === 0) {
      return group as DetailGroupDoc;
    }
    const memberResults = await Promise.all(
      group.memberIds.map(async (memberId): Promise<DetailEntityDoc | DetailGroupDoc> => {
        const memberPair = await this.entityStore.getEntity(memberId);
        this.logger.debug(`Fetched member: ${memberId}, ${JSON.stringify(memberPair)}`);
        if (!memberPair) {
          this.logger.warn(`Member ${memberId} not found`);
          return { id: memberId, missing: true } as DetailEntityDoc;
        }
        const member = memberPair.modified;
        return {
          ...(member.type === "group"
            ? {
                memberCount: (member as GroupDoc).memberIds?.length || 0,
                memberIds: (member as GroupDoc).memberIds,
              }
            : {}),
          ...member,
        } as DetailEntityDoc | DetailGroupDoc;
      }),
    );

    const loadedMembers = memberResults.filter((member) => !member.missing);
    const missingMembers = memberResults.filter((member) => member.missing);

    this.logger.debug(`Loaded members: ${JSON.stringify(loadedMembers)}`);
    if (missingMembers.length > 0) {
      this.logger.warn(`Missing members: ${JSON.stringify(missingMembers)}`);
      // update members to remove missing members
      const updatedGroup = {
        ...group,
        memberIds: loadedMembers.map((member) => member.id),
      };
      await this.eventApplierService.submitForm({
        type: "update-group",
        guid: uuidv4(),
        entityGuid: group.id,
        data: updatedGroup,
        userId: "system",
        timestamp: new Date().toISOString(),
        syncLevel: SyncLevel.LOCAL,
      });
    }

    return {
      ...group,
      memberCount: loadedMembers.length,
      members: loadedMembers,
    };
  }

  /**
   * Retrieves all members of a specific group.
   *
   * @param groupId - Internal database ID of the group
   * @returns Array of entity pairs for all group members
   * @throws {AppError} When group is not found or entity is not a group
   *
   * @example
   * ```typescript
   * try {
   *   const members = await manager.getMembers('group-123');
   *   console.log(`Group has ${members.length} members`);
   *
   *   members.forEach(member => {
   *     console.log(`Member: ${member.modified.data.name}`);
   *   });
   * } catch (error) {
   *   if (error instanceof AppError && error.code === 'INVALID_GROUP') {
   *     console.log('Group not found or invalid');
   *   }
   * }
   * ```
   */
  async getMembers(groupId: string): Promise<{ initial: EntityDoc; modified: EntityDoc }[]> {
    const groupPair = await this.entityStore.getEntity(groupId);
    if (!groupPair || groupPair.modified.type !== "group") {
      throw new AppError("INVALID_GROUP", `Group with ID ${groupId} not found or is not a group`);
    }
    const modified = groupPair.modified as GroupDoc;
    const members = await Promise.all(modified.memberIds.map((id) => this.entityStore.getEntity(id)));
    return members.filter((pair): pair is NonNullable<typeof pair> => pair !== null && pair.modified !== null);
  }

  /**
   * Checks if there are any unsynced events waiting to be synchronized.
   *
   * Only available when an InternalSyncManager is configured.
   *
   * @returns True if there are unsynced events, false otherwise
   *
   * @example
   * ```typescript
   * if (await manager.hasUnsyncedEvents()) {
   *   console.log('There are changes waiting to sync');
   *   await manager.syncWithSyncServer();
   * }
   * ```
   */
  async hasUnsyncedEvents(): Promise<boolean> {
    if (this.internalSyncManager) {
      return await this.internalSyncManager.hasUnsyncedEvents();
    }
    return false;
  }

  /**
   * Gets the count of unsynced events waiting to be synchronized.
   *
   * Only available when an InternalSyncManager is configured.
   *
   * @returns Number of unsynced events
   *
   * @example
   * ```typescript
   * const count = await manager.getUnsyncedEventsCount();
   * console.log(`${count} events waiting to sync`);
   *
   * if (count > 100) {
   *   console.log('Large number of changes - consider syncing soon');
   * }
   * ```
   */
  async getUnsyncedEventsCount(): Promise<number> {
    if (this.internalSyncManager) {
      return await this.internalSyncManager.getUnsyncedEventsCount();
    }
    return 0;
  }

  /**
   * Synchronizes local data with the remote sync server.
   *
   * Performs a full bidirectional sync: pushes local changes to server
   * and pulls remote changes to local storage.
   *
   * Only available when an InternalSyncManager is configured.
   *
   * @throws {AppError} When sync fails or authentication is required
   *
   * @example
   * ```typescript
   * try {
   *   console.log('Starting sync...');
   *   await manager.syncWithSyncServer();
   *   console.log('Sync completed successfully');
   * } catch (error) {
   *   console.error('Sync failed:', error.message);
   * }
   * ```
   */
  async syncWithSyncServer(): Promise<void> {
    if (this.internalSyncManager) {
      await this.internalSyncManager.sync();
    }
  }

  /**
   * Searches entities using specified criteria.
   *
   * Provides flexible querying capabilities for finding entities based
   * on their data properties, type, or other attributes.
   *
   * @param criteria - Search criteria array with query conditions
   * @returns Array of entity pairs matching the criteria
   *
   * @example
   * ```typescript
   * // Search for adults
   * const adults = await manager.searchEntities([
   *   { "age": { $gte: 18 } },
   *   { "type": "individual" }
   * ]);
   *
   * // Search for groups with specific name
   * const smithFamilies = await manager.searchEntities([
   *   { "name": { $regex: /smith/i } },
   *   { "type": "group" }
   * ]);
   *
   * // TODO: Document the exact query syntax supported
   * ```
   */
  async searchEntities(criteria: SearchCriteria): Promise<{ initial: EntityDoc; modified: EntityDoc }[]> {
    return await this.entityStore.searchEntities(criteria);
  }

  /**
   * Retrieves the complete audit trail for a specific entity.
   *
   * Returns all audit log entries related to an entity, providing
   * a complete history of changes with timestamps and user information.
   *
   * @param entityGuid - Global unique identifier of the entity
   * @returns Array of audit log entries in chronological order
   * @throws {AppError} When audit trail retrieval fails
   *
   * @example
   * ```typescript
   * try {
   *   const auditTrail = await manager.getAuditTrailByEntityGuid('entity-123');
   *
   *   console.log(`Found ${auditTrail.length} audit entries`);
   *   auditTrail.forEach(entry => {
   *     console.log(`${entry.timestamp}: ${entry.action} by ${entry.userId}`);
   *   });
   * } catch (error) {
   *   if (error instanceof AppError && error.code === 'AUDIT_TRAIL_ERROR') {
   *     console.error('Failed to retrieve audit trail');
   *   }
   * }
   * ```
   */
  async getAuditTrailByEntityGuid(entityGuid: string): Promise<AuditLogEntry[]> {
    try {
      return await this.eventStore.getAuditTrailByEntityGuid(entityGuid);
    } catch (error) {
      throw new AppError("AUDIT_TRAIL_ERROR", `Failed to retrieve audit trail for entity ${entityGuid}`, {
        entityGuid,
        originalError: error,
      });
    }
  }

  // async verifyIntegrity(entityGuid: string): Promise<boolean> {
  //   try {
  //     const events = await this.eventStore.getEvents(entityGuid, 0);
  //     for (const event of events) {
  //       const proof = this.eventStore.getProof(event);
  //       if (!this.eventStore.verifyEvent(event, proof)) {
  //         throw new AppError("INTEGRITY_VIOLATION", `Integrity violation detected for entity ${entityGuid}`, {
  //           entityGuid,
  //           event,
  //         });
  //       }
  //     }
  //     return true;
  //   } catch (error) {
  //     if (error instanceof AppError) throw error;
  //     throw new AppError("INTEGRITY_CHECK_ERROR", `Failed to verify integrity for entity ${entityGuid}`, {
  //       entityGuid,
  //       originalError: error,
  //     });
  //   }
  // }

  /**
   * Retrieves events created since a specific timestamp.
   *
   * Useful for incremental sync operations and change tracking.
   *
   * @param timestamp - ISO timestamp to filter events from
   * @returns Array of events created after the specified timestamp
   *
   * @example
   * ```typescript
   * const lastSync = '2024-01-01T00:00:00Z';
   * const recentEvents = await manager.getEventsSince(lastSync);
   *
   * console.log(`${recentEvents.length} events since last sync`);
   * recentEvents.forEach(event => {
   *   console.log(`${event.timestamp}: ${event.type} on ${event.entityGuid}`);
   * });
   * ```
   */
  async getEventsSince(timestamp: string): Promise<FormSubmission[]> {
    return await this.eventStore.getEventsSince(timestamp);
  }

  /**
   * Retrieves events since a timestamp with pagination support.
   *
   * More efficient than getEventsSince for large datasets as it supports
   * pagination to avoid loading too many events at once.
   *
   * @param timestamp - ISO timestamp to filter events from
   * @param limit - Maximum number of events to return (default: 10)
   * @returns Object with events array and cursor for next page
   *
   * @example
   * ```typescript
   * let cursor = '2024-01-01T00:00:00Z';
   * let allEvents: FormSubmission[] = [];
   *
   * do {
   *   const result = await manager.getEventsSincePagination(cursor, 50);
   *   allEvents.push(...result.events);
   *   cursor = result.nextCursor;
   * } while (cursor);
   *
   * console.log(`Retrieved ${allEvents.length} events total`);
   * ```
   */
  async getEventsSincePagination(
    timestamp: string,
    limit: number,
  ): Promise<{ events: FormSubmission[]; nextCursor: string | Date | null }> {
    return await this.eventStore.getEventsSincePagination(timestamp, limit);
  }

  /**
   * Closes all database connections and cleans up resources.
   *
   * Should be called when the EntityDataManager is no longer needed
   * to properly release database connections and prevent memory leaks.
   *
   * @example
   * ```typescript
   * // At application shutdown
   * await manager.closeConnection();
   * console.log('Database connections closed');
   * ```
   */
  async closeConnection(): Promise<void> {
    await this.entityStore.closeConnection();
    await this.eventStore.closeConnection();
  }

  /**
   * Clears all data from both entity and event stores.
   *
   * ⚠️ **WARNING**: This permanently deletes all data!
   * Only use for testing or when intentionally resetting the system.
   *
   * @example
   * ```typescript
   * // For testing only
   * if (process.env.NODE_ENV === 'test') {
   *   await manager.clearStore();
   *   console.log('Test data cleared');
   * }
   * ```
   */
  async clearStore(): Promise<void> {
    await this.entityStore.clearStore();
    await this.eventStore.clearStore();
  }

  /**
   * Saves multiple audit log entries to the event store.
   *
   * Used for batch saving of audit logs, typically during sync operations
   * when receiving audit logs from remote systems.
   *
   * @param auditLogs - Array of audit log entries to save
   *
   * @example
   * ```typescript
   * const auditLogs: AuditLogEntry[] = [
   *   {
   *     guid: 'audit-1',
   *     timestamp: '2024-01-01T12:00:00Z',
   *     userId: 'user-123',
   *     action: 'create-individual',
   *     eventGuid: 'event-456',
   *     entityGuid: 'person-789',
   *     changes: { name: 'John Doe' },
   *     signature: 'sha256:abc123'
   *   }
   * ];
   *
   * await manager.saveAuditLogs(auditLogs);
   * ```
   */
  async saveAuditLogs(auditLogs: AuditLogEntry[]): Promise<void> {
    await this.eventStore.saveAuditLogs(auditLogs);
  }

  /**
   * Retrieves audit logs created since a specific timestamp.
   *
   * @param since - ISO timestamp to filter audit logs from
   * @returns Array of audit log entries created after the specified timestamp
   *
   * @example
   * ```typescript
   * const lastAuditSync = '2024-01-01T00:00:00Z';
   * const recentAudits = await manager.getAuditLogsSince(lastAuditSync);
   *
   * console.log(`${recentAudits.length} audit entries since last sync`);
   * ```
   */
  async getAuditLogsSince(since: string): Promise<AuditLogEntry[]> {
    return await this.eventStore.getAuditLogsSince(since);
  }

  /**
   * Authenticates with the sync server using email and password.
   *
   * Performs login and automatically sets the received authentication token.
   * Only available when an InternalSyncManager is configured.
   *
   * @param email - User email address
   * @param password - User password
   * @throws {AppError} When login fails due to invalid credentials or network issues
   *
   * @example
   * ```typescript
   * try {
   *   await manager.login('user@example.com', 'password123');
   *   console.log('Login successful');
   *
   *   // Can now perform sync operations
   *   await manager.syncWithSyncServer();
   * } catch (error) {
   *   console.error('Login failed:', error.message);
   * }
   * ```
   */
  // Deprecated
  // async login(email: string, password: string): Promise<void> {
  //   if (this.internalSyncManager) {
  //     await this.internalSyncManager.login(email, password);
  //   }
  // }

  /**
   * Retrieves all potential duplicate entity pairs detected by the system.
   *
   * The system automatically detects potential duplicates during entity creation
   * based on similarity in data fields. These pairs need manual review and resolution.
   *
   * @returns Array of entity GUID pairs that are potential duplicates
   *
   * @example
   * ```typescript
   * const duplicates = await manager.getPotentialDuplicates();
   *
   * if (duplicates.length > 0) {
   *   console.log(`Found ${duplicates.length} potential duplicate pairs`);
   *
   *   for (const pair of duplicates) {
   *     const entity1 = await manager.getEntity(pair.entityGuid);
   *     const entity2 = await manager.getEntity(pair.duplicateGuid);
   *
   *     console.log('Potential duplicate:');
   *     console.log('Entity 1:', entity1.modified.data);
   *     console.log('Entity 2:', entity2.modified.data);
   *
   *     // TODO: Implement duplicate resolution workflow
   *   }
   * }
   * ```
   */
  async getPotentialDuplicates(): Promise<Array<{ entityGuid: string; duplicateGuid: string }>> {
    return await this.entityStore.getPotentialDuplicates();
  }

  /**
   * Synchronizes data with external systems (e.g., OpenSPP, custom APIs).
   *
   * Performs bidirectional sync with third-party systems using configured
   * sync adapters. Only available when an ExternalSyncManager is configured.
   *
   * @param credentials - Optional credentials for external system authentication
   * @throws {AppError} When external sync fails or credentials are invalid
   *
   * @example
   * ```typescript
   * // Sync with OpenSPP system
   * try {
   *   await manager.syncWithExternalSystem({
   *     username: 'sync_user',
   *     password: 'sync_password'
   *   });
   *   console.log('External sync completed');
   * } catch (error) {
   *   console.error('External sync failed:', error.message);
   * }
   *
   * // Sync without credentials (if configured in adapter)
   * await manager.syncWithExternalSystem();
   * ```
   */
  async syncWithExternalSystem(credentials?: ExternalSyncCredentials): Promise<void> {
    if (this.externalSyncManager) {
      await this.externalSyncManager.synchronize(credentials);
    }
  }

  async login(credentials: PasswordCredentials | TokenCredentials | null, type?: string): Promise<void> {
    if (this.authManager) {
      await this.authManager.login(credentials, type);
    }
  }

  async initializeAuthManager(): Promise<void> {
    if (this.authManager) {
      await this.authManager.initialize();
    }
  }

  async logout(): Promise<void> {
    if (this.authManager) {
      await this.authManager.logout();
    }
  }

  async validateToken(type: string, token: string): Promise<boolean> {
    if (this.authManager) {
      return this.authManager.validateToken(type, token);
    }
    return false;
  }

  async isAuthenticated(): Promise<boolean> {
    if (this.authManager) {
      return this.authManager.isAuthenticated();
    }
    return false;
  }

  async handleCallback(type: string): Promise<void> {
    if (this.authManager) {
      await this.authManager.handleCallback(type);
    }
  }

  async getAvailableAuthProviders(): Promise<string[]> {
    if (this.authManager) {
      return this.authManager.getAvailableAuthProviders();
    }
    return [];
  }

  async createUser(type: string, user: { email: string; phoneNumber?: string }): Promise<void> {
    if (this.authManager) {
      await this.authManager.createUser(type, user);
    }
  }

  async getUserInfo(token: string, type?: string): Promise<Record<string, unknown> | null> {
    if (this.authManager) {
      return this.authManager.getUserInfo(token, type);
    }
    return null;
  }

  async getUserEmailOrPhoneNumber(
    type: string,
    token: string,
  ): Promise<{ email: string; phoneNumber?: string } | null> {
    if (this.authManager) {
      return this.authManager.getUserEmailOrPhoneNumber(type, token);
    }
    return null;
  }
}
