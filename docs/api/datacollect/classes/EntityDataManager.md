[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / EntityDataManager

# Class: EntityDataManager

Defined in: [components/EntityDataManager.ts:135](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L135)

Primary API interface for the ID PASS DataCollect library.

The EntityDataManager orchestrates all data operations including:
- Form submission and event processing
- Entity creation, modification, and querying
- Data synchronization with remote servers and external systems
- Audit trail management and duplicate detection

This class implements the Command Query Responsibility Segregation (CQRS) pattern,
where all changes go through events (FormSubmissions) and queries access the
current state through the EntityStore.

## Examples

Basic usage:
```typescript
import { EntityDataManager, EntityType, SyncLevel } from 'idpass-data-collect';

// Initialize the manager (typically done once)
const manager = new EntityDataManager(
  eventStore,
  entityStore,
  eventApplierService,
  externalSyncManager,
  internalSyncManager
);

// Create a new individual
const individual = await manager.submitForm({
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: 'create-individual',
  data: { name: 'John Doe', age: 30 },
  timestamp: new Date().toISOString(),
  userId: 'user-123',
  syncLevel: SyncLevel.LOCAL
});

// Create a household group
const group = await manager.submitForm({
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: 'create-group',
  data: { name: 'Smith Family' },
  timestamp: new Date().toISOString(),
  userId: 'user-123',
  syncLevel: SyncLevel.LOCAL
});

// Add individual to group
await manager.submitForm({
  guid: uuidv4(),
  entityGuid: group.guid,
  type: 'add-member',
  data: { members: [{ guid: individual.guid, name: individual.data.name }] },
  timestamp: new Date().toISOString(),
  userId: 'user-123',
  syncLevel: SyncLevel.LOCAL
});
```

Offline-first usage:
```typescript
// Works completely offline
const offlineManager = new EntityDataManager(
  eventStore,
  entityStore,
  eventApplierService
  // No sync managers - offline only
);

// All operations work locally
const entity = await offlineManager.submitForm(formData);
const allEntities = await offlineManager.getAllEntities();
```

With synchronization:
```typescript
// Sync with remote server
if (manager.hasInternalSyncManager()) {
  await manager.sync();
}

// Check sync status
if (manager.isSyncing()) {
  console.log('Sync in progress...');
}
```

## Constructors

### Constructor

> **new EntityDataManager**(`eventStore`, `entityStore`, `eventApplierService`, `externalSyncManager?`, `internalSyncManager?`, `authManager?`): `EntityDataManager`

Defined in: [components/EntityDataManager.ts:147](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L147)

Creates a new EntityDataManager instance.

#### Parameters

##### eventStore

[`EventStore`](../interfaces/EventStore.md)

Store for managing events/form submissions

##### entityStore

[`EntityStore`](../interfaces/EntityStore.md)

Store for managing current entity state

##### eventApplierService

[`EventApplierService`](EventApplierService.md)

Service for applying events to entities

##### externalSyncManager?

[`ExternalSyncManager`](ExternalSyncManager.md)

Optional manager for external system sync

##### internalSyncManager?

[`InternalSyncManager`](InternalSyncManager.md)

Optional manager for server sync

##### authManager?

[`AuthManager`](AuthManager.md)

#### Returns

`EntityDataManager`

## Methods

### isSyncing()

> **isSyncing**(): `boolean`

Defined in: [components/EntityDataManager.ts:161](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L161)

Checks if a synchronization operation is currently in progress.

#### Returns

`boolean`

True if sync is active, false otherwise

***

### submitForm()

> **submitForm**(`formData`): `Promise`\<`null` \| [`EntityDoc`](../interfaces/EntityDoc.md)\>

Defined in: [components/EntityDataManager.ts:202](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L202)

Submits a form to create or modify entities through the event sourcing system.

This is the primary method for making changes to entities. All modifications
go through events (FormSubmissions) which are applied to create the new state.

#### Parameters

##### formData

[`FormSubmission`](../interfaces/FormSubmission.md)

The form submission containing the event data

#### Returns

`Promise`\<`null` \| [`EntityDoc`](../interfaces/EntityDoc.md)\>

The resulting entity after applying the event, or null if creation failed

#### Example

```typescript
// Create a new individual
const individual = await manager.submitForm({
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: 'create-individual',
  data: { name: 'John Doe', age: 30, email: 'john@example.com' },
  timestamp: new Date().toISOString(),
  userId: 'user-123',
  syncLevel: SyncLevel.LOCAL
});

// Update an existing individual
const updated = await manager.submitForm({
  guid: uuidv4(),
  entityGuid: individual.guid,
  type: 'update-individual',
  data: { age: 31 }, // Only changed fields
  timestamp: new Date().toISOString(),
  userId: 'user-123',
  syncLevel: SyncLevel.LOCAL
});
```

***

### getAllEvents()

> **getAllEvents**(): `Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

Defined in: [components/EntityDataManager.ts:228](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L228)

Retrieves all events (form submissions) from the event store.

Provides access to the complete audit trail of all changes made to entities.
Events are returned in chronological order.

#### Returns

`Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

Array of all form submissions/events

#### Example

```typescript
const events = await manager.getAllEvents();

// Filter events by type
const createEvents = events.filter(e => e.type.startsWith('create-'));

// Filter events by user
const userEvents = events.filter(e => e.userId === 'user-123');

// Filter events by entity
const entityEvents = events.filter(e => e.entityGuid === 'entity-456');
```

***

### getAllEntities()

> **getAllEntities**(): `Promise`\<`object`[]\>

Defined in: [components/EntityDataManager.ts:260](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L260)

Retrieves all entities from the entity store.

Returns EntityPairs containing both the initial state (when first loaded/synced)
and the current modified state. This enables change tracking and conflict resolution.

#### Returns

`Promise`\<`object`[]\>

Array of entity pairs with initial and current state

#### Example

```typescript
const entities = await manager.getAllEntities();

// Find entities that have been modified locally
const modifiedEntities = entities.filter(pair =>
  pair.initial.version !== pair.modified.version
);

// Get only individuals
const individuals = entities.filter(pair =>
  pair.modified.type === EntityType.Individual
);

// Get only groups
const groups = entities.filter(pair =>
  pair.modified.type === EntityType.Group
);
```

***

### getEntity()

> **getEntity**(`id`): `Promise`\<\{ `initial`: [`EntityDoc`](../interfaces/EntityDoc.md); `modified`: [`EntityDoc`](../interfaces/EntityDoc.md); \}\>

Defined in: [components/EntityDataManager.ts:296](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L296)

Retrieves a specific entity by its internal database ID.

For groups, this method automatically loads member details to provide
a complete view of the group structure.

#### Parameters

##### id

`string`

Internal database ID of the entity

#### Returns

`Promise`\<\{ `initial`: [`EntityDoc`](../interfaces/EntityDoc.md); `modified`: [`EntityDoc`](../interfaces/EntityDoc.md); \}\>

Entity pair with initial and current state

#### Throws

When entity is not found

#### Example

```typescript
try {
  const entityPair = await manager.getEntity('entity-123');

  console.log('Original state:', entityPair.initial);
  console.log('Current state:', entityPair.modified);

  // Check if entity has been modified
  const hasChanges = entityPair.initial.version !== entityPair.modified.version;

  if (entityPair.modified.type === EntityType.Group) {
    const group = entityPair.modified as GroupDoc;
    console.log('Group members:', group.memberIds);
  }
} catch (error) {
  if (error instanceof AppError && error.code === 'ENTITY_NOT_FOUND') {
    console.log('Entity does not exist');
  }
}
```

***

### getMembers()

> **getMembers**(`groupId`): `Promise`\<`object`[]\>

Defined in: [components/EntityDataManager.ts:421](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L421)

Retrieves all members of a specific group.

#### Parameters

##### groupId

`string`

Internal database ID of the group

#### Returns

`Promise`\<`object`[]\>

Array of entity pairs for all group members

#### Throws

When group is not found or entity is not a group

#### Example

```typescript
try {
  const members = await manager.getMembers('group-123');
  console.log(`Group has ${members.length} members`);

  members.forEach(member => {
    console.log(`Member: ${member.modified.data.name}`);
  });
} catch (error) {
  if (error instanceof AppError && error.code === 'INVALID_GROUP') {
    console.log('Group not found or invalid');
  }
}
```

***

### hasUnsyncedEvents()

> **hasUnsyncedEvents**(): `Promise`\<`boolean`\>

Defined in: [components/EntityDataManager.ts:446](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L446)

Checks if there are any unsynced events waiting to be synchronized.

Only available when an InternalSyncManager is configured.

#### Returns

`Promise`\<`boolean`\>

True if there are unsynced events, false otherwise

#### Example

```typescript
if (await manager.hasUnsyncedEvents()) {
  console.log('There are changes waiting to sync');
  await manager.syncWithSyncServer();
}
```

***

### getUnsyncedEventsCount()

> **getUnsyncedEventsCount**(): `Promise`\<`number`\>

Defined in: [components/EntityDataManager.ts:470](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L470)

Gets the count of unsynced events waiting to be synchronized.

Only available when an InternalSyncManager is configured.

#### Returns

`Promise`\<`number`\>

Number of unsynced events

#### Example

```typescript
const count = await manager.getUnsyncedEventsCount();
console.log(`${count} events waiting to sync`);

if (count > 100) {
  console.log('Large number of changes - consider syncing soon');
}
```

***

### syncWithSyncServer()

> **syncWithSyncServer**(): `Promise`\<`void`\>

Defined in: [components/EntityDataManager.ts:498](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L498)

Synchronizes local data with the remote sync server.

Performs a full bidirectional sync: pushes local changes to server
and pulls remote changes to local storage.

Only available when an InternalSyncManager is configured.

#### Returns

`Promise`\<`void`\>

#### Throws

When sync fails or authentication is required

#### Example

```typescript
try {
  console.log('Starting sync...');
  await manager.syncWithSyncServer();
  console.log('Sync completed successfully');
} catch (error) {
  console.error('Sync failed:', error.message);
}
```

***

### searchEntities()

> **searchEntities**(`criteria`): `Promise`\<`object`[]\>

Defined in: [components/EntityDataManager.ts:530](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L530)

Searches entities using specified criteria.

Provides flexible querying capabilities for finding entities based
on their data properties, type, or other attributes.

#### Parameters

##### criteria

[`SearchCriteria`](../type-aliases/SearchCriteria.md)

Search criteria array with query conditions

#### Returns

`Promise`\<`object`[]\>

Array of entity pairs matching the criteria

#### Example

```typescript
// Search for adults
const adults = await manager.searchEntities([
  { "data.age": { $gte: 18 } },
  { "type": "individual" }
]);

// Search for groups with specific name
const smithFamilies = await manager.searchEntities([
  { "data.name": { $regex: /smith/i } },
  { "type": "group" }
]);

// TODO: Document the exact query syntax supported
```

***

### getAuditTrailByEntityGuid()

> **getAuditTrailByEntityGuid**(`entityGuid`): `Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

Defined in: [components/EntityDataManager.ts:560](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L560)

Retrieves the complete audit trail for a specific entity.

Returns all audit log entries related to an entity, providing
a complete history of changes with timestamps and user information.

#### Parameters

##### entityGuid

`string`

Global unique identifier of the entity

#### Returns

`Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

Array of audit log entries in chronological order

#### Throws

When audit trail retrieval fails

#### Example

```typescript
try {
  const auditTrail = await manager.getAuditTrailByEntityGuid('entity-123');

  console.log(`Found ${auditTrail.length} audit entries`);
  auditTrail.forEach(entry => {
    console.log(`${entry.timestamp}: ${entry.action} by ${entry.userId}`);
  });
} catch (error) {
  if (error instanceof AppError && error.code === 'AUDIT_TRAIL_ERROR') {
    console.error('Failed to retrieve audit trail');
  }
}
```

***

### getEventsSince()

> **getEventsSince**(`timestamp`): `Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

Defined in: [components/EntityDataManager.ts:612](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L612)

Retrieves events created since a specific timestamp.

Useful for incremental sync operations and change tracking.

#### Parameters

##### timestamp

`string`

ISO timestamp to filter events from

#### Returns

`Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

Array of events created after the specified timestamp

#### Example

```typescript
const lastSync = '2024-01-01T00:00:00Z';
const recentEvents = await manager.getEventsSince(lastSync);

console.log(`${recentEvents.length} events since last sync`);
recentEvents.forEach(event => {
  console.log(`${event.timestamp}: ${event.type} on ${event.entityGuid}`);
});
```

***

### getEventsSincePagination()

> **getEventsSincePagination**(`timestamp`, `limit`): `Promise`\<\{ `events`: [`FormSubmission`](../interfaces/FormSubmission.md)[]; `nextCursor`: `null` \| `string` \| `Date`; \}\>

Defined in: [components/EntityDataManager.ts:640](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L640)

Retrieves events since a timestamp with pagination support.

More efficient than getEventsSince for large datasets as it supports
pagination to avoid loading too many events at once.

#### Parameters

##### timestamp

`string`

ISO timestamp to filter events from

##### limit

`number`

Maximum number of events to return (default: 10)

#### Returns

`Promise`\<\{ `events`: [`FormSubmission`](../interfaces/FormSubmission.md)[]; `nextCursor`: `null` \| `string` \| `Date`; \}\>

Object with events array and cursor for next page

#### Example

```typescript
let cursor = '2024-01-01T00:00:00Z';
let allEvents: FormSubmission[] = [];

do {
  const result = await manager.getEventsSincePagination(cursor, 50);
  allEvents.push(...result.events);
  cursor = result.nextCursor;
} while (cursor);

console.log(`Retrieved ${allEvents.length} events total`);
```

***

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [components/EntityDataManager.ts:660](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L660)

Closes all database connections and cleans up resources.

Should be called when the EntityDataManager is no longer needed
to properly release database connections and prevent memory leaks.

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
// At application shutdown
await manager.closeConnection();
console.log('Database connections closed');
```

***

### clearStore()

> **clearStore**(): `Promise`\<`void`\>

Defined in: [components/EntityDataManager.ts:680](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L680)

Clears all data from both entity and event stores.

⚠️ **WARNING**: This permanently deletes all data!
Only use for testing or when intentionally resetting the system.

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
// For testing only
if (process.env.NODE_ENV === 'test') {
  await manager.clearStore();
  console.log('Test data cleared');
}
```

***

### saveAuditLogs()

> **saveAuditLogs**(`auditLogs`): `Promise`\<`void`\>

Defined in: [components/EntityDataManager.ts:711](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L711)

Saves multiple audit log entries to the event store.

Used for batch saving of audit logs, typically during sync operations
when receiving audit logs from remote systems.

#### Parameters

##### auditLogs

[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]

Array of audit log entries to save

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
const auditLogs: AuditLogEntry[] = [
  {
    guid: 'audit-1',
    timestamp: '2024-01-01T12:00:00Z',
    userId: 'user-123',
    action: 'create-individual',
    eventGuid: 'event-456',
    entityGuid: 'person-789',
    changes: { name: 'John Doe' },
    signature: 'sha256:abc123'
  }
];

await manager.saveAuditLogs(auditLogs);
```

***

### getAuditLogsSince()

> **getAuditLogsSince**(`since`): `Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

Defined in: [components/EntityDataManager.ts:729](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L729)

Retrieves audit logs created since a specific timestamp.

#### Parameters

##### since

`string`

ISO timestamp to filter audit logs from

#### Returns

`Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

Array of audit log entries created after the specified timestamp

#### Example

```typescript
const lastAuditSync = '2024-01-01T00:00:00Z';
const recentAudits = await manager.getAuditLogsSince(lastAuditSync);

console.log(`${recentAudits.length} audit entries since last sync`);
```

***

### getPotentialDuplicates()

> **getPotentialDuplicates**(): `Promise`\<`object`[]\>

Defined in: [components/EntityDataManager.ts:791](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L791)

Retrieves all potential duplicate entity pairs detected by the system.

The system automatically detects potential duplicates during entity creation
based on similarity in data fields. These pairs need manual review and resolution.

#### Returns

`Promise`\<`object`[]\>

Array of entity GUID pairs that are potential duplicates

#### Example

```typescript
const duplicates = await manager.getPotentialDuplicates();

if (duplicates.length > 0) {
  console.log(`Found ${duplicates.length} potential duplicate pairs`);

  for (const pair of duplicates) {
    const entity1 = await manager.getEntity(pair.entityGuid);
    const entity2 = await manager.getEntity(pair.duplicateGuid);

    console.log('Potential duplicate:');
    console.log('Entity 1:', entity1.modified.data);
    console.log('Entity 2:', entity2.modified.data);

    // TODO: Implement duplicate resolution workflow
  }
}
```

***

### syncWithExternalSystem()

> **syncWithExternalSystem**(`credentials?`): `Promise`\<`void`\>

Defined in: [components/EntityDataManager.ts:821](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L821)

Synchronizes data with external systems (e.g., OpenSPP, custom APIs).

Performs bidirectional sync with third-party systems using configured
sync adapters. Only available when an ExternalSyncManager is configured.

#### Parameters

##### credentials?

[`ExternalSyncCredentials`](../interfaces/ExternalSyncCredentials.md)

Optional credentials for external system authentication

#### Returns

`Promise`\<`void`\>

#### Throws

When external sync fails or credentials are invalid

#### Example

```typescript
// Sync with OpenSPP system
try {
  await manager.syncWithExternalSystem({
    username: 'sync_user',
    password: 'sync_password'
  });
  console.log('External sync completed');
} catch (error) {
  console.error('External sync failed:', error.message);
}

// Sync without credentials (if configured in adapter)
await manager.syncWithExternalSystem();
```

***

### login()

> **login**(`credentials`, `type?`): `Promise`\<`void`\>

Defined in: [components/EntityDataManager.ts:827](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L827)

#### Parameters

##### credentials

`null` | [`PasswordCredentials`](../interfaces/PasswordCredentials.md) | [`TokenCredentials`](../interfaces/TokenCredentials.md)

##### type?

`string`

#### Returns

`Promise`\<`void`\>

***

### initializeAuthManager()

> **initializeAuthManager**(): `Promise`\<`void`\>

Defined in: [components/EntityDataManager.ts:833](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L833)

#### Returns

`Promise`\<`void`\>

***

### logout()

> **logout**(): `Promise`\<`void`\>

Defined in: [components/EntityDataManager.ts:839](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L839)

#### Returns

`Promise`\<`void`\>

***

### validateToken()

> **validateToken**(`type`, `token`): `Promise`\<`boolean`\>

Defined in: [components/EntityDataManager.ts:845](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L845)

#### Parameters

##### type

`string`

##### token

`string`

#### Returns

`Promise`\<`boolean`\>

***

### isAuthenticated()

> **isAuthenticated**(): `Promise`\<`boolean`\>

Defined in: [components/EntityDataManager.ts:852](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L852)

#### Returns

`Promise`\<`boolean`\>

***

### handleCallback()

> **handleCallback**(`type`): `Promise`\<`void`\>

Defined in: [components/EntityDataManager.ts:858](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityDataManager.ts#L858)

#### Parameters

##### type

`string`

#### Returns

`Promise`\<`void`\>
