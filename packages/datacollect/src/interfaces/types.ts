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

/**
 * Entity types supported by the DataCollect system.
 *
 * @example
 * ```typescript
 * const individualType = EntityType.Individual; // "individual"
 * const groupType = EntityType.Group; // "group"
 * ```
 */
export enum EntityType {
  /** Individual person record */
  Individual = "individual",
  /** Group/household containing multiple individuals */
  Group = "group",
}

/**
 * Core entity document representing either an individual or group.
 *
 * All entities in the system extend from this base interface.
 * Uses event sourcing - the current state is derived from applying events.
 *
 * @example
 * ```typescript
 * const individual: EntityDoc = {
 *   id: "1",
 *   guid: "550e8400-e29b-41d4-a716-446655440000",
 *   type: EntityType.Individual,
 *   version: 1,
 *   data: { name: "John Doe", age: 30 },
 *   lastUpdated: "2024-01-01T00:00:00Z"
 * };
 * ```
 */
export interface EntityDoc {
  /** Internal database ID (auto-generated) */
  id: string;
  /** Global unique identifier (user-provided or generated) */
  guid: string;
  /** Optional external system identifier for sync */
  externalId?: string;
  /** Optional display name for the entity */
  name?: string;
  /** Type of entity (Individual or Group) */
  type: EntityType;
  /** Version number for optimistic concurrency control */
  version: number;
  /** Flexible data payload containing entity-specific fields */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  /** ISO timestamp of last modification */
  lastUpdated: string;
}

/**
 * Represents an entity's initial and current state for change tracking.
 *
 * Used throughout the system to track modifications and handle sync conflicts.
 *
 * @example
 * ```typescript
 * const entityPair: EntityPair = {
 *   guid: "550e8400-e29b-41d4-a716-446655440000",
 *   initial: originalEntity,
 *   modified: updatedEntity
 * };
 *
 * // Check if entity has been modified
 * const hasChanges = entityPair.initial.version !== entityPair.modified.version;
 * ```
 */
export interface EntityPair {
  /** Global unique identifier for the entity */
  guid: string;
  /** Entity state when first loaded or last synced */
  initial: EntityDoc;
  /** Current entity state with any local modifications */
  modified: EntityDoc;
}

/**
 * Synchronization levels indicating how far data has propagated through the system.
 *
 * @example
 * ```typescript
 * const localForm: FormSubmission = {
 *   syncLevel: SyncLevel.LOCAL, // Only on local device
 *   // ... other properties
 * };
 * ```
 */
export enum SyncLevel {
  /** Local only - not synced anywhere */
  LOCAL = 0,
  /** Synced with remote DataCollect server */
  REMOTE = 1,
  /** Synced with external system (e.g. OpenSPP, SCOPE) */
  EXTERNAL = 2,
}

/**
 * Group entity representing a household or collection of individuals.
 *
 * @example
 * ```typescript
 * const household: GroupDoc = {
 *   type: EntityType.Group,
 *   memberIds: ["individual-1", "individual-2"],
 *   data: {
 *     name: "Smith Family",
 *     address: "123 Main St"
 *   },
 *   // ... other EntityDoc properties
 * };
 * ```
 */
export interface GroupDoc extends EntityDoc {
  type: EntityType.Group;
  /** Array of entity GUIDs that are members of this group */
  memberIds: string[];
}

/**
 * Individual entity representing a single person.
 *
 * @example
 * ```typescript
 * const person: IndividualDoc = {
 *   type: EntityType.Individual,
 *   data: {
 *     name: "John Doe",
 *     dateOfBirth: "1990-01-01"
 *   },
 *   // ... other EntityDoc properties
 * };
 * ```
 */
export interface IndividualDoc extends EntityDoc {
  type: EntityType.Individual;
}

/**
 * Detailed entity document with additional metadata for UI display.
 */
export interface DetailEntityDoc extends EntityDoc {
  /** Internal database ID */
  id: string;
  /** Indicates if the entity is missing/not found */
  missing?: true;
}

/**
 * Detailed group document with member information loaded.
 *
 * Used for displaying complete group information including member details.
 */
export interface DetailGroupDoc extends GroupDoc {
  /** Number of members in this group */
  memberCount: number;
  /** Indicates if the group is missing/not found */
  missing?: true;
  /** Loaded member entities (can be nested groups) */
  members: DetailEntityDoc[] | DetailGroupDoc[];
}

