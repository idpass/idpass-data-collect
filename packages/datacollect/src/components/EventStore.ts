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

import CryptoJS from "crypto-js";
import { AuditLogEntry, EventStorageAdapter, EventStore, FormSubmission, SyncLevel } from "../interfaces/types";
import { EventUpcasterService } from "../services/EventUpcasterService";

/**
 * Computes a SHA256 hash of the given data string.
 *
 * @private
 */
function sha256(data: string): string {
  return CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
}

/**
 * Event store implementation providing tamper-evident event sourcing with hash chain integrity.
 *
 * The EventStoreImpl is the core component for managing immutable event storage with cryptographic
 * integrity verification. It uses an incremental hash chain where each event's hash includes the
 * previous event's hash, providing O(1) append and O(n) full verification.
 *
 * Key features:
 * - **Immutable Event Storage**: All events are stored as immutable records.
 * - **Hash Chain Integrity**: Each event hash includes the previous event's hash for tamper detection.
 * - **Audit Trail Management**: Complete audit logging for compliance and debugging.
 * - **Sync Coordination**: Timestamp tracking for multiple sync operations.
 * - **Pagination Support**: Efficient handling of large event datasets.
 * - **Tamper Detection**: Cryptographic detection of unauthorized modifications.
 *
 * Architecture:
 * - Uses pluggable storage adapters for different persistence backends.
 * - Maintains the latest hash in the chain in memory for O(1) verification.
 * - Implements event sourcing patterns with append-only semantics.
 * - Supports multiple sync levels (LOCAL, REMOTE, EXTERNAL).
 *
 * @example
 * Basic usage:
 * ```typescript
 * const eventStore = new EventStoreImpl(storageAdapter);
 *
 * await eventStore.initialize();
 *
 * // Save an event
 * const eventId = await eventStore.saveEvent({
 *   guid: 'event-456',
 *   entityGuid: 'person-789',
 *   type: 'create-individual',
 *   data: { name: 'John Doe', age: 30 },
 *   timestamp: new Date().toISOString(),
 *   userId: 'user-123',
 *   syncLevel: SyncLevel.LOCAL
 * });
 *
 * // Verify integrity
 * const isValid = await eventStore.verifyHashChain();
 * ```
 *
 * @example
 * Sync operations:
 * ```typescript
 * const lastSync = await eventStore.getLastRemoteSyncTimestamp();
 * const newEvents = await eventStore.getEventsSince(lastSync);
 *
 * if (newEvents.length > 0) {
 *   await eventStore.setLastRemoteSyncTimestamp(new Date().toISOString());
 * }
 * ```
 */
export class EventStoreImpl implements EventStore {
  /** The latest hash in the event hash chain */
  private latestHash: string = "";
  private storageAdapter: EventStorageAdapter;
  /** Optional service for stamping events with the current schema version */
  private upcasterService?: EventUpcasterService;

  /**
   * Creates a new EventStoreImpl instance.
   *
   * @param storageAdapter Storage adapter for persistence (IndexedDB, PostgreSQL, etc.).
   * @param upcasterService Optional upcaster service. When provided, saved events are stamped with the current schema version for their event type.
   */
  constructor(storageAdapter: EventStorageAdapter, upcasterService?: EventUpcasterService) {
    this.storageAdapter = storageAdapter;
    this.upcasterService = upcasterService;
  }

  /**
   * Updates sync levels for multiple events.
   *
   * @param events Array of form submissions to update.
   * @returns A Promise that resolves when sync levels are updated.
   */
  async updateSyncLevelFromEvents(events: FormSubmission[]): Promise<void> {
    await this.storageAdapter.updateSyncLevelFromEvents(events);
  }

  /**
   * Closes database connections and cleans up resources.
   *
   * @returns A Promise that resolves when the connection is closed.
   */
  async closeConnection(): Promise<void> {
    await this.storageAdapter.closeConnection();
  }

  /**
   * Initializes the event store and computes the hash chain from existing events.
   *
   * @returns A Promise that resolves when the store is initialized.
   * @throws {Error} When storage initialization fails.
   */
  async initialize(): Promise<void> {
    await this.storageAdapter.initialize();
    await this.rebuildHashChain();
  }

