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

import { EntityPair, EntityStorageAdapter, SearchCriteria } from "../interfaces/types";

/**
 * IndexedDB implementation of the EntityStorageAdapter for browser-based entity persistence.
 *
 * This adapter provides offline-first entity storage using the browser's IndexedDB API.
 * It implements the full EntityStorageAdapter interface with optimized indexing for fast
 * queries and efficient duplicate detection.
 *
 * Key features:
 * - **Offline Storage**: Stores entities locally in the browser using IndexedDB.
 * - **Multi-Tenant Support**: Isolated databases per tenant using tenant ID prefixes.
 * - **Optimized Indexing**: Multiple indexes for fast lookups (GUID, name, externalId, timestamps).
 * - **Search Capabilities**: Flexible search with operators ($gt, $lt, $eq, $regex).
 * - **Duplicate Detection**: Built-in storage for potential duplicate pairs.
 * - **Change Tracking**: Tracks initial and modified entity states for sync.
 *
 * Architecture:
 * - Uses IndexedDB object stores with compound keys for efficient storage.
 * - Implements cursor-based iteration for memory-efficient operations.
 * - Provides ACID transaction support for data consistency.
 * - Supports both simple and complex search criteria.
 *
 * @example
 * Basic usage:
 * ```typescript
 * const adapter = new IndexedDbEntityStorageAdapter('tenant-123');
 * await adapter.initialize();
 *
 * // Save an entity pair
 * const entityPair: EntityPair = {
 *   guid: 'person-456',
 *   initial: originalEntity,
 *   modified: updatedEntity
 * };
 * await adapter.saveEntity(entityPair);
 *
 * // Retrieve entity
 * const retrieved = await adapter.getEntity('person-456');
 * ```
 *
 * @example
 * Search entities:
 * ```typescript
 * // Search for adults with age greater than 18
 * const adults = await adapter.searchEntities([
 *   { "modified.data.age": { $gt: 18 } },
 *   { "modified.type": "individual" }
 * ]);
 *
 * // Search by name pattern
 * const smiths = await adapter.searchEntities([
 *   { "modified.data.name": { $regex: "smith" } }
 * ]);
 *
 * // Simple substring search
 * const smithFamilies = await adapter.searchEntities([
 *   { "modified.data.familyName": "smith" }
 * ]);
 * ```
 *
 * @example
 * Multi-tenant setup:
 * ```typescript
 * // Tenant-specific adapter
 * const tenantAdapter = new IndexedDbEntityStorageAdapter('org-xyz');
 * await tenantAdapter.initialize(); // Creates database: entityStore_org-xyz
 *
 * // Default adapter
 * const defaultAdapter = new IndexedDbEntityStorageAdapter();
 * await defaultAdapter.initialize(); // Creates database: entityStore
 * ```
 */
export class IndexedDbEntityStorageAdapter implements EntityStorageAdapter {
  private dbName = "entityStore";
  private storeName = "entities";
  private db: IDBDatabase | null = null;

  /**
   * Creates a new IndexedDbEntityStorageAdapter instance.
   *
   * @param tenantId Optional tenant identifier for multi-tenant isolation.
   *                  When provided, creates a separate database prefixed with tenant ID.
   *
   * @example
   * ```typescript
   * // Default database (entityStore)
   * const adapter = new IndexedDbEntityStorageAdapter();
   *
   * // Tenant-specific database (entityStore_org-123)
   * const tenantAdapter = new IndexedDbEntityStorageAdapter('org-123');
   * ```
   */
  constructor(public readonly tenantId: string = "") {
    if (tenantId) {
      this.dbName = `entityStore_${tenantId}`;
    }
  }