/**
 * Form submission representing a command/event in the event sourcing system.
 *
 * Every change to entities is captured as a FormSubmission, enabling complete
 * audit trails and data synchronization.
 *
 * @example
 * ```typescript
 * const createForm: FormSubmission = {
 *   guid: "form-123",
 *   entityGuid: "person-456",
 *   type: "create-individual",
 *   data: { name: "John Doe", age: 30 },
 *   timestamp: "2024-01-01T12:00:00Z",
 *   userId: "user-789",
 *   syncLevel: SyncLevel.LOCAL
 * };
 * ```
 */
export interface FormSubmission {
  /** Unique identifier for this form submission/event */
  guid: string;
  /** GUID of the entity this form submission targets */
  entityGuid: string;
  /** Event type (e.g., 'create-individual', 'add-member') */
  type: string;
  /** Event payload containing the actual data changes */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  /** ISO timestamp when this event was created */
  timestamp: string;
  /** User who created this event */
  userId: string;
  /** Current synchronization level of this event */
  syncLevel: SyncLevel;
}

/**
 * Audit log entry for tracking all system changes with cryptographic signatures.
 *
 * Provides complete audit trail with tamper-evident logging for compliance
 * and security requirements.
 *
 * @example
 * ```typescript
 * const auditEntry: AuditLogEntry = {
 *   guid: "audit-123",
 *   timestamp: "2024-01-01T12:00:00Z",
 *   userId: "user-456",
 *   action: "create-individual",
 *   eventGuid: "event-789",
 *   entityGuid: "person-101",
 *   changes: { name: "John Doe", age: 30 },
 *   signature: "sha256:abc123..."
 * };
 * ```
 */
export interface AuditLogEntry {
  /** Unique identifier for this audit log entry */
  guid: string;
  /** ISO timestamp when the action occurred */
  timestamp: string;
  /** User who performed the action */
  userId: string;
  /** Type of action performed */
  action: string;
  /** GUID of the related event/form submission */
  eventGuid: string;
  /** GUID of the entity that was affected */
  entityGuid: string;
  /** Object containing the actual changes made */
  changes: object;
  /** Cryptographic signature for tamper detection */
  signature: string;
}

/**
 * Event store interface for managing form submissions and audit logs.
 *
 * Provides event sourcing capabilities with Merkle tree integrity verification.
 * All changes to entities flow through this store as immutable events.
 */
export interface EventStore {
  /** Initialize the event store (create tables, indexes, etc.) */
  initialize(): Promise<void>;
  /** Save a single event and return its ID */
  saveEvent(form: FormSubmission): Promise<string>;
  /** Get events with optional filtering */
  getEvents(): Promise<FormSubmission[]>;
  /** Get all events in the store */
  getAllEvents(): Promise<FormSubmission[]>;
  /** Get the current Merkle tree root hash for integrity verification */
  getMerkleRoot(): string;
  /** Verify an event using Merkle tree proof */
  verifyEvent(event: FormSubmission, proof: string[]): boolean;
  /** Get Merkle tree proof for an event */
  getProof(form: FormSubmission): Promise<string[]>;
  /** Log a single audit entry */
  logAuditEntry(entry: AuditLogEntry): Promise<void>;
  /** Save multiple audit log entries */
  saveAuditLogs(entries: AuditLogEntry[]): Promise<void>;
  /** Update the sync level of an event */
  updateEventSyncLevel(id: string, syncLevel: SyncLevel): Promise<void>;
  /** Update the sync level of an audit log entry */
  updateAuditLogSyncLevel(id: string, syncLevel: SyncLevel): Promise<void>;
  /** Get audit logs created since a specific timestamp */
  getAuditLogsSince(timestamp: string): Promise<AuditLogEntry[]>;
  /** Get events created since a specific timestamp */
  getEventsSince(timestamp: string | Date): Promise<FormSubmission[]>;
  /** Get events since timestamp with pagination support (10 events/page default) */
  getEventsSincePagination(
    timestamp: string | Date,
    limit: number,
  ): Promise<{
    events: FormSubmission[];
    nextCursor: string | Date | null;
  }>;
  /** Update sync levels for multiple events */
  updateSyncLevelFromEvents(events: FormSubmission[]): Promise<void>;
  /** Get the timestamp of the last remote sync */
  getLastRemoteSyncTimestamp(): Promise<string>;
  /** Set the timestamp of the last remote sync */
  setLastRemoteSyncTimestamp(timestamp: string): Promise<void>;
  /** Get the timestamp of the last local sync */
  getLastLocalSyncTimestamp(): Promise<string>;
  /** Set the timestamp of the last local sync */
  setLastLocalSyncTimestamp(timestamp: string): Promise<void>;
  /** Get the timestamp of the last external sync pull */
  getLastPullExternalSyncTimestamp(): Promise<string>;
  /** Set the timestamp of the last external sync pull */
  setLastPullExternalSyncTimestamp(timestamp: string): Promise<void>;
  /** Get the timestamp of the last external sync push */
  getLastPushExternalSyncTimestamp(): Promise<string>;
  /** Set the timestamp of the last external sync push */
  setLastPushExternalSyncTimestamp(timestamp: string): Promise<void>;
  /** Check if an event with the given GUID exists */
  isEventExisted(guid: string): Promise<boolean>;
  /** Get complete audit trail for a specific entity */
  getAuditTrailByEntityGuid(entityGuid: string): Promise<AuditLogEntry[]>;
  /** Clear all data from the store (for testing) */
  clearStore(): Promise<void>;
  /** Close database connections and cleanup resources */
  closeConnection(): Promise<void>;
}