  /**
   * Rebuilds the hash chain from all events in storage.
   * Called on initialization to compute the latest hash.
   */
  private async rebuildHashChain(): Promise<void> {
    const events = await this.storageAdapter.getEvents();
    let hash = "";
    for (const event of events) {
      hash = sha256(hash + JSON.stringify(event));
    }
    this.latestHash = hash;
  }

  /**
   * Computes the next hash in the chain for a given event.
   */
  private computeNextHash(event: FormSubmission): string {
    return sha256(this.latestHash + JSON.stringify(event));
  }

  /**
   * Saves an event and extends the hash chain.
   *
   * @param form Form submission/event to save.
   * @returns Unique identifier for the saved event.
   * @throws {Error} When event storage fails.
   */
  async saveEvent(form: FormSubmission): Promise<string> {
    // Stamp the event with the current schema version when an upcaster service is available
    if (this.upcasterService && form.schemaVersion === undefined) {
      form.schemaVersion = this.upcasterService.getCurrentVersion(form.type);
    }
    const guids = await this.storageAdapter.saveEvents([form]);
    this.latestHash = this.computeNextHash(form);
    return guids[0];
  }

  /**
   * Retrieves all events from the event store.
   *
   * @returns Array of all form submissions/events.
   */
  async getEvents(): Promise<FormSubmission[]> {
    return await this.storageAdapter.getEvents();
  }

  /**
   * Retrieves all events in the store.
   *
   * @returns Array of all form submissions/events.
   */
  async getAllEvents(): Promise<FormSubmission[]> {
    return await this.storageAdapter.getEvents();
  }

  /**
   * Checks if an event with the given GUID exists.
   *
   * @param guid The GUID of the event to check.
   * @returns `true` if the event exists, `false` otherwise.
   */
  async isEventExisted(guid: string): Promise<boolean> {
    return await this.storageAdapter.isEventExisted(guid);
  }

  /**
   * Gets the latest hash in the hash chain for integrity verification.
   *
   * The hash represents the cryptographic fingerprint of all events in the store.
   * Any modification to any event will cause the chain to break.
   *
   * @returns SHA256 hash of the latest chain link, or empty string if no events.
   */
  getLatestHash(): string {
    return this.latestHash;
  }

  /**
   * Verifies the integrity of the entire event hash chain.
   *
   * Walks through all events and recomputes the hash chain from scratch.
   * If the recomputed hash matches the stored latest hash, the chain is intact.
   *
   * @returns `true` if the chain is intact, `false` if tampering is detected.
   */
  async verifyHashChain(): Promise<boolean> {
    const events = await this.storageAdapter.getEvents();
    let hash = "";
    for (const event of events) {
      hash = sha256(hash + JSON.stringify(event));
    }
    return hash === this.latestHash;
  }

  /**
   * Logs a single audit entry.
   *
   * @param entry The audit log entry to save.
   * @returns A Promise that resolves when the entry is logged.
   */
  async logAuditEntry(entry: AuditLogEntry): Promise<void> {
    await this.storageAdapter.saveAuditLog([entry]);
  }

  /**
   * Saves multiple audit log entries.
   *
   * @param entries An array of audit log entries to save.
   * @returns A Promise that resolves when entries are saved.
   */
  async saveAuditLogs(entries: AuditLogEntry[]): Promise<void> {
    await this.storageAdapter.saveAuditLog(entries);
  }

  /**
   * Clears all data from the store (for testing).
   *
   * @returns A Promise that resolves when the store is cleared.
   */
  async clearStore(): Promise<void> {
    await this.storageAdapter.clearStore();
    this.latestHash = "";
  }

  /**
   * Updates the sync level of an event.
   *
   * @param id The ID of the event to update.
   * @param syncLevel The new sync level.
   * @returns A Promise that resolves when the sync level is updated.
   */
  async updateEventSyncLevel(id: string, syncLevel: SyncLevel): Promise<void> {
    await this.storageAdapter.updateEventSyncLevel(id, syncLevel);
  }

  /**
   * Updates the sync level of an audit log entry.
   *
   * @param entityId The ID of the entity associated with the audit log.
   * @param syncLevel The new sync level.
   * @returns A Promise that resolves when the sync level is updated.
   */
  async updateAuditLogSyncLevel(entityId: string, syncLevel: SyncLevel): Promise<void> {
    await this.storageAdapter.updateAuditLogSyncLevel(entityId, syncLevel);
  }