  /**
   * Closes the IndexedDB connection and cleans up resources.
   *
   * For IndexedDB, connections are automatically managed by the browser,
   * so this method is a no-op but maintained for interface compatibility.
   *
   * @returns A Promise that resolves when the connection is closed.
   */
  async closeConnection(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Initializes the IndexedDB database with required object stores and indexes.
   *
   * @returns A Promise that resolves when the database is initialized.
   * @throws {Error} When IndexedDB is not supported or database creation fails.
   *
   * @example
   * ```typescript
   * const adapter = new IndexedDbEntityStorageAdapter('tenant-123');
   * await adapter.initialize();
   * // Now ready for entity operations
   * ```
   */
  async initialize() {
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(this.dbName, 1);

      request.onerror = (event) => {
        console.error("Error opening IndexedDB:", event);
        reject(event);
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const objectStore = db.createObjectStore(this.storeName, { keyPath: "id" });
        objectStore.createIndex("guid", "guid", { unique: true });
        objectStore.createIndex("lastUpdated", "modified.lastUpdated", { unique: false });
        objectStore.createIndex("type_lastUpdated", ["type", "modified.lastUpdated"], { unique: false });
        objectStore.createIndex("name", "modified.data.name", { unique: false });
        objectStore.createIndex("externalId", "modified.externalId", { unique: true });

        // Create the "potentialDuplicates" object store
        const duplicatesStore = db.createObjectStore("potentialDuplicates", {
          keyPath: ["entityGuid", "duplicateGuid"],
        });
        duplicatesStore.createIndex("entityGuid", "entityGuid", { unique: false });
        duplicatesStore.createIndex("duplicateGuid", "duplicateGuid", { unique: false });
      };
    });
  }

  /**
   * Retrieves all entities stored in the database.
   *
   * @returns Array of all entity pairs.
   *
   * @example
   * ```typescript
   * const allEntities = await adapter.getAllEntities();
   * console.log(`Found ${allEntities.length} entities`);
   *
   * // Filter by type
   * const individuals = allEntities.filter(e => e.modified.type === 'individual');
   * const groups = allEntities.filter(e => e.modified.type === 'group');
   * ```
   */
  async getAllEntities(): Promise<EntityPair[]> {
    return await this.getAllEntityData();
  }

  /**
   * Searches entities using flexible criteria with support for operators and string matching.
   *
   * Supports multiple search operators:
   * - `$gt`: Greater than comparison.
   * - `$lt`: Less than comparison.
   * - `$eq`: Exact equality.
   * - `$regex`: Regular expression pattern matching.
   * - String values: Case-insensitive substring search.
   * - Numeric values: Exact equality.
   *
   * Searches both initial and modified entity states, as well as nested data properties.
   *
   * @param criteria Array of search criteria objects.
   * @returns Array of entity pairs matching all criteria.
   *
   * @example
   * ```typescript
   * // Search for adults with age greater than 18
   * const adults = await adapter.searchEntities([
   *   { "modified.data.age": { $gt: 18 } },
   *   { "modified.type": "individual" }
   * ]);
   *
   * // Search by name pattern (case-insensitive)
   * const johns = await adapter.searchEntities([
   *   { "modified.data.name": { $regex: "john" } }
   * ]);
   *
   * // Simple substring search
   * const smithFamilies = await adapter.searchEntities([
   *   { "modified.data.familyName": "smith" }
   * ]);
   * ```
   */
  async searchEntities(criteria: SearchCriteria): Promise<EntityPair[]> {
    if (!this.db) return [];

    const transaction = this.db.transaction([this.storeName], "readonly");
    const objectStore = transaction.objectStore(this.storeName);

    return new Promise((resolve, reject) => {
      const results: EntityPair[] = [];

      objectStore.openCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const entity = cursor.value;
          const matchesCriteria = criteria.every((criterion) => {
            const key = Object.keys(criterion)[0];
            const value = criterion[key];
            const entityValue =
              entity.initial?.[key] ||
              entity.modified?.[key] ||
              entity.initial?.data?.[key] ||
              entity.modified?.data?.[key];

            if (typeof value === "object") {
              const operator = Object.keys(value)[0];
              const operandValue = value[operator];

              switch (operator) {
                case "$gt":
                  return entityValue > operandValue;
                case "$lt":
                  return entityValue < operandValue;
                case "$eq":
                  return entityValue === operandValue;
                case "$regex":
                  return new RegExp(operandValue, "i").test(entityValue);
                default:
                  return false;
              }
            } else if (typeof value === "number") {
              return entityValue === value;
            } else {
              return (
                typeof entityValue === "string" &&
                typeof value === "string" &&
                entityValue.toLowerCase().includes(value.toLowerCase())
              );
            }
          });

          if (matchesCriteria) {
            delete entity.id;
            results.push(entity);
          }

          cursor.continue();
        } else {
          resolve(results);
        }
      };

      objectStore.openCursor().onerror = () => {
        reject(transaction.error);
      };
    });
  }

  /**
   * Saves an entity pair (initial and modified states) to IndexedDB.
   *
   * Stores both the initial state (for conflict resolution) and modified state
   * (current version) with the entity's GUID as the primary key.
   *
   * @param entity Entity pair containing initial and modified states.
   * @returns A Promise that resolves when the entity is saved.
   * @throws {Error} When IndexedDB is not initialized or save operation fails.
   *
   * @example
   * ```typescript
   * const entityPair: EntityPair = {
   *   guid: 'person-123',
   *   initial: originalEntity,
   *   modified: { ...originalEntity, data: { ...originalEntity.data, age: 31 } }
   * };
   *
   * await adapter.saveEntity(entityPair);
   * ```
   */
  async saveEntity(entity: EntityPair): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction([this.storeName], "readwrite");
    const objectStore = transaction.objectStore(this.storeName);
    try {
      const guid = entity.initial.guid || entity.modified.guid;
      await objectStore.put({
        id: guid,
        guid,
        initial: entity.initial,
        modified: entity.modified,
      });
    } catch (error) {
      console.log("Error saving entity:", String(error));
    }
  }

  /**
   * Retrieves an entity pair by its GUID.
   *
   * Uses the optimized GUID index for fast lookups.
   *
   * @param guid Global unique identifier of the entity.
   * @returns Entity pair if found, null otherwise.
   *
   * @example
   * ```typescript
   * const entity = await adapter.getEntity('person-123');
   * if (entity) {
   *   console.log('Current state:', entity.modified);
   *   console.log('Original state:', entity.initial);
   * } else {
   *   console.log('Entity not found');
   * }
   * ```
   */
  async getEntity(guid: string): Promise<EntityPair | null> {
    if (!this.db) return null;

    const transaction = this.db.transaction([this.storeName], "readonly");
    const objectStore = transaction.objectStore(this.storeName);
    const index = objectStore.index("guid");
    const request = index.get(guid);

    return new Promise((resolve, reject) => {
      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(
          request.result
            ? {
                guid: request.result.guid,
                initial: request.result.initial,
                modified: request.result.modified,
              }
            : null,
        );
      };
    });
  }

  /**
   * Retrieves an entity pair by its external system identifier.
   *
   * Useful for finding entities that have been synced with external systems
   * like OpenSPP or other third-party platforms.
   *
   * @param externalId External system identifier.
   * @returns Entity pair if found, null otherwise.
   *
   * @example
   * ```typescript
   * // Find entity by OpenSPP ID
   * const entity = await adapter.getEntityByExternalId('openspp-456');
   * if (entity) {
   *   console.log('Synced entity:', entity.modified.data);
   * }
   * ```
   */
  async getEntityByExternalId(externalId: string): Promise<EntityPair | null> {
    if (!this.db) return null;

    const transaction = this.db.transaction([this.storeName], "readonly");
    const objectStore = transaction.objectStore(this.storeName);
    const index = objectStore.index("externalId");
    const request = index.get(externalId);

    return new Promise((resolve, reject) => {
      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(
          request.result
            ? {
                guid: request.result.guid,
                initial: request.result.initial,
                modified: request.result.modified,
              }
            : null,
        );
      };
    });
  }

  /**
   * Internal method to retrieve all entities from IndexedDB.
   *
   * @returns Array of all entity pairs.
   * @private
   */
  async getAllEntityData(): Promise<EntityPair[]> {
    if (!this.db) return [];

    const transaction = this.db.transaction([this.storeName], "readonly");
    const objectStore = transaction.objectStore(this.storeName);
    const request = objectStore.getAll();

    return new Promise((resolve, reject) => {
      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(
          request.result.map((entity: EntityPair) => ({
            guid: entity.guid,
            initial: entity.initial,
            modified: entity.modified,
          })),
        );
      };
    });
  }

  /**
   * Retrieves entities that have been modified since a specific timestamp.
   *
   * Uses the lastUpdated index for efficient timestamp-based queries.
   * Essential for incremental synchronization operations.
   *
   * @param timestamp ISO timestamp to filter from (exclusive).
   * @returns Array of entity pairs modified after the timestamp.
   *
   * @example
   * ```typescript
   * const lastSync = '2024-01-01T00:00:00.000Z';
   * const modified = await adapter.getModifiedEntitiesSince(lastSync);
   *
   * console.log(`${modified.length} entities modified since last sync`);
   * for (const entity of modified) {
   *   console.log(`${entity.modified.data.name} updated at ${entity.modified.lastUpdated}`);
   * }
   * ```
   */
  async getModifiedEntitiesSince(timestamp: string): Promise<EntityPair[]> {
    if (!this.db) return [];

    const transaction = this.db.transaction([this.storeName], "readonly");
    const objectStore = transaction.objectStore(this.storeName);
    const index = objectStore.index("lastUpdated");
    const request = index.openCursor(IDBKeyRange.lowerBound(timestamp, true));

    return new Promise((resolve, reject) => {
      const modifiedEntities: EntityPair[] = [];

      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          modifiedEntities.push(cursor.value);
          cursor.continue();
        } else {
          resolve(
            modifiedEntities.map((entity: EntityPair) => ({
              guid: entity.guid,
              initial: entity.initial,
              modified: entity.modified,
            })),
          );
        }
      };
    });
  }

  /**
   * Marks an entity as synced by updating its lastUpdated timestamp.
   *
   * Used by sync managers to track which entities have been successfully
   * synchronized with remote systems.
   *
   * @param id GUID of the entity to mark as synced.
   * @returns A Promise that resolves when the entity is marked as synced.
   * @throws {Error} When IndexedDB is not initialized.
   *
   * @example
   * ```typescript
   * // After successful sync
   * await adapter.markEntityAsSynced('person-123');
   * ```
   */
  async markEntityAsSynced(id: string): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction([this.storeName], "readwrite");
    const objectStore = transaction.objectStore(this.storeName);
    const request = objectStore.get(id);

    request.onsuccess = () => {
      if (request.result) {
        request.result.modified.lastUpdated = new Date().toISOString();
        objectStore.put(request.result);
      }
    };
  }

  /**
   * Deletes an entity and cleans up any related duplicate entries.
   *
   * Removes the entity from both the main store and any potential duplicate
   * pairs where this entity appears as either the primary or duplicate entity.
   *
   * @param id GUID of the entity to delete.
   * @returns A Promise that resolves when the entity is deleted.
   * @throws {Error} When IndexedDB is not initialized.
   *
   * @example
   * ```typescript
   * await adapter.deleteEntity('person-123');
   * console.log('Entity and related duplicates removed');
   * ```
   */
  async deleteEntity(id: string): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction([this.storeName], "readwrite");
    const objectStore = transaction.objectStore(this.storeName);
    await objectStore.delete(id);

    // delete from potentialDuplicates
    const potentialDuplicatesTransaction = this.db.transaction(["potentialDuplicates"], "readwrite");
    const potentialDuplicatesObjectStore = potentialDuplicatesTransaction.objectStore("potentialDuplicates");
    const index = potentialDuplicatesObjectStore.index("entityGuid");
    const request = index.get(id);
    request.onsuccess = () => {
      if (request.result) {
        potentialDuplicatesObjectStore.delete([id, request.result.duplicateGuid]);
      }
    };

    const index2 = potentialDuplicatesObjectStore.index("duplicateGuid");
    const request2 = index2.get(id);
    request2.onsuccess = () => {
      if (request2.result) {
        potentialDuplicatesObjectStore.delete([request2.result.entityGuid, id]);
      }
    };
  }

  /**
   * Saves potential duplicate entity pairs for manual review.
   *
   * Stores pairs of entity GUIDs that may represent the same real-world entity.
   * These pairs are typically identified by automated duplicate detection algorithms.
   *
   * @param duplicates Array of entity GUID pairs flagged as potential duplicates.
   * @returns A Promise that resolves when duplicates are saved.
   * @throws {Error} When IndexedDB is not initialized.
   *
   * @example
   * ```typescript
   * const duplicatePairs = [
   *   { entityGuid: 'person-123', duplicateGuid: 'person-456' },
   *   { entityGuid: 'person-789', duplicateGuid: 'person-101' }
   * ];
   *
   * await adapter.savePotentialDuplicates(duplicatePairs);
   * console.log('Duplicate pairs saved for review');
   * ```
   */
  async savePotentialDuplicates(duplicates: Array<{ entityGuid: string; duplicateGuid: string }>): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["potentialDuplicates"], "readwrite");
    const objectStore = transaction.objectStore("potentialDuplicates");

    try {
      for (const duplicate of duplicates) {
        await objectStore.put(duplicate);
      }
    } catch (error) {
      console.error("Error saving potential duplicates:", error);
    }
  }

  /**
   * Retrieves all potential duplicate entity pairs awaiting review.
   *
   * Returns pairs of entity GUIDs that have been flagged by duplicate detection
   * algorithms and need manual review and resolution.
   *
   * @throws {Error} When IndexedDB is not initialized.
   *
   * @example
   * ```typescript
   * const duplicates = await adapter.getPotentialDuplicates();
   *
   * for (const pair of duplicates) {
   *   const entity1 = await adapter.getEntity(pair.entityGuid);
   *   const entity2 = await adapter.getEntity(pair.duplicateGuid);
   *
   *   console.log('Potential duplicate detected:');
   *   console.log('Entity 1:', entity1?.modified.data);
   *   console.log('Entity 2:', entity2?.modified.data);
   * }
   * ```
   */
  async getPotentialDuplicates(): Promise<Array<{ entityGuid: string; duplicateGuid: string }>> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["potentialDuplicates"], "readonly");
    const objectStore = transaction.objectStore("potentialDuplicates");
    const request = objectStore.getAll();

    return new Promise((resolve, reject) => {
      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = async () => {
        resolve(request.result as Array<{ entityGuid: string; duplicateGuid: string }>);
      };
    });
  }

  /**
   * Resolves potential duplicate pairs by removing them from the review queue.
   *
   * Typically called after manual review when duplicates have been confirmed
   * as either true duplicates (and merged/deleted) or false positives.
   *
   * @param duplicates Array of duplicate pairs to mark as resolved.
   * @returns A Promise that resolves when duplicates are resolved.
   * @throws {Error} When IndexedDB is not initialized.
   *
   * @example
   * ```typescript
   * // After manual review and resolution
   * const resolvedPairs = [
   *   { entityGuid: 'person-123', duplicateGuid: 'person-456' }
   * ];
   *
   * await adapter.resolvePotentialDuplicates(resolvedPairs);
   * console.log('Duplicate pairs marked as resolved');
   * ```
   */
  async resolvePotentialDuplicates(duplicates: Array<{ entityGuid: string; duplicateGuid: string }>): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["potentialDuplicates", this.storeName], "readwrite");
    const duplicatesObjectStore = transaction.objectStore("potentialDuplicates");

    try {
      for (const { entityGuid, duplicateGuid } of duplicates) {
        // Remove the duplicate entry from the potentialDuplicates store
        await duplicatesObjectStore.delete([entityGuid, duplicateGuid]);
      }
    } catch (error) {
      console.error("Error resolving potential duplicates:", error);
    }
  }

  /**
   * Clears all data from the entity store and potential duplicates store.
   *
   * ⚠️ **WARNING**: This permanently deletes all stored entities and duplicate pairs!
   * Only use for testing or when intentionally resetting the local database.
   *
   * @returns A Promise that resolves when the store is cleared.
   * @throws {Error} When IndexedDB is not initialized or clear operation fails.
   *
   * @example
   * ```typescript
   * // For testing environments only
   * if (process.env.NODE_ENV === 'test') {
   *   await adapter.clearStore();
   *   console.log('Test data cleared');
   * }
   * ```
   */
  async clearStore(): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    try {
      const entitiesTransaction = this.db.transaction([this.storeName], "readwrite");
      const entitiesObjectStore = entitiesTransaction.objectStore(this.storeName);
      await entitiesObjectStore.clear();
    } catch (error) {
      console.error("Error clearing entities object store:", error);
    }

    try {
      const duplicatesTransaction = this.db.transaction(["potentialDuplicates"], "readwrite");
      const duplicatesObjectStore = duplicatesTransaction.objectStore("potentialDuplicates");
      await duplicatesObjectStore.clear();
    } catch (error) {
      console.error("Error clearing potential duplicates object store:", error);
    }
  }
}
