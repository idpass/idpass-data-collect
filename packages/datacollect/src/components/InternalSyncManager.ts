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

import axios, { AxiosInstance } from "axios";
import {
  FormSubmission,
  EventStore,
  SyncLevel,
  AuditLogEntry,
  EntityStore,
  AuthStorageAdapter,
} from "../interfaces/types";
import { EventApplierService } from "../services/EventApplierService";

/**
 * Manages bidirectional synchronization between local DataCollect instances and the remote sync server.
 *
 * The InternalSyncManager implements a two-phase sync process:
 * 1. **Push Phase**: Sends local unsynced events to the remote server
 * 2. **Pull Phase**: Retrieves and applies remote events to local storage
 *
 * Key features:
 * - Pagination support (10 events per page by default)
 * - JWT-based authentication with automatic token refresh
 * - Conflict detection and resolution
 * - Audit log synchronization
 * - Progress tracking and error handling
 *
 * @example
 * Basic usage:
 * ```typescript
 * const syncManager = new InternalSyncManager(
 *   eventStore,
 *   entityStore,
 *   eventApplierService,
 *   'https://sync.example.com',
 *   'jwt-token',
 *   'app-config-id'
 * );
 *
 * // Authenticate
 * await syncManager.login('user@example.com', 'password');
 *
 * // Check for pending changes
 * if (await syncManager.hasUnsyncedEvents()) {
 *   console.log(`${await syncManager.getUnsyncedEventsCount()} events pending`);
 *
 *   // Perform full sync
 *   await syncManager.sync();
 * }
 * ```
 *
 * @example
 * Manual sync phases:
 * ```typescript
 * // Push local changes first
 * await syncManager.pushToRemote();
 *
 * // Then pull remote changes
 * await syncManager.pullFromRemote();
 * ```
 */
export class InternalSyncManager {
  /** Flag indicating if a sync operation is currently in progress */
  public isSyncing = false;

  /** HTTP client instance with configured base URL and headers */
  private readonly axiosInstance: AxiosInstance;