  /**
   * Retrieves events created since a specific timestamp.
   *
   * @param timestamp The timestamp to filter events from.
   * @returns An array of events created after the specified timestamp.
   */
  async getEventsSince(timestamp: string | Date): Promise<FormSubmission[]> {
    return await this.storageAdapter.getEventsSince(timestamp);
  }

  /**
   * Retrieves events since a timestamp with pagination support.
   *
   * @param timestamp The timestamp to filter events from.
   * @param limit The maximum number of events to return (default: 10).
   * @returns An object with an `events` array and a `nextCursor` for the next page.
   */
  async getEventsSincePagination(
    timestamp: string | Date,
    limit: number,
  ): Promise<{ events: FormSubmission[]; nextCursor: string | Date | null }> {
    return await this.storageAdapter.getEventsSincePagination(timestamp, limit);
  }

  /**
   * Retrieves audit logs created since a specific timestamp.
   *
   * @param timestamp The timestamp to filter audit logs from.
   * @returns An array of audit log entries created after the specified timestamp.
   */
  async getAuditLogsSince(timestamp: string): Promise<AuditLogEntry[]> {
    return await this.storageAdapter.getAuditLogsSince(timestamp);
  }

  /**
   * Retrieves the timestamp of the last remote synchronization.
   *
   * @returns A Promise that resolves with the timestamp string.
   */
  getLastRemoteSyncTimestamp(): Promise<string> {
    return this.storageAdapter.getLastRemoteSyncTimestamp();
  }

  /**
   * Sets the timestamp of the last remote synchronization.
   *
   * @param timestamp The timestamp string to set.
   * @returns A Promise that resolves when the timestamp is set.
   */
  setLastRemoteSyncTimestamp(timestamp: string): Promise<void> {
    return this.storageAdapter.setLastRemoteSyncTimestamp(timestamp);
  }

  /**
   * Retrieves the timestamp of the last local synchronization.
   *
   * @returns A Promise that resolves with the timestamp string.
   */
  getLastLocalSyncTimestamp(): Promise<string> {
    return this.storageAdapter.getLastLocalSyncTimestamp();
  }

  /**
   * Sets the timestamp of the last local synchronization.
   *
   * @param timestamp The timestamp string to set.
   * @returns A Promise that resolves when the timestamp is set.
   */
  setLastLocalSyncTimestamp(timestamp: string): Promise<void> {
    return this.storageAdapter.setLastLocalSyncTimestamp(timestamp);
  }

  /**
   * Retrieves the timestamp of the last external sync pull operation.
   *
   * @returns A Promise that resolves with the timestamp string.
   */
  getLastPullExternalSyncTimestamp(): Promise<string> {
    return this.storageAdapter.getLastPullExternalSyncTimestamp();
  }

  /**
   * Sets the timestamp of the last external sync pull operation.
   *
   * @param timestamp The timestamp string to set.
   * @returns A Promise that resolves when the timestamp is set.
   */
  setLastPullExternalSyncTimestamp(timestamp: string): Promise<void> {
    return this.storageAdapter.setLastPullExternalSyncTimestamp(timestamp);
  }

  /**
   * Retrieves the timestamp of the last external sync push operation.
   *
   * @returns A Promise that resolves with the timestamp string.
   */
  getLastPushExternalSyncTimestamp(): Promise<string> {
    return this.storageAdapter.getLastPushExternalSyncTimestamp();
  }

  /**
   * Sets the timestamp of the last external sync push operation.
   *
   * @param timestamp The timestamp string to set.
   * @returns A Promise that resolves when the timestamp is set.
   */
  setLastPushExternalSyncTimestamp(timestamp: string): Promise<void> {
    return this.storageAdapter.setLastPushExternalSyncTimestamp(timestamp);
  }

  /**
   * Retrieves the complete audit trail for a specific entity.
   *
   * @param entityGuid The global unique identifier of the entity.
   * @returns An array of audit log entries in chronological order.
   */
  getAuditTrailByEntityGuid(entityGuid: string): Promise<AuditLogEntry[]> {
    return this.storageAdapter.getAuditTrailByEntityGuid(entityGuid);
  }
}
