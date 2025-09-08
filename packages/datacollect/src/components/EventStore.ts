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

/**
 * Merkle tree node for cryptographic integrity verification.
 *
 * Each node contains a SHA256 hash and references to left/right child nodes.
 * Used to build tamper-evident Merkle trees for event integrity verification.
 *
 * @private
 */
class MerkleNode {
  left: MerkleNode | null = null;
  right: MerkleNode | null = null;
  hash: string;

  constructor(data: string) {
    this.hash = this.calculateHash(data);
  }

  private calculateHash(data: string): string {
    return CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
  }
}

/**
 * Event store implementation providing tamper-evident event sourcing with Merkle tree integrity.
 *
 * The EventStoreImpl is the core component for managing immutable event storage with cryptographic
 * integrity verification. It implements complete event sourcing capabilities including audit trails,
 * Merkle tree verification, and sync timestamp management.
 *
 * Key features:
 * - **Immutable Event Storage**: All events are stored as immutable records
 * - **Merkle Tree Integrity**: Cryptographic verification of event integrity using SHA256
 * - **Audit Trail Management**: Complete audit logging for compliance and debugging
 * - **Sync Coordination**: Timestamp tracking for multiple sync operations
 * - **Event Verification**: Merkle proof generation and verification
 * - **Pagination Support**: Efficient handling of large event datasets
 * - **Tamper Detection**: Cryptographic detection of unauthorized modifications
 *
 * Architecture:
 * - Uses pluggable storage adapters for different persistence backends
 * - Maintains in-memory Merkle tree for fast integrity verification
 * - Implements event sourcing patterns with append-only semantics
 * - Provides both sync and async operations for different use cases
 * - Supports multiple sync levels (LOCAL, REMOTE, EXTERNAL)
 *
 * @example
 * Basic usage:
 * ```typescript
 * const eventStore = new EventStoreImpl(
 *   storageAdapter
 * );
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
 * const merkleRoot = eventStore.getMerkleRoot();
 * console.log('Current Merkle root:', merkleRoot);
 * ```
 *
 * @example
 * Event verification with Merkle proofs:
 * ```typescript
 * // Get proof for an event
 * const proof = await eventStore.getProof(event);
 *
 * // Verify event integrity
 * const isValid = eventStore.verifyEvent(event, proof);
 * if (isValid) {
 *   console.log('Event integrity verified');
 * } else {
 *   console.error('Event has been tampered with!');
 * }
 * ```
 *
 * @example
 * Audit trail management:
 * ```typescript
 * // Log audit entry
 * await eventStore.logAuditEntry({
 *   guid: 'audit-123',
 *   timestamp: new Date().toISOString(),
 *   userId: 'user-456',
 *   action: 'create-individual',
 *   eventGuid: 'event-789',
 *   entityGuid: 'person-101',
 *   changes: { name: 'John Doe' },
 *   signature: 'sha256:...'
 * });
 *
 * // Get audit trail for entity
 * const auditTrail = await eventStore.getAuditTrailByEntityGuid('person-101');
 * auditTrail.forEach(entry => {
 *   console.log(`${entry.timestamp}: ${entry.action} by ${entry.userId}`);
 * });
 * ```
 *
 * @example
 * Sync operations:
 * ```typescript
 * // Check for events since last sync
 * const lastSync = await eventStore.getLastRemoteSyncTimestamp();
 * const newEvents = await eventStore.getEventsSince(lastSync);
 *
 * if (newEvents.length > 0) {
 *   console.log(`${newEvents.length} events to sync`);
 *
 *   // Process sync...
 *
 *   // Update sync timestamp
 *   await eventStore.setLastRemoteSyncTimestamp(new Date().toISOString());
 * }
 * ```
 */
export class EventStoreImpl implements EventStore {
  private merkleRoot: MerkleNode | null = null;
  private storageAdapter: EventStorageAdapter;

  /**
   * Creates a new EventStoreImpl instance.
   *
   * @param storageAdapter - Storage adapter for persistence (IndexedDB, PostgreSQL, etc.)
   *
   * @example
   * ```typescript
   * // With IndexedDB for browser
   * const indexedDbAdapter = new IndexedDbEventStorageAdapter('tenant-123');
   * const browserEventStore = new EventStoreImpl(indexedDbAdapter);
   *
   * // With PostgreSQL for server
   * const postgresAdapter = new PostgresEventStorageAdapter(connectionString, 'tenant-123');
   * const serverEventStore = new EventStoreImpl(postgresAdapter);
   * ```
   */
  constructor(storageAdapter: EventStorageAdapter) {
    this.storageAdapter = storageAdapter;
  }

  async updateSyncLevelFromEvents(events: FormSubmission[]): Promise<void> {
    await this.storageAdapter.updateSyncLevelFromEvents(events);
  }

