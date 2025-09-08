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

import { EntityStore, EntityDoc, EntityStorageAdapter, SearchCriteria, EntityPair } from "../interfaces/types";

/**
 * Entity store implementation for managing current entity state with change tracking.
 *
 * The EntityStoreImpl provides the current state view in the event sourcing architecture.
 * It maintains both the initial state (from last sync/load) and the current modified state
 * for each entity, enabling conflict resolution and change tracking.
 *
 * Key responsibilities:
 * - **State Management**: Maintains current entity state derived from events.
 * - **Change Tracking**: Tracks changes between initial and current state.
 * - **Duplicate Detection**: Manages potential duplicate entity pairs.
 * - **Search Operations**: Provides flexible entity querying capabilities.
 * - **Sync Coordination**: Marks entities as synced and manages sync states.
 * - **External ID Mapping**: Maps between internal and external system IDs.
 *
 * Architecture:
 * - Uses pluggable storage adapters for different persistence backends.
 * - Implements CQRS query side - provides read operations for entities.
 * - Maintains entity pairs (initial + modified) for conflict resolution.
 * - Supports flexible search criteria with MongoDB-style queries.
 *
 * @example
 * Basic usage:
 * ```typescript
 * const entityStore = new EntityStoreImpl(storageAdapter);
 * await entityStore.initialize();
 *
 * // Save entity state
 * await entityStore.saveEntity(initialEntity, modifiedEntity);
 *
 * // Retrieve entity
 * const entityPair = await entityStore.getEntity('entity-123');
 * if (entityPair) {
 *   console.log('Initial state:', entityPair.initial);
 *   console.log('Current state:', entityPair.modified);
 *   console.log('Has changes:', entityPair.initial.version !== entityPair.modified.version);
 * }
 * ```
 *
 * @example
 * Search operations:
 * ```typescript
 * // Find all adults
 * const adults = await entityStore.searchEntities([
 *   { "data.age": { $gte: 18 } },
 *   { "type": "individual" }
 * ]);
 *
 * // Find groups by name pattern
 * const families = await entityStore.searchEntities([
 *   { "data.name": { $regex: /family/i } },
 *   { "type": "group" }
 * ]);
 * ```
 *
 * @example
 * Duplicate management:
 * ```typescript
 * // Save potential duplicates found during entity creation
 * await entityStore.savePotentialDuplicates([
 *   { entityGuid: 'person-123', duplicateGuid: 'person-456' }
 * ]);
 *
 * // Get all potential duplicates for review
 * const duplicates = await entityStore.getPotentialDuplicates();
 *
 * // Resolve duplicates after manual review
 * await entityStore.resolvePotentialDuplicates(resolvedDuplicates);
 * ```
 */
export class EntityStoreImpl implements EntityStore {
  private entityStorageAdapter: EntityStorageAdapter;

  /**
   * Creates a new EntityStoreImpl instance.
   *
   * @param entityStorageAdapter Storage adapter for persistence (IndexedDB, PostgreSQL, etc.).
   *
   * @example
   * ```typescript
   * // With IndexedDB for browser
   * const indexedDbAdapter = new IndexedDbEntityStorageAdapter('tenant-123');
   * const browserEntityStore = new EntityStoreImpl(indexedDbAdapter);
   *
   * // With PostgreSQL for server
   * const postgresAdapter = new PostgresEntityStorageAdapter(connectionString, 'tenant-123');
   * const serverEntityStore = new EntityStoreImpl(postgresAdapter);
   * ```
   */
  constructor(entityStorageAdapter: EntityStorageAdapter) {
    this.entityStorageAdapter = entityStorageAdapter;
  }

  /**
   * Closes database connections and cleans up resources.
   *
   * Should be called when the EntityStore is no longer needed to prevent memory leaks.
   *
   * @returns A Promise that resolves when the connection is closed.
   */
  async closeConnection(): Promise<void> {
    await this.entityStorageAdapter.closeConnection();
  }

  /**
   * Initializes the entity store and prepares it for operations.
   *
   * This method must be called before any other operations.
   *
   * @returns A Promise that resolves when the store is initialized.
   * @throws {Error} When storage initialization fails.
   */
  async initialize(): Promise<void> {
    await this.entityStorageAdapter.initialize();
  }

  /**
   * Deletes an entity from the store.
   *
   * ⚠️ **WARNING**: This permanently removes the entity and cannot be undone!
   *
   * @param id Internal database ID of the entity to delete.
   * @returns A Promise that resolves when the entity is deleted.
   * @throws {Error} When deletion fails.
   */
  async deleteEntity(id: string): Promise<void> {
    await this.entityStorageAdapter.deleteEntity(id);
  }

