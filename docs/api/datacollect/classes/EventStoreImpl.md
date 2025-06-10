[**ID PASS Data Collect API Documentation v0.0.1**](../README.md)

***

[ID PASS Data Collect API Documentation](../globals.md) / EventStoreImpl

# Class: EventStoreImpl

Defined in: [components/EventStore.ts:148](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L148)

Event store implementation providing tamper-evident event sourcing with Merkle tree integrity.

The EventStoreImpl is the core component for managing immutable event storage with cryptographic
integrity verification. It implements complete event sourcing capabilities including audit trails,
Merkle tree verification, and sync timestamp management.

Key features:
- **Immutable Event Storage**: All events are stored as immutable records
- **Merkle Tree Integrity**: Cryptographic verification of event integrity using SHA256
- **Audit Trail Management**: Complete audit logging for compliance and debugging
- **Sync Coordination**: Timestamp tracking for multiple sync operations
- **Event Verification**: Merkle proof generation and verification
- **Pagination Support**: Efficient handling of large event datasets
- **Tamper Detection**: Cryptographic detection of unauthorized modifications

Architecture:
- Uses pluggable storage adapters for different persistence backends
- Maintains in-memory Merkle tree for fast integrity verification
- Implements event sourcing patterns with append-only semantics
- Provides both sync and async operations for different use cases
- Supports multiple sync levels (LOCAL, REMOTE, EXTERNAL)

## Examples

Basic usage:
```typescript
const eventStore = new EventStoreImpl(
  'user-123',
  storageAdapter
);

await eventStore.initialize();

// Save an event
const eventId = await eventStore.saveEvent({
  guid: 'event-456',
  entityGuid: 'person-789',
  type: 'create-individual',
  data: { name: 'John Doe', age: 30 },
  timestamp: new Date().toISOString(),
  userId: 'user-123',
  syncLevel: SyncLevel.LOCAL
});

// Verify integrity
const merkleRoot = eventStore.getMerkleRoot();
console.log('Current Merkle root:', merkleRoot);
```

Event verification with Merkle proofs:
```typescript
// Get proof for an event
const proof = await eventStore.getProof(event);

// Verify event integrity
const isValid = eventStore.verifyEvent(event, proof);
if (isValid) {
  console.log('Event integrity verified');
} else {
  console.error('Event has been tampered with!');
}
```

Audit trail management:
```typescript
// Log audit entry
await eventStore.logAuditEntry({
  guid: 'audit-123',
  timestamp: new Date().toISOString(),
  userId: 'user-456',
  action: 'create-individual',
  eventGuid: 'event-789',
  entityGuid: 'person-101',
  changes: { name: 'John Doe' },
  signature: 'sha256:...'
});

// Get audit trail for entity
const auditTrail = await eventStore.getAuditTrailByEntityGuid('person-101');
auditTrail.forEach(entry => {
  console.log(`${entry.timestamp}: ${entry.action} by ${entry.userId}`);
});
```

Sync operations:
```typescript
// Check for events since last sync
const lastSync = await eventStore.getLastRemoteSyncTimestamp();
const newEvents = await eventStore.getEventsSince(lastSync);

if (newEvents.length > 0) {
  console.log(`${newEvents.length} events to sync`);
  
  // Process sync...
  
  // Update sync timestamp
  await eventStore.setLastRemoteSyncTimestamp(new Date().toISOString());
}
```

## Implements

- [`EventStore`](../interfaces/EventStore.md)

## Constructors

### Constructor

> **new EventStoreImpl**(`userId`, `storageAdapter`): `EventStoreImpl`

Defined in: [components/EventStore.ts:169](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L169)

Creates a new EventStoreImpl instance.

#### Parameters

##### userId

`string`

Default user ID for system-generated events

##### storageAdapter

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md)

Storage adapter for persistence (IndexedDB, PostgreSQL, etc.)

#### Returns