/**
 * Storage adapter interface for event persistence.
 *
 * Provides the low-level storage operations for events and audit logs.
 * Implementations include IndexedDbEventStorageAdapter and PostgresEventStorageAdapter.
 */
export interface EventStorageAdapter {
  /** Initialize the storage adapter (create tables, indexes, etc.) */
  initialize(): Promise<void>;
  /** Save multiple events and return their IDs */
  saveEvents(forms: FormSubmission[]): Promise<string[]>;
  /** Get all events from storage */
  getEvents(): Promise<FormSubmission[]>;
  /** Save multiple audit log entries */
  saveAuditLog(entries: AuditLogEntry[]): Promise<void>;
  /** Get all audit log entries */
  getAuditLog(): Promise<AuditLogEntry[]>;
  /** Save Merkle tree root hash */
  saveMerkleRoot(root: string): Promise<void>;
  /** Get current Merkle tree root hash */
  getMerkleRoot(): Promise<string>;
  /** Update the sync level of an event */
  updateEventSyncLevel(id: string, syncLevel: SyncLevel): Promise<void>;
  /** Update the sync level of an audit log entry */
  updateAuditLogSyncLevel(id: string, syncLevel: SyncLevel): Promise<void>;
  /** Get events created since a specific timestamp */
  getEventsSince(timestamp: string | Date): Promise<FormSubmission[]>;
  /** Get audit logs created since a specific timestamp */
  getAuditLogsSince(timestamp: string): Promise<AuditLogEntry[]>;
  /** Get events since timestamp with pagination support (10 events/page default) */
  getEventsSincePagination(
    timestamp: string | Date,
    limit: number,
  ): Promise<{
    events: FormSubmission[];
    nextCursor: string | Date | null;
  }>;
  /** Update sync levels for multiple events */
  updateSyncLevelFromEvents(events: FormSubmission[]): Promise<void>;
  /** Get the timestamp of the last remote sync */
  getLastRemoteSyncTimestamp(): Promise<string>;
  /** Set the timestamp of the last remote sync */
  setLastRemoteSyncTimestamp(timestamp: string): Promise<void>;
  /** Get the timestamp of the last local sync */
  getLastLocalSyncTimestamp(): Promise<string>;
  /** Set the timestamp of the last local sync */
  setLastLocalSyncTimestamp(timestamp: string): Promise<void>;
  /** Get the timestamp of the last external sync pull */
  getLastPullExternalSyncTimestamp(): Promise<string>;
  /** Set the timestamp of the last external sync pull */
  setLastPullExternalSyncTimestamp(timestamp: string): Promise<void>;
  /** Get the timestamp of the last external sync push */
  getLastPushExternalSyncTimestamp(): Promise<string>;
  /** Set the timestamp of the last external sync push */
  setLastPushExternalSyncTimestamp(timestamp: string): Promise<void>;
  /** Check if an event with the given GUID exists */
  isEventExisted(guid: string): Promise<boolean>;
  /** Get complete audit trail for a specific entity */
  getAuditTrailByEntityGuid(entityGuid: string): Promise<AuditLogEntry[]>;
  /** Clear all data from the store (for testing) */
  clearStore(): Promise<void>;
  /** Close database connections and cleanup resources */
  closeConnection(): Promise<void>;
}