  async closeConnection(): Promise<void> {
    await this.storageAdapter.closeConnection();
  }

  /**
   * Initializes the event store and loads the Merkle tree for integrity verification.
   *
   * This method must be called before any other operations. It:
   * - Initializes the underlying storage adapter
   * - Loads existing events to rebuild the Merkle tree
   * - Prepares the store for cryptographic verification
   *
   * @throws {Error} When storage initialization fails
   *
   * @example
   * ```typescript
   * const eventStore = new EventStoreImpl(storageAdapter);
   *
   * try {
   *   await eventStore.initialize();
   *   console.log('Event store ready');
   * } catch (error) {
   *   console.error('Failed to initialize event store:', error);
   * }
   * ```
   */
  async initialize(): Promise<void> {
    await this.storageAdapter.initialize();
    await this.loadMerkleTree();
  }

  private async loadMerkleTree(): Promise<void> {
    const events = await this.storageAdapter.getEvents();
    const rootHash = await this.storageAdapter.getMerkleRoot();
    this.merkleRoot = rootHash ? new MerkleNode(rootHash) : null;
    this.updateMerkleTree(events);
  }

  private updateMerkleTree(events: FormSubmission[]): void {
    const leaves = events.map((event) => new MerkleNode(JSON.stringify(event)));
    this.merkleRoot = this.buildMerkleTree(leaves);
  }

  private buildMerkleTree(nodes: MerkleNode[]): MerkleNode | null {
    if (nodes.length === 0) return null;
    if (nodes.length === 1) return nodes[0];

    const parents: MerkleNode[] = [];
    for (let i = 0; i < nodes.length; i += 2) {
      const left = nodes[i];
      const right = i + 1 < nodes.length ? nodes[i + 1] : null;
      const parent = new MerkleNode(left.hash + (right ? right.hash : ""));
      parent.left = left;
      parent.right = right;
      parents.push(parent);
    }

    return this.buildMerkleTree(parents);
  }

  /**
   * Saves an event and updates the Merkle tree for integrity verification.
   *
   * The event is stored immutably and the Merkle tree is rebuilt to include
   * the new event. This ensures cryptographic integrity of the entire event log.
   *
   * @param form - Form submission/event to save
   * @returns Unique identifier for the saved event
   * @throws {Error} When event storage fails
   *
   * @example
   * ```typescript
   * const eventId = await eventStore.saveEvent({
   *   guid: 'event-123',
   *   entityGuid: 'person-456',
   *   type: 'create-individual',
   *   data: { name: 'John Doe', age: 30 },
   *   timestamp: new Date().toISOString(),
   *   userId: 'user-789',
   *   syncLevel: SyncLevel.LOCAL
   * });
   *
   * console.log('Event saved with ID:', eventId);
   * ```
   */
  async saveEvent(form: FormSubmission): Promise<string> {
    const guids = await this.storageAdapter.saveEvents([form]);
    await this.loadMerkleTree();

    return guids[0];
  }

  async getEvents(): Promise<FormSubmission[]> {
    return await this.storageAdapter.getEvents();
  }

  async getAllEvents(): Promise<FormSubmission[]> {
    return await this.storageAdapter.getEvents();
  }

  async isEventExisted(guid: string): Promise<boolean> {
    return await this.storageAdapter.isEventExisted(guid);
  }

  /**
   * Gets the current Merkle tree root hash for integrity verification.
   *
   * The root hash represents the cryptographic fingerprint of all events
   * in the store. Any modification to any event will change this hash.
   *
   * @returns SHA256 hash of the Merkle tree root, or empty string if no events
   *
   * @example
   * ```typescript
   * const rootHash = eventStore.getMerkleRoot();
   * console.log('Current integrity hash:', rootHash);
   *
   * // Store this hash for later verification
   * const storedHash = rootHash;
   *
   * // Later, after potential tampering...
   * const currentHash = eventStore.getMerkleRoot();
   * if (currentHash !== storedHash) {
   *   console.error('Data integrity compromised!');
   * }
   * ```
   */
  getMerkleRoot(): string {
    return this.merkleRoot ? this.merkleRoot.hash : "";
  }

  /**
   * Verifies an event's integrity using a Merkle proof.
   *
   * This method cryptographically verifies that an event has not been tampered
   * with by checking its Merkle proof against the current root hash.
   *
   * @param event - Event to verify
   * @param proof - Merkle proof path (array of sibling hashes)
   * @returns True if event is authentic and untampered, false otherwise
   *
   * @example
   * ```typescript
   * // Get proof for an event
   * const proof = await eventStore.getProof(suspiciousEvent);
   *
   * // Verify the event
   * const isValid = eventStore.verifyEvent(suspiciousEvent, proof);
   *
   * if (isValid) {
   *   console.log('Event integrity verified - data is authentic');
   * } else {
   *   console.error('Event verification failed - possible tampering detected!');
   *   // Take appropriate security measures
   * }
   * ```
   */
  verifyEvent(event: FormSubmission, proof: string[]): boolean {
    const leaf = this.hashEvent(event);
    let computedHash = leaf;

    for (const proofElement of proof) {
      if (computedHash < proofElement) {
        computedHash = this.hashPair(computedHash, proofElement);
      } else {
        computedHash = this.hashPair(proofElement, computedHash);
      }
    }

    return computedHash === this.getMerkleRoot();
  }