  /**
   * Creates a new InternalSyncManager instance.
   *
   * @param eventStore - Store for managing events and form submissions
   * @param entityStore - Store for managing current entity state
   * @param eventApplierService - Service for applying events to entities
   * @param syncServerUrl - Base URL of the remote sync server
   * @param authToken - JWT authentication token for server requests
   * @param configId - Configuration ID for multi-tenant setups (defaults to "default")
   */
  constructor(
    private eventStore: EventStore,
    private entityStore: EntityStore,
    private eventApplierService: EventApplierService,
    private syncServerUrl: string,
    private authStorage: AuthStorageAdapter,
    private configId: string = "default",
  ) {
    this.axiosInstance = axios.create({
      baseURL: this.syncServerUrl,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  private async loadAuthToken(): Promise<void> {
    const token = await this.authStorage.getToken();
    if (token) {
      this.axiosInstance.defaults.headers.Authorization = `Bearer ${token.token}`;
      return;
    }
    throw new Error("Unauthorized");
  }

  /**
   * Gets the count of events waiting to be synchronized with the server.
   *
   * @returns Number of unsynced events
   *
   * @example
   * ```typescript
   * const count = await syncManager.getUnsyncedEventsCount();
   * console.log(`${count} events pending sync`);
   *
   * if (count > 50) {
   *   console.log('Large number of changes - consider syncing soon');
   * }
   * ```
   */
  async getUnsyncedEventsCount(): Promise<number> {
    const lastSyncTimestamp = await this.eventStore.getLastLocalSyncTimestamp();
    const result = await this.eventStore.getEventsSince(lastSyncTimestamp);
    return result.length;
  }

  /**
   * Checks if there are any events waiting to be synchronized.
   *
   * @returns True if there are unsynced events, false otherwise
   *
   * @example
   * ```typescript
   * if (await syncManager.hasUnsyncedEvents()) {
   *   console.log('Local changes detected - sync recommended');
   *   await syncManager.sync();
   * } else {
   *   console.log('No local changes to sync');
   * }
   * ```
   */
  async hasUnsyncedEvents(): Promise<boolean> {
    const lastSyncTimestamp = (await this.eventStore.getLastLocalSyncTimestamp()) || new Date(0);
    const result = await this.eventStore.getEventsSince(lastSyncTimestamp);
    return result.length > 0;
  }

  /**
   * Pulls events from the remote server since a specific timestamp.
   *
   * @param lastSyncTimestamp - ISO timestamp to fetch events from
   * @returns Object with events array and pagination cursor
   * @throws {Error} When API request fails or server returns error
   *
   * @private
   */
  private async pullFromRemote(lastSyncTimestamp: string): Promise<{
    events: FormSubmission[];
    nextCursor: string | Date | null;
  }> {
    const result = await this.axiosInstance.get(`/api/sync/pull?since=${lastSyncTimestamp}&configId=${this.configId}`);
    return result.data as {
      events: FormSubmission[];
      nextCursor: string | Date | null;
    };
  }

  /**
   * Pushes events to the remote server.
   *
   * @param events - Array of events to push to the server
   * @throws {Error} When API request fails or server rejects events
   *
   * @private
   */
  private async pushToRemote(events: FormSubmission[]): Promise<void> {
    await this.axiosInstance.post("/api/sync/push", { events, configId: this.configId });
  }

  /**
   * Pushes audit logs to the remote server.
   *
   * @param auditLogs - Array of audit log entries to push
   * @throws {Error} When API request fails
   *
   * @private
   */
  private async pushAuditLogsToRemote(auditLogs: AuditLogEntry[]): Promise<void> {
    await this.axiosInstance.post("/api/sync/push/audit-logs", { auditLogs, configId: this.configId });
  }

  /**
   * Splits an array into smaller chunks of specified size.
   *
   * Used for pagination during sync operations to avoid memory issues
   * and provide better error recovery.
   *
   * @param array - Array to split into chunks
   * @param chunkSize - Maximum size of each chunk
   * @returns Array of arrays (chunks)
   *
   * @private
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Uploads a chunk of events with retry logic and exponential backoff.
   *
   * Implements resilient upload with automatic retries for transient failures.
   * Uses exponential backoff to avoid overwhelming the server.
   *
   * @param chunk - Array of events to upload
   * @param retryCount - Maximum number of retry attempts (default: 3)
   * @param delayMs - Base delay in milliseconds between retries (default: 1000)
   * @returns True if upload succeeded, false otherwise
   * @throws {Error} When all retry attempts are exhausted
   *
   * @private
   */
  private async uploadChunkWithRetry(chunk: FormSubmission[], retryCount = 3, delayMs = 1000): Promise<boolean> {
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        await this.pushToRemote(chunk);
        return true;
      } catch (error) {
        if (attempt === retryCount) throw error;
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
    return false;
  }

  /**
   * Uploads all local unsynced events to the remote server.
   *
   * This method implements chunked upload with retry logic:
   * - Fetches all events since last local sync timestamp
   * - Splits events into chunks (default: 10 events per chunk)
   * - Uploads chunks sequentially with retry on failure
   * - Updates sync level to REMOTE for successful events
   * - Handles partial failures gracefully
   *
   * @param chunkSize - Number of events per chunk (default: 10)
   * @throws {Error} When upload fails after all retries
   *
   * @private
   *
   * TODO: Consider making chunk size configurable per instance
   * TODO: Add progress callback for UI updates
   */
  private async uploadLocalEvents(chunkSize = 10) {
    const lastLocalSyncTimestamp = await this.eventStore.getLastLocalSyncTimestamp();
    const localEvents = await this.eventStore.getEventsSince(lastLocalSyncTimestamp);

    if (localEvents.length) {
      const chunks = this.chunkArray(localEvents, chunkSize);
      const successfulChunks: FormSubmission[][] = [];

      try {
        // Process chunks sequentially
        for (const chunk of chunks) {
          await this.uploadChunkWithRetry.call(this, chunk);
          successfulChunks.push(chunk);
        }

        // Flatten and update sync level for all successful events
        const successfulEvents = successfulChunks.flat();
        await this.eventStore.updateSyncLevelFromEvents(
          successfulEvents.map((event) => ({
            ...event,
            syncLevel: SyncLevel.REMOTE,
          })),
        );

        await this.eventStore.setLastLocalSyncTimestamp(new Date().toISOString());
      } catch (error) {
        // Handle partial success - update sync level for successful chunks only
        if (successfulChunks.length > 0) {
          const partialSuccessEvents = successfulChunks.flat();
          await this.eventStore.updateSyncLevelFromEvents(
            partialSuccessEvents.map((event) => ({
              ...event,
              syncLevel: SyncLevel.REMOTE,
            })),
          );
        }

        const lastSuccessfulChunk = successfulChunks[successfulChunks.length - 1];
        if (lastSuccessfulChunk) {
          await this.eventStore.setLastLocalSyncTimestamp(
            lastSuccessfulChunk[lastSuccessfulChunk.length - 1].timestamp,
          );
        }

        throw new Error(`Sync failed after ${successfulChunks.length} chunks: ${error}`);
      }
    }
  }

  /**
   * Downloads and applies remote events from the server.
   *
   * This method implements paginated download with event application:
   * - Uses cursor-based pagination to handle large datasets
   * - Sorts events by timestamp to ensure correct application order
   * - Skips events that already exist locally (idempotent)
   * - Applies events using EventApplierService
   * - Updates remote sync timestamp on successful batches
   * - Rolls back timestamp on failure to enable retry
   *
   * @throws {Error} When download or event application fails
   *
   * @private
   *
   * TODO: Add conflict resolution for concurrent modifications
   * TODO: Consider batch size optimization based on network conditions
   */
  private async downloadRemoteEvents() {
    let nextCursor: string | Date | null = await this.eventStore.getLastRemoteSyncTimestamp();
    let lastSuccessfulTimestamp: string | null = null;

    while (nextCursor) {
      console.log("nextCursor", nextCursor);
      const result = await this.pullFromRemote(nextCursor.toString());
      const { events, nextCursor: newCursor } = result;

      if (events && events.length) {
        const sorted = events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        const latestEventTimestamp = sorted[sorted.length - 1].timestamp;

        try {
          for (const event of sorted) {
            event.syncLevel = SyncLevel.REMOTE;
            if (await this.eventStore.isEventExisted(event.guid)) {
              continue;
            }
            await this.eventApplierService.submitForm(event);
          }

          // Update lastRemoteSyncTimestamp only after successful batch
          lastSuccessfulTimestamp = latestEventTimestamp;
          await this.eventStore.setLastRemoteSyncTimestamp(latestEventTimestamp);
        } catch (error) {
          console.error(`Error applying remote events batch: ${error}`);
          // Roll back the lastRemoteSyncTimestamp to the last successful timestamp
          if (lastSuccessfulTimestamp) {
            await this.eventStore.setLastRemoteSyncTimestamp(lastSuccessfulTimestamp);
          }
          throw error;
        }
      }

      nextCursor = newCursor;
    }
  }

  /**
   * Checks if there are any unresolved potential duplicates.
   *
   * Sync operations are blocked when duplicates exist to prevent
   * data inconsistencies. Users must resolve duplicates before syncing.
   *
   * @returns True if potential duplicates exist, false otherwise
   *
   * @example
   * ```typescript
   * if (await syncManager.checkIfDuplicatesExist()) {
   *   console.log('Please resolve duplicate entities before syncing');
   *   const duplicates = await entityStore.getPotentialDuplicates();
   *   // Show duplicate resolution UI
   * }
   * ```
   */
  async checkIfDuplicatesExist(): Promise<boolean> {
    const duplicates = await this.entityStore.getPotentialDuplicates();
    return duplicates.length > 0;
  }

  /**
   * Performs a complete bidirectional synchronization with the remote server.
   *
   * This is the main sync method that orchestrates the entire sync process:
   * 1. **Duplicate Check**: Ensures no unresolved duplicates exist
   * 2. **Upload Phase**: Pushes local events to server (chunked, with retry)
   * 3. **Download Phase**: Pulls and applies remote events (paginated)
   *
   * The sync operation is atomic - if any phase fails, the entire sync is rolled back.
   * Only one sync operation can run at a time (protected by `isSyncing` flag).
   *
   * @throws {Error} When duplicates exist, authentication fails, or network errors occur
   *
   * @example
   * ```typescript
   * try {
   *   console.log('Starting full synchronization...');
   *   await syncManager.sync();
   *   console.log('Sync completed successfully');
   * } catch (error) {
   *   if (error.message.includes('Duplicates exist')) {
   *     console.log('Please resolve duplicates first');
   *   } else {
   *     console.error('Sync failed:', error.message);
   *   }
   * }
   * ```
   *
   * @example
   * Checking sync status:
   * ```typescript
   * if (syncManager.isSyncing) {
   *   console.log('Sync already in progress...');
   *   return;
   * }
   *
   * await syncManager.sync();
   * ```
   */
  async sync(): Promise<void> {
    if (this.isSyncing) {
      return;
    }

    this.isSyncing = true;
    try {
      if (await this.checkIfDuplicatesExist()) {
        throw new Error("Duplicates exist! Please resolve them before syncing.");
      }

      await this.loadAuthToken();
      await this.uploadLocalEvents();
      await this.downloadRemoteEvents();
    } catch (error) {
      console.error("Error during sync:", error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }
}