/**
 * Event applier interface for transforming events into entity state changes.
 *
 * Core component of the event sourcing system that knows how to apply
 * specific event types to entities. Custom event appliers can be registered
 * for domain-specific operations.
 *
 * @example
 * ```typescript
 * const customApplier: EventApplier = {
 *   apply: async (entity, form, getEntity, saveEntity) => {
 *     if (form.type === 'custom-operation') {
 *       const updatedEntity = { ...entity, data: { ...entity.data, ...form.data } };
 *       return updatedEntity;
 *     }
 *     throw new Error(`Unsupported event type: ${form.type}`);
 *   }
 * };
 * ```
 */
export interface EventApplier {
  /**
   * Apply an event (form submission) to an entity to produce the new state.
   *
   * @param entity - The current entity state
   * @param form - The form submission/event to apply
   * @param getEntity - Function to retrieve related entities
   * @param saveEntity - Function to save entity changes
   * @returns The updated entity after applying the event
   */
  apply(
    entity: EntityDoc,
    form: FormSubmission,
    getEntity: (id: string) => Promise<EntityPair | null>,
    saveEntity: (
      action: string,
      existingEntity: EntityDoc,
      modifiedEntity: EntityDoc,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      changes: Record<string, any>,
    ) => Promise<void>,
  ): Promise<EntityDoc>;
}

/**
 * Encryption adapter interface for data protection.
 *
 * Provides encryption capabilities for sensitive data fields.
 * Currently not fully implemented (data parameter is 'never').
 */
export interface EncryptionAdapter {
  /** Encrypt data (not implemented) */
  encrypt(data: never): Promise<string>;
  /** Decrypt encrypted data */
  decrypt(data: string): Promise<unknown>;
}

/**
 * Export/import manager interface for data portability.
 *
 * Enables exporting all entity and event data for backup, migration,
 * or integration with other systems.
 */
export interface ExportImportManager {
  /** Export all data in the specified format */
  exportData(format: "json" | "binary"): Promise<Buffer>;
  /** Import data from a buffer */
  importData(data: Buffer): Promise<ImportResult>;
}

/** Result of an import operation */
export type ImportResult = {
  /** Status of the import operation */
  status: string;
  /** Number of entities successfully imported */
  importedEntities: number;
};

/**
 * Search criteria for entity queries.
 * Array of key-value pairs for filtering entities.
 *
 * @example
 * ```typescript
 * const criteria: SearchCriteria = [
 *   { "data.age": { $gte: 18 } },
 *   { "type": "individual" }
 * ];
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SearchCriteria = Record<string, any>[];

/**
 * Entity store interface for managing current entity state.
 *
 * Stores the materialized view of entities derived from applying events.
 * Optimized for fast queries and lookups.
 */
export interface EntityStore {
  /** Initialize the entity store (create tables, indexes, etc.) */
  initialize(): Promise<void>;
  /** Save entity with both initial and current state */
  saveEntity(initial: EntityDoc, modified: EntityDoc): Promise<void>;
  /** Get entity by internal ID */
  getEntity(id: string): Promise<EntityPair | null>;
  /** Get entity by external system ID */
  getEntityByExternalId(externalId: string): Promise<EntityPair | null>;
  /** Search entities using query criteria */
  searchEntities(criteria: SearchCriteria): Promise<EntityPair[]>;
  /** Get all entities in the store */
  getAllEntities(): Promise<EntityPair[]>;
  /** Get entities modified since a timestamp (for sync) */
  getModifiedEntitiesSince(timestamp: string): Promise<EntityPair[]>;
  /** Mark an entity as synced with remote server */
  markEntityAsSynced(id: string): Promise<void>;
  /** Delete an entity by ID */
  deleteEntity(id: string): Promise<void>;
  /** Save potential duplicate entity pairs for review */
  savePotentialDuplicates(duplicates: Array<{ entityGuid: string; duplicateGuid: string }>): Promise<void>;
  /** Get all potential duplicate pairs */
  getPotentialDuplicates(): Promise<Array<{ entityGuid: string; duplicateGuid: string }>>;
  /** Resolve potential duplicate pairs (mark as reviewed) */
  resolvePotentialDuplicates(duplicates: Array<{ entityGuid: string; duplicateGuid: string }>): Promise<void>;
  /** Clear all data from the store (for testing) */
  clearStore(): Promise<void>;
  /** Close database connections and cleanup resources */
  closeConnection(): Promise<void>;
}