  async getProof(event: FormSubmission): Promise<string[]> {
    const events = await this.storageAdapter.getEvents();
    const leaf = this.hashEvent(event);
    const index = events.findIndex((e) => this.hashEvent(e) === leaf);
    if (index === -1) return [];

    const proof: string[] = [];
    let nodeIndex = index;
    let levelSize = events.length;

    while (levelSize > 1) {
      const isRightNode = nodeIndex % 2 === 1;
      const siblingIndex = isRightNode ? nodeIndex - 1 : nodeIndex + 1;

      if (siblingIndex < levelSize) {
        const siblingHash = this.hashEvent(events[siblingIndex]);
        proof.push(siblingHash);
      }

      nodeIndex = Math.floor(nodeIndex / 2);
      levelSize = Math.ceil(levelSize / 2);
    }

    return proof;
  }

  async logAuditEntry(entry: AuditLogEntry): Promise<void> {
    await this.storageAdapter.saveAuditLog([entry]);
  }

  async saveAuditLogs(entries: AuditLogEntry[]): Promise<void> {
    await this.storageAdapter.saveAuditLog(entries);
  }

  private hashEvent(event: FormSubmission): string {
    return CryptoJS.SHA256(JSON.stringify(event)).toString(CryptoJS.enc.Hex);
  }

  private hashPair(left: string, right: string): string {
    return CryptoJS.SHA256(left + right).toString(CryptoJS.enc.Hex);
  }

  async clearStore(): Promise<void> {
    await this.storageAdapter.clearStore();
    this.merkleRoot = null;
  }

  async updateEventSyncLevel(id: string, syncLevel: SyncLevel): Promise<void> {
    await this.storageAdapter.updateEventSyncLevel(id, syncLevel);
  }

  async updateAuditLogSyncLevel(entityId: string, syncLevel: SyncLevel): Promise<void> {
    await this.storageAdapter.updateAuditLogSyncLevel(entityId, syncLevel);
  }

  async getEventsSince(timestamp: string | Date): Promise<FormSubmission[]> {
    return await this.storageAdapter.getEventsSince(timestamp);
  }

  async getEventsSincePagination(
    timestamp: string | Date,
    limit: number,
  ): Promise<{ events: FormSubmission[]; nextCursor: string | Date | null }> {
    return await this.storageAdapter.getEventsSincePagination(timestamp, limit);
  }

  async getAuditLogsSince(timestamp: string): Promise<AuditLogEntry[]> {
    return await this.storageAdapter.getAuditLogsSince(timestamp);
  }

  getLastRemoteSyncTimestamp(): Promise<string> {
    return this.storageAdapter.getLastRemoteSyncTimestamp();
  }

  setLastRemoteSyncTimestamp(timestamp: string): Promise<void> {
    return this.storageAdapter.setLastRemoteSyncTimestamp(timestamp);
  }

  getLastLocalSyncTimestamp(): Promise<string> {
    return this.storageAdapter.getLastLocalSyncTimestamp();
  }

  setLastLocalSyncTimestamp(timestamp: string): Promise<void> {
    return this.storageAdapter.setLastLocalSyncTimestamp(timestamp);
  }

  getLastPullExternalSyncTimestamp(): Promise<string> {
    return this.storageAdapter.getLastPullExternalSyncTimestamp();
  }

  setLastPullExternalSyncTimestamp(timestamp: string): Promise<void> {
    return this.storageAdapter.setLastPullExternalSyncTimestamp(timestamp);
  }

  getLastPushExternalSyncTimestamp(): Promise<string> {
    return this.storageAdapter.getLastPushExternalSyncTimestamp();
  }

  setLastPushExternalSyncTimestamp(timestamp: string): Promise<void> {
    return this.storageAdapter.setLastPushExternalSyncTimestamp(timestamp);
  }

  getAuditTrailByEntityGuid(entityGuid: string): Promise<AuditLogEntry[]> {
    return this.storageAdapter.getAuditTrailByEntityGuid(entityGuid);
  }

  async getEventsSelfServicePagination(
    entityGuid: string,
    timestamp: string | Date,
  ): Promise<{ events: FormSubmission[] }> {
    return await this.storageAdapter.getEventsSelfServicePagination(entityGuid, timestamp);
  }
}