  /**
   * Searches entities using flexible criteria.
   *
   * Supports MongoDB-style query syntax for complex searches.
   *
   * @param criteria Search criteria array with query conditions.
   * @returns Array of entity pairs matching the criteria.
   *
   * @example
   * ```typescript
   * // Search for adults
   * const adults = await entityStore.searchEntities([
   *   { "data.age": { $gte: 18 } },
   *   { "type": "individual" }
   * ]);
   *
   * // Search for groups containing "family"
   * const families = await entityStore.searchEntities([
   *   { "data.name": { $regex: /family/i } },
   *   { "type": "group" }
   * ]);
   * ```
   */
  async searchEntities(criteria: SearchCriteria): Promise<EntityPair[]> {
    return await this.entityStorageAdapter.searchEntities(criteria);
  }

  /**
   * Retrieves a specific entity by its internal database ID.
   *
   * @param id Internal database ID of the entity.
   * @returns Entity pair with initial and current state, or null if not found.
   *
   * @example
   * ```typescript
   * const entityPair = await entityStore.getEntity('entity-123');
   * if (entityPair) {
   *   console.log('Found entity:', entityPair.modified.data.name);
   *
   *   // Check if entity has local changes
   *   const hasChanges = entityPair.initial.version !== entityPair.modified.version;
   *   if (hasChanges) {
   *     console.log('Entity has unsaved changes');
   *   }
   * } else {
   *   console.log('Entity not found');
   * }
   * ```
   */
  async getEntity(id: string): Promise<EntityPair | null> {
    return await this.entityStorageAdapter.getEntity(id);
  }

  /**
   * Saves an entity with both initial and current state for change tracking.
   *
   * @param initial Initial state of the entity (from last sync).
   * @param modified Current modified state of the entity.
   *
   * @example
   * ```typescript
   * // Save a new entity
   * const newEntity = {
   *   id: 'person-123',
   *   guid: 'person-123',
   *   type: 'individual',
   *   data: { name: 'John Doe', age: 30 },
   *   version: 1,
   *   lastUpdated: new Date().toISOString(),
   *   syncLevel: SyncLevel.LOCAL
   * };
   *
   * // Initially, both states are the same
   * await entityStore.saveEntity(newEntity, newEntity);
   *
   * // Later, after modifications
   * const modifiedEntity = { ...newEntity, data: { ...newEntity.data, age: 31 }, version: 2 };
   * await entityStore.saveEntity(newEntity, modifiedEntity); // Keep original initial state
   * ```
   */
  async saveEntity(initial: EntityDoc, modified: EntityDoc): Promise<void> {
    await this.entityStorageAdapter.saveEntity({ guid: modified.guid, initial, modified });
  }

  /**
   * Retrieves all entities from the store.
   *
   * @returns Array of all entity pairs with initial and current state.
   *
   * @example
   * ```typescript
   * const allEntities = await entityStore.getAllEntities();
   *
   * // Find entities with local changes
   * const modifiedEntities = allEntities.filter(pair =>
   *   pair.initial.version !== pair.modified.version
   * );
   *
   * console.log(`${modifiedEntities.length} entities have local changes`);
   * ```
   */
  async getAllEntities(): Promise<EntityPair[]> {
    return await this.entityStorageAdapter.getAllEntities();
  }

  /**
   * Retrieves entities modified since a specific timestamp.
   *
   * Useful for incremental sync operations to identify entities that need synchronization.
   *
   * @param timestamp ISO timestamp to filter entities from.
   * @returns Array of entity pairs modified after the specified timestamp.
   *
   * @example
   * ```typescript
   * const lastSync = '2024-01-01T00:00:00Z';
   * const modifiedEntities = await entityStore.getModifiedEntitiesSince(lastSync);
   *
   * console.log(`${modifiedEntities.length} entities modified since last sync`);
   * modifiedEntities.forEach(pair => {
   *   console.log(`${pair.modified.data.name} was updated at ${pair.modified.lastUpdated}`);
   * });
   * ```
   */
  async getModifiedEntitiesSince(timestamp: string): Promise<EntityPair[]> {
    const allEntities = await this.entityStorageAdapter.getAllEntities();
    return allEntities.filter(({ modified }) => modified.lastUpdated > timestamp);
  }

