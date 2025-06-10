[idpass-data-collect](../index.md) / PostgresEventStorageAdapter

# Class: PostgresEventStorageAdapter

Defined in: [storage/PostgresEventStorageAdapter.ts:23](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L23)

Storage adapter interface for event persistence.

Provides the low-level storage operations for events and audit logs.
Implementations include IndexedDbEventStorageAdapter and PostgresEventStorageAdapter.

## Implements

- [`EventStorageAdapter`](../interfaces/EventStorageAdapter.md)

## Constructors

### Constructor

> **new PostgresEventStorageAdapter**(`connectionString`, `tenantId?`): `PostgresEventStorageAdapter`

Defined in: [storage/PostgresEventStorageAdapter.ts:27](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L27)

#### Parameters

##### connectionString

`string`

##### tenantId?

`string`

#### Returns

`PostgresEventStorageAdapter`

## Methods

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:34](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L34)

Close database connections and cleanup resources

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`closeConnection`](../interfaces/EventStorageAdapter.md#closeconnection)

***

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:38](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L38)

Initialize the storage adapter (create tables, indexes, etc.)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`initialize`](../interfaces/EventStorageAdapter.md#initialize)

***

### saveEvents()

> **saveEvents**(`events`): `Promise`\<`string`[]\>

Defined in: [storage/PostgresEventStorageAdapter.ts:111](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L111)

Save multiple events and return their IDs

#### Parameters

##### events

[`FormSubmission`](../interfaces/FormSubmission.md)[]

#### Returns

`Promise`\<`string`[]\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`saveEvents`](../interfaces/EventStorageAdapter.md#saveevents)

***

### getEvents()

> **getEvents**(): `Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

Defined in: [storage/PostgresEventStorageAdapter.ts:143](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L143)

Get all events from storage

#### Returns

`Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getEvents`](../interfaces/EventStorageAdapter.md#getevents)

***

### saveAuditLog()

> **saveAuditLog**(`entries`): `Promise`\<`void`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:168](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L168)

Save multiple audit log entries

#### Parameters

##### entries

[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`saveAuditLog`](../interfaces/EventStorageAdapter.md#saveauditlog)

***

### getAuditLog()

> **getAuditLog**(): `Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

Defined in: [storage/PostgresEventStorageAdapter.ts:197](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L197)

Get all audit log entries

#### Returns

`Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getAuditLog`](../interfaces/EventStorageAdapter.md#getauditlog)

***

### saveMerkleRoot()

> **saveMerkleRoot**(`root`): `Promise`\<`void`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:218](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L218)

Save Merkle tree root hash

#### Parameters

##### root

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`saveMerkleRoot`](../interfaces/EventStorageAdapter.md#savemerkleroot)

***

### getMerkleRoot()

> **getMerkleRoot**(): `Promise`\<`string`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:230](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L230)

Get current Merkle tree root hash

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getMerkleRoot`](../interfaces/EventStorageAdapter.md#getmerkleroot)

***

### updateEventSyncLevel()

> **updateEventSyncLevel**(`id`, `syncLevel`): `Promise`\<`void`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:242](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L242)

Update the sync level of an event

#### Parameters

##### id

`string`

##### syncLevel

[`SyncLevel`](../enumerations/SyncLevel.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`updateEventSyncLevel`](../interfaces/EventStorageAdapter.md#updateeventsynclevel)

***

### updateAuditLogSyncLevel()

> **updateAuditLogSyncLevel**(`entityGuid`, `syncLevel`): `Promise`\<`void`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:251](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L251)

Update the sync level of an audit log entry

#### Parameters

##### entityGuid

`string`

##### syncLevel

[`SyncLevel`](../enumerations/SyncLevel.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`updateAuditLogSyncLevel`](../interfaces/EventStorageAdapter.md#updateauditlogsynclevel)

***

### getEventsSince()

> **getEventsSince**(`timestamp`): `Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

Defined in: [storage/PostgresEventStorageAdapter.ts:260](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L260)

Get events created since a specific timestamp

#### Parameters

##### timestamp

`string` | `Date`

#### Returns

`Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getEventsSince`](../interfaces/EventStorageAdapter.md#geteventssince)

***

### getEventsSincePagination()

> **getEventsSincePagination**(`timestamp`, `limit`): `Promise`\<\{ `events`: [`FormSubmission`](../interfaces/FormSubmission.md)[]; `nextCursor`: `null` \| `string` \| `Date`; \}\>

Defined in: [storage/PostgresEventStorageAdapter.ts:282](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L282)

Get events since timestamp with pagination support (10 events/page default)

#### Parameters

##### timestamp

`string` | `Date`

##### limit

`number` = `100`

#### Returns

`Promise`\<\{ `events`: [`FormSubmission`](../interfaces/FormSubmission.md)[]; `nextCursor`: `null` \| `string` \| `Date`; \}\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getEventsSincePagination`](../interfaces/EventStorageAdapter.md#geteventssincepagination)

***

### getAuditLogsSince()

> **getAuditLogsSince**(`timestamp`): `Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

Defined in: [storage/PostgresEventStorageAdapter.ts:317](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L317)

Get audit logs created since a specific timestamp

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getAuditLogsSince`](../interfaces/EventStorageAdapter.md#getauditlogssince)

***

### updateSyncLevelFromEvents()

> **updateSyncLevelFromEvents**(`events`): `Promise`\<`void`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:327](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L327)

Update sync levels for multiple events

#### Parameters

##### events

[`FormSubmission`](../interfaces/FormSubmission.md)[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`updateSyncLevelFromEvents`](../interfaces/EventStorageAdapter.md#updatesynclevelfromevents)

***

### getLastSyncTimestamp()

> **getLastSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:343](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L343)

#### Returns

`Promise`\<`string`\>

***

### setLastSyncTimestamp()

> **setLastSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:353](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L353)

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

***

### getLastRemoteSyncTimestamp()

> **getLastRemoteSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:362](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L362)

Get the timestamp of the last remote sync

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getLastRemoteSyncTimestamp`](../interfaces/EventStorageAdapter.md#getlastremotesynctimestamp)

***

### setLastRemoteSyncTimestamp()

> **setLastRemoteSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:374](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L374)

Set the timestamp of the last remote sync

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`setLastRemoteSyncTimestamp`](../interfaces/EventStorageAdapter.md#setlastremotesynctimestamp)

***

### getLastLocalSyncTimestamp()

> **getLastLocalSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:384](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L384)

Get the timestamp of the last local sync

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getLastLocalSyncTimestamp`](../interfaces/EventStorageAdapter.md#getlastlocalsynctimestamp)

***

### setLastLocalSyncTimestamp()

> **setLastLocalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:396](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L396)

Set the timestamp of the last local sync

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`setLastLocalSyncTimestamp`](../interfaces/EventStorageAdapter.md#setlastlocalsynctimestamp)

***

### getLastPullExternalSyncTimestamp()

> **getLastPullExternalSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:406](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L406)

Get the timestamp of the last external sync pull

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getLastPullExternalSyncTimestamp`](../interfaces/EventStorageAdapter.md#getlastpullexternalsynctimestamp)

***

### setLastPullExternalSyncTimestamp()

> **setLastPullExternalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:418](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L418)

Set the timestamp of the last external sync pull

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`setLastPullExternalSyncTimestamp`](../interfaces/EventStorageAdapter.md#setlastpullexternalsynctimestamp)

***

### getLastPushExternalSyncTimestamp()

> **getLastPushExternalSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:428](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L428)

Get the timestamp of the last external sync push

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getLastPushExternalSyncTimestamp`](../interfaces/EventStorageAdapter.md#getlastpushexternalsynctimestamp)

***

### setLastPushExternalSyncTimestamp()

> **setLastPushExternalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:440](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L440)

Set the timestamp of the last external sync push

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`setLastPushExternalSyncTimestamp`](../interfaces/EventStorageAdapter.md#setlastpushexternalsynctimestamp)

***

### isEventExisted()

> **isEventExisted**(`guid`): `Promise`\<`boolean`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:450](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L450)

Check if an event with the given GUID exists

#### Parameters

##### guid

`string`

#### Returns

`Promise`\<`boolean`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`isEventExisted`](../interfaces/EventStorageAdapter.md#iseventexisted)

***

### getAuditTrailByEntityGuid()

> **getAuditTrailByEntityGuid**(`entityGuid`): `Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

Defined in: [storage/PostgresEventStorageAdapter.ts:460](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L460)

Get complete audit trail for a specific entity

#### Parameters

##### entityGuid

`string`

#### Returns

`Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getAuditTrailByEntityGuid`](../interfaces/EventStorageAdapter.md#getaudittrailbyentityguid)

***

### clearStore()

> **clearStore**(): `Promise`\<`void`\>

Defined in: [storage/PostgresEventStorageAdapter.ts:482](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEventStorageAdapter.ts#L482)

Clear all data from the store (for testing)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`clearStore`](../interfaces/EventStorageAdapter.md#clearstore)
