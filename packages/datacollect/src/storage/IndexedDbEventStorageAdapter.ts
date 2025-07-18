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

export class IndexedDbEventStorageAdapter implements EventStorageAdapter {
  private dbName = "eventStore";
  private db: IDBDatabase | null = null;

  constructor(public readonly tenantId: string = "") {
    if (tenantId) {
      this.dbName = `eventStore_${tenantId}`;
    }
  }

  async closeConnection(): Promise<void> {
    return Promise.resolve();
  }

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

  async saveMerkleRoot(root: string): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["merkleRoot"], "readwrite");
    const objectStore = transaction.objectStore("merkleRoot");
    const request = objectStore.put({ id: 1, root });

    await new Promise<void>((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

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

    const clearSyncTimestamp = this.db.transaction(["syncTimestamp"], "readwrite").objectStore("syncTimestamp").clear();
    await new Promise<void>((resolve, reject) => {
      clearSyncTimestamp.onsuccess = () => resolve();
      clearSyncTimestamp.onerror = () => reject(clearSyncTimestamp.error);
    });
  }

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

  async getEventsSelfServicePagination(
    entityGuid: string,
    timestamp: string | Date,
  ): Promise<{ events: FormSubmission[] }> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction(["events"], "readonly");
    const store = transaction.objectStore("events");

    // Get all events without timestamp filtering
    const allEvents = await new Promise<FormSubmission[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Build descendant map
    const buildDescendantMap = () => {
      const parentToChildren = new Map<string, Set<string>>();

      // Build parent-child relationships
      allEvents.forEach((event) => {
        if (event.data && event.data.parentGuid) {
          if (!parentToChildren.has(event.data.parentGuid)) {
            parentToChildren.set(event.data.parentGuid, new Set());
          }
          parentToChildren.get(event.data.parentGuid)!.add(event.entityGuid);
        }
      });

      // Recursively find all descendants
      const findDescendants = (guid: string): Set<string> => {
        const descendants = new Set<string>();
        const queue = [guid];

        while (queue.length > 0) {
          const current = queue.shift()!;
          const children = parentToChildren.get(current);

          if (children) {
            children.forEach((child) => {
              if (!descendants.has(child)) {
                descendants.add(child);
                queue.push(child);
              }
            });
          }
        }

        return descendants;
      };

      return findDescendants(entityGuid);
    };

    const descendants = buildDescendantMap();

    // Filter events that are descendants OR the entity itself
    const events: FormSubmission[] = [];

    allEvents.forEach((event) => {
      if (descendants.has(event.entityGuid) || event.entityGuid === entityGuid) {
        events.push(event);
      }
    });

    // Sort the events by timestamp in ascending order (oldest first) and filter by timestamp
    const descendantEvents = events
      .filter((event) => event.timestamp >= timestamp)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      events: descendantEvents,
    };
  }
}