  /**
   * Marks an entity as synced by updating its initial state to match current state.
   *
   * This method is typically called after successfully syncing an entity with the server,
   * to indicate that the current state is now the baseline for future change detection.
   *
   * @param id Internal database ID of the entity to mark as synced.
   * @returns A Promise that resolves when the entity is marked as synced.
   *
   * @example
   * ```typescript
   * // After successfully syncing entity to server
   * await syncEntityToServer(entityId);
   * await entityStore.markEntityAsSynced(entityId);
   *
   * // Now the entity is considered "clean" with no local changes
   * const entityPair = await entityStore.getEntity(entityId);
   * console.log('Has changes:', entityPair.initial.version !== entityPair.modified.version); // false
   * ```
   */
  async markEntityAsSynced(id: string): Promise<void> {
    const entity = await this.entityStorageAdapter.getEntity(id);
    if (entity) {
      entity.initial = { ...entity.modified };
      await this.entityStorageAdapter.saveEntity(entity);
    }
  }

  /**
   * Retrieves an entity by its external system ID.
   *
   * Used for mapping between internal entities and external system records
   * during synchronization operations.
   *
   * @param externalId External system identifier for the entity.
   * @returns Entity pair if found, null otherwise.
   *
   * @example
   * ```typescript
   * // Find entity by OpenSPP ID
   * const entityPair = await entityStore.getEntityByExternalId('openspp-123');
   * if (entityPair) {
   *   console.log('Found entity for external ID:', entityPair.modified.data.name);
   *   // Update with new external data...
   * }
   * ```
   */
  getEntityByExternalId(externalId: string): Promise<EntityPair | null> {
    return this.entityStorageAdapter.getEntityByExternalId(externalId);
  }

  /**
   * Saves potential duplicate entity pairs for manual review.
   *
   * @param duplicates Array of entity GUID pairs that are potential duplicates.
   * @returns A Promise that resolves when duplicates are saved.
   *
   * @example
   * ```typescript
   * // System detected potential duplicates during entity creation
   * const duplicates = [
   *   { entityGuid: 'person-123', duplicateGuid: 'person-456' },
   *   { entityGuid: 'person-789', duplicateGuid: 'person-101' }
   * ];
   *
   * await entityStore.savePotentialDuplicates(duplicates);
   * console.log('Potential duplicates saved for review');
   * ```
   */
  savePotentialDuplicates(duplicates: Array<{ entityGuid: string; duplicateGuid: string }>): Promise<void> {
    return this.entityStorageAdapter.savePotentialDuplicates(duplicates);
  }

  /**
   * Retrieves all potential duplicate entity pairs awaiting review.
   *
   * @returns Array of entity GUID pairs that are potential duplicates.
   *
   * @example
   * ```typescript
   * const duplicates = await entityStore.getPotentialDuplicates();
   *
   * for (const pair of duplicates) {
   *   const entity1 = await entityStore.getEntity(pair.entityGuid);
   *   const entity2 = await entityStore.getEntity(pair.duplicateGuid);
   *
   *   console.log('Potential duplicate pair:');
   *   console.log('Entity 1:', entity1?.modified.data);
   *   console.log('Entity 2:', entity2?.modified.data);
   *
   *   // Present to user for manual review...
   * }
   * ```
   */
  getPotentialDuplicates(): Promise<Array<{ entityGuid: string; duplicateGuid: string }>> {
    return this.entityStorageAdapter.getPotentialDuplicates();
  }

  /**
   * Resolves potential duplicate pairs after manual review.
   *
   * @param duplicates Array of duplicate pairs that have been resolved.
   * @returns A Promise that resolves when duplicates are resolved.
   *
   * @example
   * ```typescript
   * // After user manually reviews and resolves duplicates
   * const resolvedDuplicates = [
   *   { entityGuid: 'person-123', duplicateGuid: 'person-456' } // User confirmed these are different people
   * ];
   *
   * await entityStore.resolvePotentialDuplicates(resolvedDuplicates);
   * console.log('Duplicate pairs resolved and removed from pending list');
   * ```
   */
  resolvePotentialDuplicates(duplicates: Array<{ entityGuid: string; duplicateGuid: string }>): Promise<void> {
    return this.entityStorageAdapter.resolvePotentialDuplicates(duplicates);
  }

  /**
   * Clears all entities from the store.
   *
   * ⚠️ **WARNING**: This permanently deletes all entity data and cannot be undone!
   * Only use for testing or when intentionally resetting the system.
   *
   * @example
   * ```typescript
   * // For testing only
   * if (process.env.NODE_ENV === 'test') {
   *   await entityStore.clearStore();
   *   console.log('Test entity data cleared');
   * }
   * ```
   */
  async clearStore(): Promise<void> {
    await this.entityStorageAdapter.clearStore();
  }
}