`EventStoreImpl`

#### Example

```typescript
// With IndexedDB for browser
const indexedDbAdapter = new IndexedDbEventStorageAdapter('tenant-123');
const browserEventStore = new EventStoreImpl('user-456', indexedDbAdapter);

// With PostgreSQL for server
const postgresAdapter = new PostgresEventStorageAdapter(connectionString, 'tenant-123');
const serverEventStore = new EventStoreImpl('system', postgresAdapter);
```

## Methods

### updateSyncLevelFromEvents()

> **updateSyncLevelFromEvents**(`events`): `Promise`\<`void`\>

Defined in: [components/EventStore.ts:176](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L176)

Update sync levels for multiple events

#### Parameters

##### events

[`FormSubmission`](../interfaces/FormSubmission.md)[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`updateSyncLevelFromEvents`](../interfaces/EventStore.md#updatesynclevelfromevents)

***

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [components/EventStore.ts:180](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L180)

Close database connections and cleanup resources

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`closeConnection`](../interfaces/EventStore.md#closeconnection)

***

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [components/EventStore.ts:206](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L206)

Initializes the event store and loads the Merkle tree for integrity verification.

This method must be called before any other operations. It:
- Initializes the underlying storage adapter
- Loads existing events to rebuild the Merkle tree
- Prepares the store for cryptographic verification

#### Returns

`Promise`\<`void`\>

#### Throws

When storage initialization fails

#### Example

```typescript
const eventStore = new EventStoreImpl(userId, storageAdapter);

try {
  await eventStore.initialize();
  console.log('Event store ready');
} catch (error) {
  console.error('Failed to initialize event store:', error);
}
```

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`initialize`](../interfaces/EventStore.md#initialize)

***

### saveEvent()

> **saveEvent**(`form`): `Promise`\<`string`\>

Defined in: [components/EventStore.ts:265](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L265)

Saves an event and updates the Merkle tree for integrity verification.

The event is stored immutably and the Merkle tree is rebuilt to include
the new event. This ensures cryptographic integrity of the entire event log.

#### Parameters

##### form

[`FormSubmission`](../interfaces/FormSubmission.md)

Form submission/event to save

#### Returns

`Promise`\<`string`\>

Unique identifier for the saved event

#### Throws

When event storage fails

#### Example

```typescript
const eventId = await eventStore.saveEvent({
  guid: 'event-123',
  entityGuid: 'person-456',
  type: 'create-individual',
  data: { name: 'John Doe', age: 30 },
  timestamp: new Date().toISOString(),
  userId: 'user-789',
  syncLevel: SyncLevel.LOCAL
});

console.log('Event saved with ID:', eventId);
```

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`saveEvent`](../interfaces/EventStore.md#saveevent)

***

### getEvents()

> **getEvents**(): `Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

Defined in: [components/EventStore.ts:272](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L272)

Get events with optional filtering

#### Returns

`Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`getEvents`](../interfaces/EventStore.md#getevents)

***

### getAllEvents()

> **getAllEvents**(): `Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

Defined in: [components/EventStore.ts:276](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L276)

Get all events in the store

#### Returns

`Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`getAllEvents`](../interfaces/EventStore.md#getallevents)

***

### isEventExisted()

> **isEventExisted**(`guid`): `Promise`\<`boolean`\>

Defined in: [components/EventStore.ts:280](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L280)

Check if an event with the given GUID exists

#### Parameters

##### guid

`string`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`isEventExisted`](../interfaces/EventStore.md#iseventexisted)

***

### getMerkleRoot()

> **getMerkleRoot**(): `string`

Defined in: [components/EventStore.ts:307](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L307)

Gets the current Merkle tree root hash for integrity verification.

The root hash represents the cryptographic fingerprint of all events
in the store. Any modification to any event will change this hash.

#### Returns

`string`

SHA256 hash of the Merkle tree root, or empty string if no events

#### Example

```typescript
const rootHash = eventStore.getMerkleRoot();
console.log('Current integrity hash:', rootHash);

// Store this hash for later verification
const storedHash = rootHash;

// Later, after potential tampering...
const currentHash = eventStore.getMerkleRoot();
if (currentHash !== storedHash) {
  console.error('Data integrity compromised!');
}
```

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`getMerkleRoot`](../interfaces/EventStore.md#getmerkleroot)

***

### verifyEvent()

> **verifyEvent**(`event`, `proof`): `boolean`

Defined in: [components/EventStore.ts:337](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L337)

Verifies an event's integrity using a Merkle proof.

This method cryptographically verifies that an event has not been tampered
with by checking its Merkle proof against the current root hash.

#### Parameters

##### event

[`FormSubmission`](../interfaces/FormSubmission.md)

Event to verify

##### proof

`string`[]

Merkle proof path (array of sibling hashes)

#### Returns

`boolean`

True if event is authentic and untampered, false otherwise

#### Example

```typescript
// Get proof for an event
const proof = await eventStore.getProof(suspiciousEvent);

// Verify the event
const isValid = eventStore.verifyEvent(suspiciousEvent, proof);

if (isValid) {
  console.log('Event integrity verified - data is authentic');
} else {
  console.error('Event verification failed - possible tampering detected!');
  // Take appropriate security measures
}
```

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`verifyEvent`](../interfaces/EventStore.md#verifyevent)

***

### getProof()

> **getProof**(`event`): `Promise`\<`string`[]\>

Defined in: [components/EventStore.ts:352](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L352)

Get Merkle tree proof for an event

#### Parameters

##### event

[`FormSubmission`](../interfaces/FormSubmission.md)

#### Returns

`Promise`\<`string`[]\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`getProof`](../interfaces/EventStore.md#getproof)

***

### logAuditEntry()

> **logAuditEntry**(`entry`): `Promise`\<`void`\>

Defined in: [components/EventStore.ts:378](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L378)

Log a single audit entry

#### Parameters

##### entry

[`AuditLogEntry`](../interfaces/AuditLogEntry.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`logAuditEntry`](../interfaces/EventStore.md#logauditentry)

***

### saveAuditLogs()

> **saveAuditLogs**(`entries`): `Promise`\<`void`\>

Defined in: [components/EventStore.ts:382](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L382)

Save multiple audit log entries

#### Parameters

##### entries

[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`saveAuditLogs`](../interfaces/EventStore.md#saveauditlogs)

***

### clearStore()

> **clearStore**(): `Promise`\<`void`\>

Defined in: [components/EventStore.ts:394](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L394)

Clear all data from the store (for testing)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`clearStore`](../interfaces/EventStore.md#clearstore)

***

### updateEventSyncLevel()

> **updateEventSyncLevel**(`id`, `syncLevel`): `Promise`\<`void`\>

Defined in: [components/EventStore.ts:399](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L399)

Update the sync level of an event

#### Parameters

##### id

`string`

##### syncLevel

[`SyncLevel`](../enumerations/SyncLevel.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`updateEventSyncLevel`](../interfaces/EventStore.md#updateeventsynclevel)

***

### updateAuditLogSyncLevel()

> **updateAuditLogSyncLevel**(`entityId`, `syncLevel`): `Promise`\<`void`\>

Defined in: [components/EventStore.ts:403](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L403)

Update the sync level of an audit log entry

#### Parameters

##### entityId

`string`

##### syncLevel

[`SyncLevel`](../enumerations/SyncLevel.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`updateAuditLogSyncLevel`](../interfaces/EventStore.md#updateauditlogsynclevel)

***

### getEventsSince()

> **getEventsSince**(`timestamp`): `Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

Defined in: [components/EventStore.ts:407](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L407)

Get events created since a specific timestamp

#### Parameters

##### timestamp

`string` | `Date`

#### Returns

`Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`getEventsSince`](../interfaces/EventStore.md#geteventssince)

***

### getEventsSincePagination()

> **getEventsSincePagination**(`timestamp`, `limit`): `Promise`\<\{ `events`: [`FormSubmission`](../interfaces/FormSubmission.md)[]; `nextCursor`: `null` \| `string` \| `Date`; \}\>

Defined in: [components/EventStore.ts:411](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L411)

Get events since timestamp with pagination support (10 events/page default)

#### Parameters

##### timestamp

`string` | `Date`

##### limit

`number`

#### Returns

`Promise`\<\{ `events`: [`FormSubmission`](../interfaces/FormSubmission.md)[]; `nextCursor`: `null` \| `string` \| `Date`; \}\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`getEventsSincePagination`](../interfaces/EventStore.md#geteventssincepagination)

***

### getAuditLogsSince()

> **getAuditLogsSince**(`timestamp`): `Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

Defined in: [components/EventStore.ts:418](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L418)

Get audit logs created since a specific timestamp

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`getAuditLogsSince`](../interfaces/EventStore.md#getauditlogssince)

***

### getLastRemoteSyncTimestamp()

> **getLastRemoteSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [components/EventStore.ts:422](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L422)

Get the timestamp of the last remote sync

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`getLastRemoteSyncTimestamp`](../interfaces/EventStore.md#getlastremotesynctimestamp)

***

### setLastRemoteSyncTimestamp()

> **setLastRemoteSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [components/EventStore.ts:426](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L426)

Set the timestamp of the last remote sync

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`setLastRemoteSyncTimestamp`](../interfaces/EventStore.md#setlastremotesynctimestamp)

***

### getLastLocalSyncTimestamp()

> **getLastLocalSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [components/EventStore.ts:430](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L430)

Get the timestamp of the last local sync

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`getLastLocalSyncTimestamp`](../interfaces/EventStore.md#getlastlocalsynctimestamp)

***

### setLastLocalSyncTimestamp()

> **setLastLocalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [components/EventStore.ts:434](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L434)

Set the timestamp of the last local sync

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`setLastLocalSyncTimestamp`](../interfaces/EventStore.md#setlastlocalsynctimestamp)

***

### getLastPullExternalSyncTimestamp()

> **getLastPullExternalSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [components/EventStore.ts:438](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L438)

Get the timestamp of the last external sync pull

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`getLastPullExternalSyncTimestamp`](../interfaces/EventStore.md#getlastpullexternalsynctimestamp)

***

### setLastPullExternalSyncTimestamp()

> **setLastPullExternalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [components/EventStore.ts:442](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L442)

Set the timestamp of the last external sync pull

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`setLastPullExternalSyncTimestamp`](../interfaces/EventStore.md#setlastpullexternalsynctimestamp)

***

### getLastPushExternalSyncTimestamp()

> **getLastPushExternalSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [components/EventStore.ts:446](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L446)

Get the timestamp of the last external sync push

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`getLastPushExternalSyncTimestamp`](../interfaces/EventStore.md#getlastpushexternalsynctimestamp)

***

### setLastPushExternalSyncTimestamp()

> **setLastPushExternalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [components/EventStore.ts:450](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L450)

Set the timestamp of the last external sync push

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`setLastPushExternalSyncTimestamp`](../interfaces/EventStore.md#setlastpushexternalsynctimestamp)

***

### getAuditTrailByEntityGuid()

> **getAuditTrailByEntityGuid**(`entityGuid`): `Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

Defined in: [components/EventStore.ts:454](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EventStore.ts#L454)

Get complete audit trail for a specific entity

#### Parameters

##### entityGuid

`string`

#### Returns

`Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

#### Implementation of

[`EventStore`](../interfaces/EventStore.md).[`getAuditTrailByEntityGuid`](../interfaces/EventStore.md#getaudittrailbyentityguid)