/**
 * Storage adapter interface for entity persistence.
 *
 * Provides the low-level storage operations for entities.
 * Implementations include IndexedDbEntityStorageAdapter and PostgresEntityStorageAdapter.
 */
export interface EntityStorageAdapter {
  /** Initialize the storage adapter (create tables, indexes, etc.) */
  initialize(): Promise<void>;
  /** Save an entity pair to storage */
  saveEntity(entity: EntityPair): Promise<void>;
  /** Get entity by internal ID */
  getEntity(id: string): Promise<EntityPair | null>;
  /** Get entity by external system ID */
  getEntityByExternalId(externalId: string): Promise<EntityPair | null>;
  /** Search entities using query criteria */
  searchEntities(criteria: SearchCriteria): Promise<EntityPair[]>;
  /** Get all entities from storage */
  getAllEntities(): Promise<EntityPair[]>;
  /** Delete an entity by ID */
  deleteEntity(id: string): Promise<void>;
  /** Save potential duplicate entity pairs for review */
  savePotentialDuplicates(duplicates: Array<{ entityGuid: string; duplicateGuid: string }>): Promise<void>;
  /** Get all potential duplicate pairs */
  getPotentialDuplicates(): Promise<Array<{ entityGuid: string; duplicateGuid: string }>>;
  /** Resolve potential duplicate pairs (mark as reviewed) */
  resolvePotentialDuplicates(duplicates: Array<{ entityGuid: string; duplicateGuid: string }>): Promise<void>;
  /** Clear all data from storage (for testing) */
  clearStore(): Promise<void>;
  /** Close database connections and cleanup resources */
  closeConnection(): Promise<void>;
}

/**
 * Sync adapter interface for external system synchronization.
 *
 * Provides integration with external systems for bi-directional data sync.
 * Implementations include OpenSppSyncAdapter and MockSyncServerAdapter.
 */
export interface SyncAdapter {
  /** Push events to external system */
  pushEvents(events: FormSubmission[]): Promise<void>;
  /** Pull entities from external system */
  pullEntities(): Promise<void>;
  /** Push entities to external system */
  pushEntities(entities: EntityDoc[]): Promise<void>;
  /** Register callback for sync completion */
  onSyncComplete(callback: (status: SyncStatus) => void): void;
  /** Start automatic synchronization at specified interval */
  startAutoSync(interval: number): void;
  /** Stop automatic synchronization */
  stopAutoSync(): void;
  /** Get the server timestamp to prevent clock differences between clients and server */
  getServerTimestamp(): Promise<string>;
}

/**
 * Authenticated sync adapter for systems requiring authentication.
 */
export interface AuthenticatedSyncAdapter extends SyncAdapter {
  /** Authenticate with the external system */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticate(): Promise<any>;
}

/**
 * Status information for sync operations.
 */
export interface SyncStatus {
  /** Current sync status (e.g., 'idle', 'syncing', 'error') */
  status: string;
  /** ISO timestamp of last successful sync */
  lastSyncTime: string;
  /** Number of pending changes waiting to be synced */
  pendingChanges: number;
}

/**
 * Merkle tree storage interface for data integrity verification.
 */
export interface MerkleTreeStorage {
  /** Initialize the Merkle tree storage */
  initialize(): Promise<void>;
  /** Save the root hash of the Merkle tree */
  saveRootHash(hash: string): Promise<void>;
  /** Get the current root hash */
  getRootHash(): Promise<string>;
  /** Clear the Merkle tree storage */
  clearStore(): Promise<void>;
  /** Close storage connections */
  closeConnection(): Promise<void>;
}

/**
 * Represents a conflict between local and remote entity versions.
 *
 * Occurs during synchronization when the same entity has been
 * modified both locally and remotely.
 */
export interface Conflict {
  /** Local version of the entity */
  local: EntityPair;
  /** Remote version of the entity */
  remote: EntityPair;
}

/**
 * Configuration for external system synchronization.
 *
 * @example
 * ```typescript
 * const openSppConfig: ExternalSyncConfig = {
 *   type: "openspp",
 *   url: "http://openspp.example.com",
 *   database: "openspp_db",
 *   auth: "basic"
 * };
 * ```
 */
