# Documentation Examples

This document provides concrete examples of documentation patterns used in the ID PASS DataCollect project. These examples demonstrate the standards established in our [Documentation Best Practices](./DOCUMENTATION_BEST_PRACTICES.md) guide.

## Table of Contents

- [Class Documentation Examples](#class-documentation-examples)
- [Method Documentation Examples](#method-documentation-examples)
- [Interface Documentation Examples](#interface-documentation-examples)
- [Error Documentation Examples](#error-documentation-examples)
- [Architecture Documentation Examples](#architecture-documentation-examples)

## Class Documentation Examples

### Service Class Example

Based on `EventApplierService`:

```typescript
/**
 * Service responsible for applying events (FormSubmissions) to entities in the event sourcing system.
 * 
 * The EventApplierService is the core component that transforms events into entity state changes.
 * It handles all standard entity operations (create, update, delete, add/remove members) and supports
 * custom event appliers for domain-specific operations.
 * 
 * Key features:
 * - **Event Processing**: Applies form submissions to create or modify entities
 * - **Custom Event Support**: Allows registration of custom event appliers
 * - **Audit Trail**: Maintains complete audit logs for all changes
 * - **Duplicate Detection**: Automatically flags potential duplicates during entity creation
 * - **Cascading Operations**: Handles complex operations like group member management
 * - **Data Validation**: Validates all form submissions before processing
 * 
 * Architecture:
 * - Uses the Strategy pattern for pluggable event appliers
 * - Maintains referential integrity for group-member relationships
 * - Generates audit entries for all state changes
 * - Integrates with duplicate detection algorithms
 * 
 * @example
 * Basic usage:
 * ```typescript
 * const service = new EventApplierService(
 *   'user-123',
 *   eventStore,
 *   entityStore
 * );
 * 
 * // Submit a form to create an individual
 * const individual = await service.submitForm({
 *   guid: uuidv4(),
 *   entityGuid: uuidv4(),
 *   type: 'create-individual',
 *   data: { name: 'John Doe', age: 30 },
 *   timestamp: new Date().toISOString(),
 *   userId: 'user-123',
 *   syncLevel: SyncLevel.LOCAL
 * });
 * ```
 * 
 * @example
 * Custom event applier:
 * ```typescript
 * // Register a custom event applier
 * const customApplier: EventApplier = {
 *   apply: async (entity, form, getEntity, saveEntity) => {
 *     const updated = { 
 *       ...entity, 
 *       data: { ...entity.data, verified: true, verifiedAt: form.timestamp }
 *     };
 *     return updated;
 *   }
 * };
 * 
 * service.registerEventApplier('custom-verification', customApplier);
 * ```
 */
export class EventApplierService {
```

### Manager Class Example

Based on `EntityDataManager`:

```typescript
/**
 * Primary API interface for the ID PASS DataCollect library.
 * 
 * The EntityDataManager orchestrates all data operations including:
 * - Form submission and event processing
 * - Entity creation, modification, and querying
 * - Data synchronization with remote servers and external systems
 * - Audit trail management and duplicate detection
 * 
 * This class implements the Command Query Responsibility Segregation (CQRS) pattern,
 * where all changes go through events (FormSubmissions) and queries access the
 * current state through the EntityStore.
 * 
 * @example
 * Basic usage:
 * ```typescript
 * import { EntityDataManager, EntityType, SyncLevel } from 'idpass-data-collect';
 * 
 * const manager = new EntityDataManager(
 *   eventStore,
 *   entityStore, 
 *   eventApplierService,
 *   externalSyncManager,
 *   internalSyncManager
 * );
 * 
 * // Create a new individual
 * const individual = await manager.submitForm({
 *   guid: uuidv4(),
 *   entityGuid: uuidv4(),
 *   type: 'create-individual',
 *   data: { name: 'John Doe', age: 30 },
 *   timestamp: new Date().toISOString(),
 *   userId: 'user-123',
 *   syncLevel: SyncLevel.LOCAL
 * });
 * ```
 * 
 * @example
 * Offline-first usage:
 * ```typescript
 * // Works completely offline
 * const offlineManager = new EntityDataManager(
 *   eventStore,
 *   entityStore,
 *   eventApplierService
 *   // No sync managers - offline only
 * );
 * 
 * const entity = await offlineManager.submitForm(formData);
 * ```
 */
export class EntityDataManager {
```

## Method Documentation Examples

### Complex Public Method

Based on `submitForm` method:

```typescript
/**
 * Processes a form submission to create or modify entities through the event sourcing system.
 * 
 * This is the main entry point for all entity operations. The method:
 * 1. Validates the form submission data
 * 2. Saves the event to the event store  
 * 3. Applies the event to create/update entities
 * 4. Logs audit entries for all changes
 * 5. Flags potential duplicates automatically
 * 
 * Supported event types:
 * - `create-group` / `update-group`: Create or modify group entities
 * - `create-individual` / `update-individual`: Create or modify individual entities
 * - `add-member`: Add a member to a group (supports both individuals and nested groups)
 * - `remove-member`: Remove a member from a group (cascades delete for subgroups)
 * - `delete-entity`: Delete an entity and all its descendants
 * - `resolve-duplicate`: Resolve potential duplicate entities
 * - Custom events: Handled by registered event appliers
 * 
 * @param formDataParam - The form submission containing the event data
 * @returns The resulting entity after applying the event, or null if deletion occurred
 * @throws {AppError} When validation fails or required data is missing
 * 
 * @example
 * Create an individual:
 * ```typescript
 * const individual = await service.submitForm({
 *   guid: uuidv4(),
 *   entityGuid: uuidv4(),
 *   type: 'create-individual',
 *   data: { name: 'John Doe', age: 30, email: 'john@example.com' },
 *   timestamp: new Date().toISOString(),
 *   userId: 'user-123',
 *   syncLevel: SyncLevel.LOCAL
 * });
 * ```
 * 
 * @example
 * Add member to existing group:
 * ```typescript
 * await service.submitForm({
 *   guid: uuidv4(),
 *   entityGuid: existingGroupId,
 *   type: 'add-member',
 *   data: {
 *     members: [{ guid: uuidv4(), name: 'Bob Smith', type: 'individual' }]
 *   },
 *   timestamp: new Date().toISOString(),
 *   userId: 'user-123',
 *   syncLevel: SyncLevel.LOCAL
 * });
 * ```
 */
async submitForm(formDataParam: FormSubmission): Promise<EntityDoc | null> {
```

### Simple Public Method

Based on sync manager methods:

```typescript
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
```

### Private Method with Complex Logic

Based on `flagPotentialDuplicate`:

```typescript
/**
 * Automatically flags potential duplicate entities based on data similarity.
 * 
 * This method implements intelligent duplicate detection by:
 * - Extracting searchable fields from entity data
 * - Building search criteria from non-empty values
 * - Finding entities with similar data patterns
 * - Flagging potential duplicates for manual review
 * - Logging duplicate detection events for audit trails
 * 
 * The duplicate detection helps maintain data quality by identifying
 * entities that may represent the same real-world person or group.
 * 
 * @param entityGuid - GUID of the entity to check for duplicates
 * @param eventGuid - GUID of the event that created/updated the entity
 * 
 * @private
 */
private async flagPotentialDuplicate(entityGuid: string, eventGuid: string): Promise<void> {
```

## Interface Documentation Examples

### Core Domain Interface

Based on `FormSubmission`:

```typescript
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
  data: Record<string, any>;
  /** ISO timestamp when this event was created */
  timestamp: string;
  /** User who created this event */
  userId: string;
  /** Current synchronization level of this event */
  syncLevel: SyncLevel;
}
```

### Service Interface

Based on `EventStore`:

```typescript
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
}
```

## Error Documentation Examples

### Comprehensive Error Documentation

```typescript
/**
 * Retrieves a specific entity by its internal database ID.
 * 
 * For groups, this method automatically loads member details to provide
 * a complete view of the group structure.
 * 
 * @param id - Internal database ID of the entity
 * @returns Entity pair with initial and current state
 * @throws {AppError} When entity is not found
 * 
 * @example
 * ```typescript
 * try {
 *   const entityPair = await manager.getEntity('entity-123');
 *   console.log('Current state:', entityPair.modified);
 * } catch (error) {
 *   if (error instanceof AppError && error.code === 'ENTITY_NOT_FOUND') {
 *     console.log('Entity does not exist');
 *   }
 * }
 * ```
 */
async getEntity(id: string): Promise<{ initial: EntityDoc; modified: EntityDoc }> {
```

### Multiple Error Conditions

```typescript
/**
 * Authenticates with the sync server using email and password.
 * 
 * @param email - User email address
 * @param password - User password
 * @throws {ValidationError} When email format is invalid
 * @throws {AuthenticationError} When credentials are incorrect
 * @throws {NetworkError} When server is unreachable
 * @throws {RateLimitError} When too many login attempts made
 * 
 * @example
 * ```typescript
 * try {
 *   await syncManager.login('user@example.com', 'password123');
 * } catch (error) {
 *   if (error instanceof AuthenticationError) {
 *     console.error('Invalid credentials');
 *   } else if (error instanceof NetworkError) {
 *     console.error('Cannot reach server');
 *   }
 * }
 * ```
 */
async login(email: string, password: string): Promise<void> {
```

## Architecture Documentation Examples

### Design Pattern Explanation

```typescript
/**
 * Service implementing the Strategy pattern for event processing.
 * 
 * Architecture:
 * - **Event Appliers**: Pluggable strategies for different event types
 * - **Command Pattern**: FormSubmissions represent commands to modify state
 * - **Event Sourcing**: All changes stored as immutable events
 * - **CQRS**: Separates command processing from query operations
 * - **Observer Pattern**: Audit logging observes all state changes
 * 
 * The service acts as a mediator between the event store (commands) and
 * entity store (queries), applying the appropriate business logic for
 * each event type.
 */
```

### Component Relationships

```typescript
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
 */
```

### Data Flow Documentation

```typescript
/**
 * Primary API interface implementing the CQRS pattern.
 * 
 * Data Flow:
 * 1. Client submits FormSubmission (Command)
 * 2. EventApplierService validates and processes the command
 * 3. Event is stored in EventStore for audit trail
 * 4. Entity state is updated in EntityStore (Query side)
 * 5. Duplicate detection runs automatically
 * 6. Sync managers handle replication to remote systems
 * 
 * This separation ensures data consistency while optimizing
 * for both write operations (commands) and read operations (queries).
 */
```

## Common Patterns Summary

### Documentation Structure Template

```typescript
/**
 * [ONE LINE DESCRIPTION]
 * 
 * [DETAILED EXPLANATION WITH CONTEXT]
 * 
 * Key features:
 * - **Feature 1**: Description
 * - **Feature 2**: Description
 * - **Feature 3**: Description
 * 
 * Architecture:
 * - [Design pattern explanations]
 * - [Component relationships]
 * - [Important implementation details]
 * 
 * @param param1 - Description with constraints/format
 * @param param2 - Description with default behavior
 * @returns Description of return value structure
 * @throws {ErrorType} When and why this error occurs
 * 
 * @example
 * Basic usage:
 * ```typescript
 * // Working code example with realistic data
 * ```
 * 
 * @example
 * Advanced usage:
 * ```typescript
 * // More complex scenario
 * ```
 * 
 * @private (if applicable)
 * 
 * TODO: Any planned improvements or known limitations
 */
```

### Quality Checklist for Examples

- ✅ **Realistic data**: Use meaningful names and values
- ✅ **Complete code**: Include imports and error handling
- ✅ **Working examples**: Test that examples compile and run
- ✅ **Progressive complexity**: Start simple, then show advanced usage
- ✅ **Context provided**: Explain when and why to use the pattern
- ✅ **Error scenarios**: Show how to handle failures

These examples demonstrate the documentation standards that have made the ID PASS DataCollect codebase more maintainable and developer-friendly. Following these patterns ensures consistency across all packages and helps new contributors understand both the technical implementation and architectural decisions.