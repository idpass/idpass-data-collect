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

import { AttachmentMetadata, AttachmentStore } from "../interfaces/types";
import { createLogger } from "../utils/logger";

const log = createLogger("IndexedDbAttachmentStorageAdapter");

/**
 * IndexedDB implementation of the AttachmentStore for browser-based attachment persistence.
 *
 * Uses two object stores:
 * - `attachment_metadata`: Stores AttachmentMetadata objects with indexes on entityGuid,
 *   tenantId, and syncStatus for efficient querying.
 * - `attachment_data`: Stores binary data (ArrayBuffer) keyed by attachment GUID.
 *
 * Supports multi-tenant isolation via tenant ID prefixed database names.
 */
export class IndexedDbAttachmentStorageAdapter implements AttachmentStore {
  private dbName = "attachmentStore";
  private metadataStoreName = "attachment_metadata";
  private dataStoreName = "attachment_data";
  private db: IDBDatabase | null = null;

  /**
   * Creates a new IndexedDbAttachmentStorageAdapter instance.
   *
   * @param tenantId Optional tenant identifier for multi-tenant isolation.
   *                  When provided, creates a separate database prefixed with tenant ID.
   */
  constructor(public readonly tenantId: string = "") {
    if (tenantId) {
      this.dbName = `attachmentStore_${tenantId}`;
    }
  }

  /**
   * Initializes the IndexedDB database with required object stores and indexes.
   */
  async initialize(): Promise<void> {
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = window.indexedDB.open(this.dbName, 1);

      request.onerror = (event) => {
        log.error({ event }, "Error opening IndexedDB for attachments");
        reject(event);
      };

      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        const metadataStore = db.createObjectStore(this.metadataStoreName, { keyPath: "guid" });
        metadataStore.createIndex("entityGuid", "entityGuid", { unique: false });
        metadataStore.createIndex("tenantId", "tenantId", { unique: false });
        metadataStore.createIndex("syncStatus", "syncStatus", { unique: false });
        metadataStore.createIndex("tenantId_syncStatus", ["tenantId", "syncStatus"], { unique: false });

        db.createObjectStore(this.dataStoreName, { keyPath: "guid" });
      };
    });
  }

  /**
   * Saves attachment metadata and binary data.
   */
  async saveAttachment(metadata: AttachmentMetadata, data: ArrayBuffer): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction([this.metadataStoreName, this.dataStoreName], "readwrite");
    const metadataStore = transaction.objectStore(this.metadataStoreName);
    const dataStore = transaction.objectStore(this.dataStoreName);

    return new Promise((resolve, reject) => {
      transaction.onerror = () => {
        log.error({ err: transaction.error }, "Error saving attachment");
        reject(transaction.error);
      };

      transaction.oncomplete = () => {
        resolve();
      };

      metadataStore.put(metadata);
      dataStore.put({ guid: metadata.guid, data });
    });
  }

  /**
   * Gets attachment metadata and binary data by GUID.
   */
  async getAttachment(guid: string): Promise<{ metadata: AttachmentMetadata; data: ArrayBuffer } | null> {
    if (!this.db) return null;

    const metadata = await this.getAttachmentMetadata(guid);
    if (!metadata) return null;

    const transaction = this.db.transaction([this.dataStoreName], "readonly");
    const dataStore = transaction.objectStore(this.dataStoreName);
    const request = dataStore.get(guid);

    return new Promise((resolve, reject) => {
      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        resolve({ metadata, data: request.result.data });
      };
    });
  }

  /**
   * Gets only the metadata for an attachment (without loading binary data).
   */
  async getAttachmentMetadata(guid: string): Promise<AttachmentMetadata | null> {
    if (!this.db) return null;

    const transaction = this.db.transaction([this.metadataStoreName], "readonly");
    const metadataStore = transaction.objectStore(this.metadataStoreName);
    const request = metadataStore.get(guid);

    return new Promise((resolve, reject) => {
      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result || null);
      };
    });
  }

  /**
   * Lists all attachments for a specific entity.
   */
  async listAttachments(entityGuid: string): Promise<AttachmentMetadata[]> {
    if (!this.db) return [];

    const transaction = this.db.transaction([this.metadataStoreName], "readonly");
    const metadataStore = transaction.objectStore(this.metadataStoreName);
    const index = metadataStore.index("entityGuid");
    const request = index.getAll(entityGuid);

    return new Promise((resolve, reject) => {
      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result || []);
      };
    });
  }

  /**
   * Deletes an attachment and its binary data.
   */
  async deleteAttachment(guid: string): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction([this.metadataStoreName, this.dataStoreName], "readwrite");
    const metadataStore = transaction.objectStore(this.metadataStoreName);
    const dataStore = transaction.objectStore(this.dataStoreName);

    return new Promise((resolve, reject) => {
      transaction.onerror = () => {
        log.error({ err: transaction.error }, "Error deleting attachment");
        reject(transaction.error);
      };

      transaction.oncomplete = () => {
        resolve();
      };

      metadataStore.delete(guid);
      dataStore.delete(guid);
    });
  }

  /**
   * Gets all attachments with 'pending' sync status for a tenant.
   */
  async getPendingAttachments(tenantId: string): Promise<AttachmentMetadata[]> {
    if (!this.db) return [];

    const transaction = this.db.transaction([this.metadataStoreName], "readonly");
    const metadataStore = transaction.objectStore(this.metadataStoreName);
    const index = metadataStore.index("tenantId_syncStatus");
    const request = index.getAll([tenantId, "pending"]);

    return new Promise((resolve, reject) => {
      request.onerror = () => {
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result || []);
      };
    });
  }

  /**
   * Updates the sync status of an attachment.
   */
  async updateSyncStatus(guid: string, status: AttachmentMetadata["syncStatus"]): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction([this.metadataStoreName], "readwrite");
    const metadataStore = transaction.objectStore(this.metadataStoreName);
    const getRequest = metadataStore.get(guid);

    return new Promise((resolve, reject) => {
      getRequest.onerror = () => {
        reject(getRequest.error);
      };

      getRequest.onsuccess = () => {
        if (!getRequest.result) {
          reject(new Error(`Attachment with guid "${guid}" not found`));
          return;
        }

        const updated = { ...getRequest.result, syncStatus: status };
        const putRequest = metadataStore.put(updated);

        putRequest.onerror = () => {
          reject(putRequest.error);
        };

        putRequest.onsuccess = () => {
          resolve();
        };
      };
    });
  }

  /**
   * Closes the IndexedDB connection.
   */
  async closeConnection(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Clears all data from both metadata and data stores.
   */
  async clearStore(): Promise<void> {
    if (!this.db) {
      throw new Error("IndexedDB is not initialized");
    }

    const transaction = this.db.transaction([this.metadataStoreName, this.dataStoreName], "readwrite");
    const metadataStore = transaction.objectStore(this.metadataStoreName);
    const dataStore = transaction.objectStore(this.dataStoreName);

    return new Promise((resolve, reject) => {
      transaction.onerror = () => {
        log.error({ err: transaction.error }, "Error clearing attachment stores");
        reject(transaction.error);
      };

      transaction.oncomplete = () => {
        resolve();
      };

      metadataStore.clear();
      dataStore.clear();
    });
  }
}