export type ExternalSyncConfig = {
  /** Type of external system (e.g., 'openspp', 'mock-sync-server') */
  type: string;
  /** Authentication method (e.g., 'basic', 'token') */
  auth?: string;
  /** URL of the external system */
  url: string;
  /** Extra fields for the external system */
  extraFields?: { name: string; value: string }[];
};

/**
 * External sync adapter interface for third-party system integration.
 *
 * Implementations handle the specifics of syncing with different external systems.
 */
export interface ExternalSyncAdapter {
  /** Perform synchronization with the external system */
  sync(credentials?: ExternalSyncCredentials): Promise<void>;
}

/**
 * Credentials for authenticating with external systems.
 */
export interface ExternalSyncCredentials {
  /** Username for basic authentication */
  username: string;
  /** Password for basic authentication */
  password: string;
}

/**
 * OpenID Connect (OIDC) configuration for authentication.
 *
 * Defines the configuration parameters needed to integrate with an OIDC provider
 * for user authentication and authorization flows.
 *
 * @example
 * ```typescript
 * const oidcConfig: OIDCConfig = {
 *   authority: "https://auth.example.com",
 *   client_id: "datacollect-app",
 *   redirect_uri: "https://app.example.com/callback",
 *   post_logout_redirect_uri: "https://app.example.com/logout",
 *   response_type: "code",
 *   scope: "openid profile email",
 *   state: "random-state-value",
 *   custom: { tenant: "production" }
 * };
 * ```
 */
export interface OIDCConfig {
  /** The OIDC provider's base URL (issuer identifier) */
  authority: string;
  /** Client identifier registered with the OIDC provider */
  client_id: string;
  /** URI where the OIDC provider redirects after successful authentication */
  redirect_uri: string;
  /** URI where the OIDC provider redirects after logout */
  post_logout_redirect_uri: string;
  /** OAuth 2.0 response type (typically "code" for authorization code flow) */
  response_type: string;
  /** Space-separated list of requested scopes (e.g., "openid profile email") */
  scope: string;
  /** Optional state parameter for CSRF protection during auth flow */
  state?: string;
  /** Optional custom parameters specific to the OIDC provider */
  extraQueryParams?: Record<string, string>;
}

/**
 * Authentication result returned after successful OIDC authentication.
 *
 * Contains the tokens and metadata received from the OIDC provider
 * after a successful authentication flow.
 *
 * @example
 * ```typescript
 * const authResult: AuthResult = {
 *   access_token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
 *   id_token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
 *   refresh_token: "def50200a1b2c3d4e5f6...",
 *   expires_in: 3600,
 *   profile: {
 *     sub: "user-123",
 *     name: "John Doe",
 *     email: "john.doe@example.com"
 *   }
 * };
 * ```
 */
export interface AuthResult {
  /** JWT access token for API authentication */
  access_token: string;
  /** Optional JWT ID token containing user identity claims */
  id_token?: string;
  /** Optional refresh token for obtaining new access tokens */
  refresh_token?: string;
  /** Token lifetime in seconds from issuance */
  expires_in: number;
  /** Optional user profile information extracted from tokens */
  profile?: Record<string, string>; // Optional profile information
  user_metadata?: Record<string, string>;
}

export interface AuthConfig {
  type: string;
  fields: Record<string, string>;
}

export interface PasswordCredentials {
  username: string;
  password: string;
}

export interface TokenCredentials {
  token: string;
}

export interface AuthAdapter {
  initialize(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  login(credentials: PasswordCredentials | TokenCredentials | null): Promise<{ username: string; token: string }>;
  logout(): Promise<void>;
  validateToken(token: string): Promise<boolean>;
  handleCallback(): Promise<void>;
}

export interface AuthStorageAdapter {
  initialize(): Promise<void>;
  getUsername(): Promise<string>;
  getToken(): Promise<{ provider: string; token: string } | null>;
  getTokenByProvider(provider: string): Promise<string>;
  setUsername(username: string): Promise<void>;
  setToken(provider: string, token: string): Promise<void>;
  removeToken(provider: string): Promise<void>;
  removeAllTokens(): Promise<void>;
  closeConnection(): Promise<void>;
  clearStore(): Promise<void>;
}

export interface SingleAuthStorage {
  getToken(): Promise<string>;
  setToken(token: string): Promise<void>;
  removeToken(): Promise<void>;
}
