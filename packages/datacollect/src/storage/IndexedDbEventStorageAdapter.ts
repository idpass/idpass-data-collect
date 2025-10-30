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

import { AuditLogEntry, EventStorageAdapter, FormSubmission, SyncLevel } from "../interfaces/types";

/**
 * IndexedDB implementation of the EventStorageAdapter for browser-based event persistence.
 *
 * This adapter provides tamper-evident event storage using the browser's IndexedDB API.
 * It ensures the integrity of the event log through cryptographic methods (e.g., Merkle trees)
 * and supports various event sourcing operations like audit trails, sync timestamp management,
 * and efficient event retrieval.
 *
 * Key features:
 * - **Immutable Event Storage**: All events are stored as immutable records.
 * - **Merkle Tree Integrity**: Cryptographic verification of event integrity using SHA256.
 * - **Audit Trail Management**: Complete audit logging for compliance and debugging.
 * - **Sync Coordination**: Timestamp tracking for multiple sync operations (local, remote, external).
 * - **Event Verification**: Merkle proof generation and verification (though Merkle proof generation/verification logic is handled by EventStore, this adapter provides the storage for Merkle roots).
 * - **Pagination Support**: Efficient handling of large event datasets.
 * - **Tamper Detection**: Cryptographic detection of unauthorized modifications.
 *
 * Architecture:
 * - Uses IndexedDB object stores for events, audit logs, Merkle roots, and sync timestamps.
 * - Employs multiple indexes for efficient querying of events and audit logs by GUID, entity GUID, and timestamp.
 * - Provides ACID transaction support for data consistency.
 * - Supports both single and multi-tenant deployments by prefixing database names with the tenant ID.
 *
 * @example
 * Basic usage:
 * ```typescript
 * import { IndexedDbEventStorageAdapter } from '@idpass/idpass-data-collect';
 *
 * const adapter = new IndexedDbEventStorageAdapter('tenant-123');
 * await adapter.initialize();
 *
 * // Save events
 * const eventsToSave = [{ guid: 'event-1', entityGuid: 'entity-1', timestamp: new Date().toISOString(), type: 'create-entity', data: {} }];
 * await adapter.saveEvents(eventsToSave);
 *
 * // Retrieve events
 * const allEvents = await adapter.getEvents();
 * console.log('All events:', allEvents);
 *
 * // Set and get sync timestamp
 * await adapter.setLastRemoteSyncTimestamp(new Date().toISOString());
 * const lastSync = await adapter.getLastRemoteSyncTimestamp();
 * console.log('Last remote sync:', lastSync);
 * ```
 */
export class IndexedDbEventStorageAdapter implements EventStorageAdapter {
  private dbName = "eventStore";
  private db: IDBDatabase | null = null;

  constructor(public readonly tenantId: string = "") {
    if (tenantId) {
      this.dbName = `eventStore_${tenantId}`;
    }
  }

