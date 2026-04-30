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
  /** Activity record (training, referral, home visit, assistance, etc.) */
  Record = "record",
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
  /** Multiple typed identifiers per entity (national ID, UNHCR ID, etc.) */
  identifiers?: IdentifierRecord[];
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
  /** Entity state when first loaded or last synced (null for entities not yet synced) */
  initial: EntityDoc | null;
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
  /** Typed membership records (replaces flat memberIds for rich membership data) */
  membershipRecords?: MembershipRecord[];
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
 * Activity record entity (training, referral, home visit, assistance, etc.).
 *
 * Records are entities that capture activities or services linked to
 * an individual or group, but are not themselves people or households.
 */
export interface RecordDoc extends EntityDoc {
  type: EntityType.Record;
  /** GUID of the parent entity this record belongs to (optional) */
  parentEntityGuid?: string;
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
  /** Schema version of the event data for upcasting support. Undefined treated as version 1. */
  schemaVersion?: number;
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
  /** Get the latest hash in the hash chain for integrity verification */
  getLatestHash(): string;
  /** Verify the integrity of the entire event hash chain */
  verifyHashChain(): Promise<boolean>;
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
  /** Get the last advertised scope hash from the server, or null if never seen. */
  getLastScopeHash(): Promise<string | null>;
  /** Persist the latest scope hash (called after a successful pull). */
  setLastScopeHash(hash: string): Promise<void>;
  /** Check if an event with the given GUID exists */
  isEventExisted(guid: string): Promise<boolean>;
  /** Get complete audit trail for a specific entity */
  getAuditTrailByEntityGuid(entityGuid: string): Promise<AuditLogEntry[]>;
  /** Clear all data from the store (for testing) */
  clearStore(): Promise<void>;
  /** Close database connections and cleanup resources */
  closeConnection(): Promise<void>;
  /** Persist the latest hash anchor for tamper detection on restart */
  persistHashAnchor(hash: string): Promise<void>;
  /** Retrieve the previously persisted hash anchor, or null if none exists */
  getPersistedHashAnchor(): Promise<string | null>;
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
  /** Save entity with both initial and current state (initial is null for entities not yet synced) */
  saveEntity(initial: EntityDoc | null, modified: EntityDoc): Promise<void>;
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
  /** Get entities modified since a timestamp (for sync) */
  getModifiedEntitiesSince(timestamp: string): Promise<EntityPair[]>;
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
 * Shared abstraction over Drizzle's database and transaction objects.
 *
 * Both the full database connection and transaction objects expose an
 * `execute` method for running raw SQL and a `transaction` method for
 * nesting transactions. Typing adapter methods against this interface
 * lets them accept either a full DB or a transaction handle, which is
 * required for callers that need to coordinate writes across multiple
 * adapters inside a single transaction.
 */
export type DrizzleQueryExecutor = {
  execute: (query: unknown) => Promise<unknown>;
  transaction: <T>(fn: (tx: DrizzleQueryExecutor) => Promise<T>) => Promise<T>;
};

/**
 * Sync adapter interface for external system synchronization.
 *
 * Provides integration with external systems for bi-directional data sync.
 * Implementations include OpenSppSyncAdapter and MockRegistrySyncAdapter.
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
 * Hash chain storage interface for data integrity verification.
 * Replaced the Merkle tree approach with an incremental hash chain
 * for O(1) append and simpler implementation.
 */
export interface HashChainStorage {
  /** Initialize the hash chain storage */
  initialize(): Promise<void>;
  /** Clear the hash chain storage */
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
 *   type: "openspp-v2-adapter",
 *   url: "http://openspp.example.com",
 *   auth: "oauth2",
 *   adapterConfig: {
 *     clientId: "my-client-id",
 *     clientSecret: "my-secret",
 *   }
 * };
 * ```
 */
/**
 * Represents a membership record linking an individual to a group.
 * Replaces the flat `memberIds: string[]` array with typed metadata.
 */
export interface MembershipRecord {
  /** GUID of the individual member */
  individualGuid: string;
  /** Membership type codes (e.g., "head", "spouse", "child") */
  membershipTypes: string[];
  /** ISO date when membership started */
  startDate: string;
  /** ISO date when membership ended (null = ongoing) */
  endDate: string | null;
}

/**
 * Represents a typed identifier for an entity.
 * Supports multiple IDs per entity (national ID, UNHCR ID, etc.).
 */
export interface IdentifierRecord {
  /** Identifier type code (e.g., "national-id", "unhcr-id") */
  type: string;
  /** The identifier value */
  value: string;
  /** ISO date when the identifier expires (null = no expiry) */
  expiryDate: string | null;
}

/**
 * RBAC role identifiers for the DataCollect system.
 */
export enum SystemRole {
  /** Can create and update entities in assigned areas */
  ENUMERATOR = "enumerator",
  /** Can review submissions and see all data in assigned areas */
  SUPERVISOR = "supervisor",
  /** Can manage users and configure the program */
  PROGRAM_ADMIN = "program-admin",
  /** Can manage programs and tenants (replaces current admin role) */
  SYSTEM_ADMIN = "system-admin",
  /** Read-only access to assigned data */
  VIEWER = "viewer",
}

/**
 * Represents a user's role assignment within a program and area scope.
 */
export interface UserRoleAssignment {
  /** User identifier */
  userId: string;
  /** Program identifier */
  programId: string;
  /** Role assigned to the user */
  role: SystemRole;
  /** Area codes the user is assigned to (empty = all areas) */
  areaCodes: string[];
  /** Whether this is a local (area-restricted) or global role */
  isGlobal: boolean;
}

/**
 * Represents a hierarchical geographic area (HDX admin boundary aligned).
 */
export interface Area {
  /** Unique area code (HDX p-code, e.g., "KH0101") */
  code: string;
  /** Human-readable area name */
  name: string;
  /** Area type/admin level (e.g., "admin0", "admin1", "admin2") */
  type: string;
  /** Parent area code (null = top-level) */
  parentCode: string | null;
}

export type ExternalSyncField = { name: string; value: string };

/**
 * Field mapping configuration for external sync.
 * Maps form fields to external system fields with optional transformation.
 */
export interface FieldMapping {
  /** The form field key */
  formField: string;
  /** The external system field name */
  opensppField: string;
  /** Transformer configuration for value conversion */
  transformer: {
    type: string;
    options?: Record<string, unknown>;
  };
}

export type ExternalSyncConfig = {
  /** Type of external system (e.g., 'openspp-v2-adapter', 'mock') */
  type: string;
  /** Authentication method (e.g., 'basic', 'oauth2') */
  auth?: string;
  /** URL of the external system */
  url: string;
  /**
   * @deprecated Use adapterConfig instead. Kept for backwards compatibility.
   * Extra fields for the external system as name/value pairs.
   */
  extraFields?: ExternalSyncField[];
  /**
   * Typed adapter configuration object.
   * Preferred over extraFields for new configurations.
   */
  adapterConfig?: Record<string, string | number | boolean>;
  /** Field mappings for data transformation between systems */
  fieldMappings?: FieldMapping[];
};

/**
 * Helper to query strongly typed values from ExternalSyncConfig.extraFields.
 * @deprecated Use getAdapterConfigValue instead for new code.
 */
export function getExternalField(
  config: ExternalSyncConfig,
  fieldName: string,
): string | undefined {
  return config.extraFields?.find((field) => field.name === fieldName)?.value;
}

/**
 * Helper to get adapter configuration values with fallback to legacy extraFields.
 * Tries adapterConfig first, then falls back to extraFields for backwards compatibility.
 *
 * @param config The external sync configuration
 * @param fieldName The field name to retrieve
 * @param defaultValue Optional default value if field is not found
 * @returns The field value or default value
 *
 * @example
 * ```typescript
 * const clientId = getAdapterConfigValue<string>(config, "clientId");
 * const batchSize = getAdapterConfigValue<number>(config, "batchSize", 50);
 * ```
 */
export function getAdapterConfigValue<T extends string | number | boolean>(
  config: ExternalSyncConfig,
  fieldName: string,
  defaultValue?: T,
): T | undefined {
  // Try new adapterConfig first
  if (config.adapterConfig && fieldName in config.adapterConfig) {
    return config.adapterConfig[fieldName] as T;
  }
  // Fall back to extraFields for backwards compatibility
  const extraField = config.extraFields?.find((f) => f.name === fieldName);
  if (extraField) {
    // Try to parse as number if defaultValue is a number
    if (typeof defaultValue === "number") {
      const parsed = parseFloat(extraField.value);
      if (!isNaN(parsed)) {
        return parsed as T;
      }
    }
    // Try to parse as boolean if defaultValue is a boolean
    if (typeof defaultValue === "boolean") {
      return (extraField.value === "true") as T;
    }
    return extraField.value as T;
  }
  return defaultValue;
}

/**
 * External sync adapter interface for third-party system integration.
 *
 * Implementations handle the specifics of syncing with different external systems.
 *
 * @deprecated Use {@link ExternalSyncAdapterV2} for new adapters. V1 is kept
 * for backwards compatibility with adapter-openspp (Odoo V1) and adapter-openfn.
 * New adapters should implement V2 which provides structured SyncResult,
 * config schema validation, and health checks.
 */
export interface ExternalSyncAdapter {
  /** Optional hook to authenticate with the external system before data transfer */
  authenticate?(credentials?: ExternalSyncCredentials): Promise<boolean>;
  /** Push local changes to the external system. May return partial results. */
  pushData(credentials?: ExternalSyncCredentials): Promise<void | { pushed: number; failed: number; skipped: number; errors: Array<{ entityGuid?: string; code: string; message: string; retryable: boolean }> }>;
  /** Pull remote changes from the external system. May return partial results. */
  pullData(credentials?: ExternalSyncCredentials): Promise<void | { pulled: number; failed: number; skipped: number; errors: Array<{ entityGuid?: string; code: string; message: string; retryable: boolean }> }>;
  /**
   * Backwards compatibility helper for adapters that implement a combined sync routine.
   * ExternalSyncManager will fall back to this when push/pull are not available.
   */
  sync?(credentials?: ExternalSyncCredentials): Promise<void>;
}

/**
 * Credentials for authenticating with external systems.
 *
 * @deprecated Used by the deprecated V1 {@link ExternalSyncAdapter} interface.
 * V2 adapters receive authentication details via their Zod-validated config
 * object, not as a separate credentials parameter.
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

/**
 * Metadata for a file attachment associated with an entity.
 *
 * Tracks filename, MIME type, content hash for integrity verification,
 * and sync status for offline-first upload workflows.
 */
export interface AttachmentMetadata {
  /** Unique identifier for this attachment */
  guid: string;
  /** GUID of the entity this attachment belongs to */
  entityGuid: string;
  /** Original filename */
  filename: string;
  /** MIME type of the file (e.g., "image/jpeg", "application/pdf") */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  /** SHA-256 hash of the file content for integrity verification */
  hash: string;
  /** ISO timestamp when the attachment was created */
  createdAt: string;
  /** Sync status: pending (not uploaded), uploaded (synced), failed (upload error) */
  syncStatus: "pending" | "uploaded" | "failed";
  /** Tenant identifier for multi-tenant isolation */
  tenantId: string;
}

/**
 * Storage interface for file attachments.
 *
 * Provides CRUD operations for attachment metadata and binary data,
 * along with sync-related queries for offline-first upload workflows.
 */
export interface AttachmentStore {
  /** Save attachment metadata and binary data */
  saveAttachment(metadata: AttachmentMetadata, data: ArrayBuffer): Promise<void>;
  /** Get attachment metadata and binary data by GUID */
  getAttachment(guid: string): Promise<{ metadata: AttachmentMetadata; data: ArrayBuffer } | null>;
  /** Get only the metadata for an attachment (without loading binary data) */
  getAttachmentMetadata(guid: string): Promise<AttachmentMetadata | null>;
  /** List all attachments for a specific entity */
  listAttachments(entityGuid: string): Promise<AttachmentMetadata[]>;
  /** Delete an attachment and its binary data */
  deleteAttachment(guid: string): Promise<void>;
  /** Get all attachments with 'pending' sync status for a tenant */
  getPendingAttachments(tenantId: string): Promise<AttachmentMetadata[]>;
  /** Update the sync status of an attachment */
  updateSyncStatus(guid: string, status: AttachmentMetadata["syncStatus"]): Promise<void>;
}