  /**
   * Closes the connection to the IndexedDB database.
   *
   * @returns A Promise that resolves when the connection is closed.
   */
  async closeConnection(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Initializes the IndexedDB database, creating object stores and indexes if they don't exist.
   *
   * @returns A Promise that resolves when the database is successfully initialized.
   * @throws {Error} If there is an error opening or upgrading the IndexedDB.
   */
  async initialize(): Promise<void> {
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
        const eventsStore = db.createObjectStore("events", { keyPath: "id", autoIncrement: true });
        eventsStore.createIndex("guid", "guid", { unique: true });
        eventsStore.createIndex("entityGuid", "entityGuid", { unique: false });
        eventsStore.createIndex("timestamp", "timestamp", { unique: false });
        eventsStore.createIndex("entityGuId_timestamp", ["entityGuId", "timestamp"], { unique: false });
        eventsStore.createIndex("syncLevel", "syncLevel", { unique: false });

        db.createObjectStore("merkleRoot", { keyPath: "id", autoIncrement: true });

        const auditLogStore = db.createObjectStore("auditLog", { keyPath: "id", autoIncrement: true });
        auditLogStore.createIndex("guid", "guid", { unique: true });
        auditLogStore.createIndex("entityGuid", "entityGuid", { unique: false });
        auditLogStore.createIndex("instanceId", "instanceId", { unique: false });
        auditLogStore.createIndex("timestamp", "timestamp", { unique: false });

        db.createObjectStore("syncTimestamp", { keyPath: "id", autoIncrement: false });
      };
    });
  }

  /**
   * Saves an array of `FormSubmission` events to the event store.
   *
   * @param events An array of `FormSubmission` objects to save.
   * @returns A Promise that resolves with an array of GUIDs of the saved events.
   * @throws {Error} If IndexedDB is not initialized or the save operation fails.
   */
  async saveEvents(events: FormSubmission[]): Promise<string[]> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["events"], "readwrite");
    const objectStore = transaction.objectStore("events");
    const guids: string[] = [];

    for (const event of events) {
      const request = objectStore.put({ ...event });
      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => {
          guids.push(event.guid);
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    }
    return guids;
  }

  /**
   * Retrieves all `FormSubmission` events from the event store.
   *
   * @returns A Promise that resolves with an array of all `FormSubmission` events.
   * @throws {Error} If IndexedDB is not initialized or the retrieval operation fails.
   */
  async getEvents(): Promise<FormSubmission[]> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["events"], "readonly");
    const objectStore = transaction.objectStore("events");
    const events: FormSubmission[] = [];

    await new Promise<void>((resolve, reject) => {
      const request = objectStore.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          events.push(cursor.value);
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });

    return events;
  }

  /**
   * Saves an array of `AuditLogEntry` entries to the audit log store.
   *
   * @param entries An array of `AuditLogEntry` objects to save.
   * @returns A Promise that resolves when the audit log entries are successfully saved.
   * @throws {Error} If IndexedDB is not initialized or the save operation fails.
   */
  async saveAuditLog(entries: AuditLogEntry[]): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["auditLog"], "readwrite");
    const objectStore = transaction.objectStore("auditLog");

    for (const entry of entries) {
      const request = objectStore.put(entry);
      await new Promise<void>((resolve, reject) => {
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  }

  /**
   * Retrieves all `AuditLogEntry` entries from the audit log store.
   *
   * @returns A Promise that resolves with an array of all `AuditLogEntry` entries.
   * @throws {Error} If IndexedDB is not initialized or the retrieval operation fails.
   */
  async getAuditLog(): Promise<AuditLogEntry[]> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["auditLog"], "readonly");
    const objectStore = transaction.objectStore("auditLog");
    const auditLog: AuditLogEntry[] = [];

    await new Promise<void>((resolve, reject) => {
      const request = objectStore.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          auditLog.push(cursor.value);
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });

    return auditLog;
  }

  /**
   * Saves the Merkle root to the Merkle root store.
   *
   * @param root The Merkle root string to save.
   * @returns A Promise that resolves when the Merkle root is successfully saved.
   * @throws {Error} If IndexedDB is not initialized or the save operation fails.
   */
  async saveMerkleRoot(root: string): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["merkleRoot"], "readwrite");
    const objectStore = transaction.objectStore("merkleRoot");

    if (!root) {
      await new Promise<void>((resolve, reject) => {
        const request = objectStore.delete(1);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const request = objectStore.put({ id: 1, root });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves the stored Merkle root.
   *
   * @returns A Promise that resolves with the Merkle root string, or an empty string if no root exists.
   * @throws {Error} If IndexedDB is not initialized or the retrieval operation fails.
   */
  async getMerkleRoot(): Promise<string> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["merkleRoot"], "readonly");
    const objectStore = transaction.objectStore("merkleRoot");
    const request = objectStore.get(1);

    return await new Promise<string>((resolve, reject) => {
      request.onsuccess = (event) => {
        const result = (event.target as IDBRequest<{ root: string }>).result;
        resolve(result ? result.root : "");
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clears all data from the events, audit log, and Merkle root stores.
   *
   * @returns A Promise that resolves when all stores are cleared.
   * @throws {Error} If IndexedDB is not initialized or the clear operation fails.
   */
  async clearStore(): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const clearEvents = this.db.transaction(["events"], "readwrite").objectStore("events").clear();
    await new Promise<void>((resolve, reject) => {
      clearEvents.onsuccess = () => resolve();
      clearEvents.onerror = () => reject(clearEvents.error);
    });

    const clearAuditLog = this.db.transaction(["auditLog"], "readwrite").objectStore("auditLog").clear();
    await new Promise<void>((resolve, reject) => {
      clearAuditLog.onsuccess = () => resolve();
      clearAuditLog.onerror = () => reject(clearAuditLog.error);
    });

    const clearMerkleRoot = this.db.transaction(["merkleRoot"], "readwrite").objectStore("merkleRoot").clear();
    await new Promise<void>((resolve, reject) => {
      clearMerkleRoot.onsuccess = () => resolve();
      clearMerkleRoot.onerror = () => reject(clearMerkleRoot.error);
    });
  }

  /**
   * Updates the `syncLevel` for events associated with a given `entityGuid`.
   *
   * @param id The GUID of the event whose sync level needs to be updated.
   * @param syncLevel The new `SyncLevel` to set for the events.
   * @returns A Promise that resolves when the update is complete.
   * @throws {Error} If IndexedDB is not initialized or the update operation fails.
   */
  async updateEventSyncLevel(id: string, syncLevel: SyncLevel): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        throw new Error("IndexedDB is not initialized");
      }

      const transaction = this.db.transaction(["events"], "readwrite");
      const store = transaction.objectStore("events");
      const index = store.index("entityGuId");
      const request = index.openCursor(IDBKeyRange.only(id));

      request.onerror = () => reject(new Error("Failed to retrieve events"));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const updateData = cursor.value;
          updateData.syncLevel = syncLevel;
          const updateRequest = cursor.update(updateData);
          updateRequest.onerror = () => reject(new Error("Failed to update event sync level"));
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }

  /**
   * Updates the `syncLevel` for audit log entries associated with a given `entityGuid`.
   *
   * @param entityGuId The GUID of the entity whose associated audit log entries' sync levels need to be updated.
   * @param syncLevel The new `SyncLevel` to set for the audit log entries.
   * @returns A Promise that resolves when the update is complete.
   * @throws {Error} If IndexedDB is not initialized or the update operation fails.
   */
  async updateAuditLogSyncLevel(entityGuId: string, syncLevel: SyncLevel): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        throw new Error("IndexedDB is not initialized");
      }

      const transaction = this.db.transaction(["auditLog"], "readwrite");
      const store = transaction.objectStore("auditLog");
      const index = store.index("entityGuId");
      const request = index.openCursor(IDBKeyRange.only(entityGuId));

      request.onerror = () => reject(new Error("Failed to retrieve events"));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const updateData = cursor.value;
          updateData.syncLevel = syncLevel;
          const updateRequest = cursor.update(updateData);
          updateRequest.onerror = () => reject(new Error("Failed to update event sync level"));
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }

  /**
   * Retrieves events that have occurred since a specified timestamp.
   *
   * @param timestamp The timestamp (ISO 8601 string or Date object) from which to retrieve events (exclusive).
   * @returns A Promise that resolves with an array of `FormSubmission` events, sorted by timestamp in ascending order.
   * @throws {Error} If IndexedDB is not initialized or the retrieval operation fails.
   */
  async getEventsSince(timestamp: string | Date): Promise<FormSubmission[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        throw new Error("IndexedDB is not initialized");
      }

      const transaction = this.db.transaction(["events"], "readonly");
      const store = transaction.objectStore("events");
      const index = store.index("timestamp");
      const request = index.openCursor(IDBKeyRange.lowerBound(timestamp, true));

      const events: FormSubmission[] = [];

      request.onerror = () => reject(new Error("Failed to retrieve events"));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          events.push(cursor.value);
          cursor.continue();
        } else {
          // Sort the events by timestamp in ascending order (oldest first)
          events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
          resolve(events);
        }
      };
    });
  }

  /**
   * Retrieves events that have occurred since a specified timestamp with pagination.
   *
   * @param timestamp The timestamp (ISO 8601 string or Date object) from which to retrieve events (exclusive).
   * @param pageSize The maximum number of events to retrieve in a single page. Defaults to 10.
   * @returns A Promise that resolves with an object containing an array of `FormSubmission` events and the `nextCursor` for pagination.
   * @throws {Error} If IndexedDB is not initialized or the retrieval operation fails.
   */
  async getEventsSincePagination(
    timestamp: string | Date,
    pageSize: number = 10,
  ): Promise<{ events: FormSubmission[]; nextCursor: string | Date | null }> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        throw new Error("IndexedDB is not initialized");
      }

      const transaction = this.db.transaction(["events"], "readonly");
      const store = transaction.objectStore("events");
      const index = store.index("timestamp");
      const request = index.openCursor(IDBKeyRange.lowerBound(timestamp, true));

      const events: FormSubmission[] = [];
      let count = 0;

      request.onerror = () => reject(new Error("Failed to retrieve events"));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;

        if (cursor && count < pageSize) {
          events.push(cursor.value);
          count++;
          cursor.continue();
        } else {
          // Sort the events by timestamp in ascending order (oldest first)
          events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

          // Get the last timestamp as the next cursor
          const nextCursor = events.length > 0 ? events[events.length - 1].timestamp : null;

          resolve({
            events,
            nextCursor,
          });
        }
      };
    });
  }

  /**
   * Retrieves audit log entries that have occurred since a specified timestamp.
   *
   * @param timestamp The timestamp (ISO 8601 string) from which to retrieve audit logs (exclusive).
   * @returns A Promise that resolves with an array of `AuditLogEntry` entries, sorted by timestamp in descending order.
   * @throws {Error} If IndexedDB is not initialized or the retrieval operation fails.
   */
  async getAuditLogsSince(timestamp: string): Promise<AuditLogEntry[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        throw new Error("IndexedDB is not initialized");
      }

      const transaction = this.db.transaction(["auditLog"], "readonly");
      const store = transaction.objectStore("auditLog");
      const index = store.index("timestamp");
      const request = index.openCursor(IDBKeyRange.lowerBound(timestamp, true));

      const auditLogs: AuditLogEntry[] = [];

      request.onerror = () => reject(new Error("Failed to retrieve audit logs"));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          auditLogs.push(cursor.value);
          cursor.continue();
        } else {
          resolve(auditLogs);
        }
      };
    });
  }

  /**
   * Updates the sync level for a batch of events based on their GUIDs.
   *
   * @param events An array of `FormSubmission` objects, each containing the GUID and the new `syncLevel`.
   * @returns A Promise that resolves when all specified events' sync levels are updated.
   * @throws {Error} If IndexedDB is not initialized or the update operation fails.
   */
  async updateSyncLevelFromEvents(events: FormSubmission[]): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["events"], "readwrite");
    const objectStore = transaction.objectStore("events");
    const index = objectStore.index("guid");

    try {
      for (const event of events) {
        const request = index.get(event.guid);
        await new Promise<void>((resolve, reject) => {
          request.onsuccess = (getEvent) => {
            const eventData = (getEvent.target as IDBRequest<FormSubmission>).result;
            if (eventData) {
              eventData.syncLevel = event.syncLevel;
              const updateRequest = objectStore.put(eventData);
              updateRequest.onsuccess = () => resolve();
              updateRequest.onerror = () => reject(updateRequest.error);
            } else {
              resolve();
            }
          };
          request.onerror = () => reject(request.error);
        });
      }
      transaction.commit();
    } catch (error) {
      transaction.abort();
      throw error;
    }
  }

  /**
   * Retrieves the timestamp of the last successful remote synchronization.
   *
   * @returns A Promise that resolves with the timestamp string, or an empty string if no timestamp exists.
   * @throws {Error} If IndexedDB is not initialized or the retrieval operation fails.
   */
  async getLastRemoteSyncTimestamp(): Promise<string> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["syncTimestamp"], "readonly");
    const objectStore = transaction.objectStore("syncTimestamp");
    const request = objectStore.get("lastRemoteSyncTimestamp");

    return new Promise<string>((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result ? request.result.value : "");
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Sets the timestamp of the last successful remote synchronization.
   *
   * @param timestamp The timestamp string to save.
   * @returns A Promise that resolves when the timestamp is successfully saved.
   * @throws {Error} If IndexedDB is not initialized or the save operation fails.
   */
  async setLastRemoteSyncTimestamp(timestamp: string): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["syncTimestamp"], "readwrite");
    const objectStore = transaction.objectStore("syncTimestamp");
    const request = objectStore.put({ id: "lastRemoteSyncTimestamp", value: timestamp });

    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves the timestamp of the last successful local synchronization.
   *
   * @returns A Promise that resolves with the timestamp string, or an empty string if no timestamp exists.
   * @throws {Error} If IndexedDB is not initialized or the retrieval operation fails.
   */
  async getLastLocalSyncTimestamp(): Promise<string> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["syncTimestamp"], "readonly");
    const objectStore = transaction.objectStore("syncTimestamp");
    const request = objectStore.get("lastLocalSyncTimestamp");

    return new Promise<string>((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result ? request.result.value : "");
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Sets the timestamp of the last successful local synchronization.
   *
   * @param timestamp The timestamp string to save.
   * @returns A Promise that resolves when the timestamp is successfully saved.
   * @throws {Error} If IndexedDB is not initialized or the save operation fails.
   */
  async setLastLocalSyncTimestamp(timestamp: string): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["syncTimestamp"], "readwrite");
    const objectStore = transaction.objectStore("syncTimestamp");
    const request = objectStore.put({ id: "lastLocalSyncTimestamp", value: timestamp });

    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves the timestamp of the last successful external pull synchronization.
   *
   * @returns A Promise that resolves with the timestamp string, or an empty string if no timestamp exists.
   * @throws {Error} If IndexedDB is not initialized or the retrieval operation fails.
   */
  getLastPullExternalSyncTimestamp(): Promise<string> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["syncTimestamp"], "readonly");
    const objectStore = transaction.objectStore("syncTimestamp");
    const request = objectStore.get("lastPullExternalSyncTimestamp");

    return new Promise<string>((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result ? request.result.value : "");
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Sets the timestamp of the last successful external pull synchronization.
   *
   * @param timestamp The timestamp string to save.
   * @returns A Promise that resolves when the timestamp is successfully saved.
   * @throws {Error} If IndexedDB is not initialized or the save operation fails.
   */
  setLastPullExternalSyncTimestamp(timestamp: string): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["syncTimestamp"], "readwrite");
    const objectStore = transaction.objectStore("syncTimestamp");
    const request = objectStore.put({ id: "lastPullExternalSyncTimestamp", value: timestamp });

    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieves the timestamp of the last successful external push synchronization.
   *
   * @returns A Promise that resolves with the timestamp string, or an empty string if no timestamp exists.
   * @throws {Error} If IndexedDB is not initialized or the retrieval operation fails.
   */
  getLastPushExternalSyncTimestamp(): Promise<string> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["syncTimestamp"], "readonly");
    const objectStore = transaction.objectStore("syncTimestamp");
    const request = objectStore.get("lastPushExternalSyncTimestamp");

    return new Promise<string>((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result ? request.result.value : "");
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Sets the timestamp of the last successful external push synchronization.
   *
   * @param timestamp The timestamp string to save.
   * @returns A Promise that resolves when the timestamp is successfully saved.
   * @throws {Error} If IndexedDB is not initialized or the save operation fails.
   */
  setLastPushExternalSyncTimestamp(timestamp: string): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["syncTimestamp"], "readwrite");
    const objectStore = transaction.objectStore("syncTimestamp");
    const request = objectStore.put({ id: "lastPushExternalSyncTimestamp", value: timestamp });

    return new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Checks if an event with the given GUID exists in the event store.
   *
   * @param guid The GUID of the event to check.
   * @returns A Promise that resolves to `true` if the event exists, `false` otherwise.
   * @throws {Error} If IndexedDB is not initialized or the operation fails.
   */
  async isEventExisted(guid: string): Promise<boolean> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["events"], "readonly");
    const objectStore = transaction.objectStore("events");
    const index = objectStore.index("guid");
    const request = index.getKey(guid);

    return new Promise<boolean>((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result !== undefined);
      };
      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * Retrieves the audit trail for a specific entity, identified by its `entityGuid`.
   *
   * @param entityGuid The GUID of the entity to retrieve the audit trail for.
   * @returns A Promise that resolves with an array of `AuditLogEntry` entries, sorted by timestamp in descending order.
   * @throws {Error} If IndexedDB is not initialized or the retrieval operation fails.
   */
  async getAuditTrailByEntityGuid(entityGuid: string): Promise<AuditLogEntry[]> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["auditLog"], "readonly");
    const objectStore = transaction.objectStore("auditLog");
    const index = objectStore.index("entityGuid");
    const request = index.openCursor(IDBKeyRange.only(entityGuid));

    const auditTrail: AuditLogEntry[] = [];

    return new Promise<AuditLogEntry[]>((resolve, reject) => {
      request.onerror = () => reject(new Error("Failed to retrieve audit trail"));

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          auditTrail.push(cursor.value);
          cursor.continue();
        } else {
          // Sort the audit trail by timestamp in descending order (newest  first)
          auditTrail.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          resolve(auditTrail);
        }
      };
    });
  }
}
