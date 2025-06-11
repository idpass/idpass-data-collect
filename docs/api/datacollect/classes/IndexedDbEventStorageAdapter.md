[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / IndexedDbEventStorageAdapter

# Class: IndexedDbEventStorageAdapter

Defined in: [storage/IndexedDbEventStorageAdapter.ts:22](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L22)

Storage adapter interface for event persistence.

Provides the low-level storage operations for events and audit logs.
Implementations include IndexedDbEventStorageAdapter and PostgresEventStorageAdapter.

## Implements

- [`EventStorageAdapter`](../interfaces/EventStorageAdapter.md)

## Constructors

### Constructor

> **new IndexedDbEventStorageAdapter**(`tenantId`): `IndexedDbEventStorageAdapter`

Defined in: [storage/IndexedDbEventStorageAdapter.ts:26](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L26)

#### Parameters

##### tenantId

`string` = `""`

#### Returns

`IndexedDbEventStorageAdapter`

## Properties

### tenantId

> `readonly` **tenantId**: `string` = `""`

Defined in: [storage/IndexedDbEventStorageAdapter.ts:26](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L26)

## Methods

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:32](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L32)

Close database connections and cleanup resources

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`closeConnection`](../interfaces/EventStorageAdapter.md#closeconnection)

***

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:36](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L36)

Initialize the storage adapter (create tables, indexes, etc.)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`initialize`](../interfaces/EventStorageAdapter.md#initialize)

***

### saveEvents()

> **saveEvents**(`events`): `Promise`\<`string`[]\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:71](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L71)

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

Defined in: [storage/IndexedDbEventStorageAdapter.ts:93](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L93)

Get all events from storage

#### Returns

`Promise`\<[`FormSubmission`](../interfaces/FormSubmission.md)[]\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getEvents`](../interfaces/EventStorageAdapter.md#getevents)

***

### saveAuditLog()

> **saveAuditLog**(`entries`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:119](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L119)

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

Defined in: [storage/IndexedDbEventStorageAdapter.ts:136](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L136)

Get all audit log entries

#### Returns

`Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getAuditLog`](../interfaces/EventStorageAdapter.md#getauditlog)

***

### saveMerkleRoot()

> **saveMerkleRoot**(`root`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:162](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L162)

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

Defined in: [storage/IndexedDbEventStorageAdapter.ts:177](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L177)

Get current Merkle tree root hash

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getMerkleRoot`](../interfaces/EventStorageAdapter.md#getmerkleroot)

***

### clearStore()

> **clearStore**(): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:195](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L195)

Clear all data from the store (for testing)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`clearStore`](../interfaces/EventStorageAdapter.md#clearstore)

***

### updateEventSyncLevel()

> **updateEventSyncLevel**(`id`, `syncLevel`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:219](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L219)

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

> **updateAuditLogSyncLevel**(`entityGuId`, `syncLevel`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:247](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L247)

Update the sync level of an audit log entry

#### Parameters

##### entityGuId

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

Defined in: [storage/IndexedDbEventStorageAdapter.ts:275](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L275)

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

> **getEventsSincePagination**(`timestamp`, `pageSize`): `Promise`\<\{ `events`: [`FormSubmission`](../interfaces/FormSubmission.md)[]; `nextCursor`: `null` \| `string` \| `Date`; \}\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:304](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L304)

Get events since timestamp with pagination support (10 events/page default)

#### Parameters

##### timestamp

`string` | `Date`

##### pageSize

`number` = `10`

#### Returns

`Promise`\<\{ `events`: [`FormSubmission`](../interfaces/FormSubmission.md)[]; `nextCursor`: `null` \| `string` \| `Date`; \}\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getEventsSincePagination`](../interfaces/EventStorageAdapter.md#geteventssincepagination)

***

### getAuditLogsSince()

> **getAuditLogsSince**(`timestamp`): `Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:346](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L346)

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

Defined in: [storage/IndexedDbEventStorageAdapter.ts:373](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L373)

Update sync levels for multiple events

#### Parameters

##### events

[`FormSubmission`](../interfaces/FormSubmission.md)[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`updateSyncLevelFromEvents`](../interfaces/EventStorageAdapter.md#updatesynclevelfromevents)

***

### getLastRemoteSyncTimestamp()

> **getLastRemoteSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:407](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L407)

Get the timestamp of the last remote sync

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getLastRemoteSyncTimestamp`](../interfaces/EventStorageAdapter.md#getlastremotesynctimestamp)

***

### setLastRemoteSyncTimestamp()

> **setLastRemoteSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:424](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L424)

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

Defined in: [storage/IndexedDbEventStorageAdapter.ts:439](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L439)

Get the timestamp of the last local sync

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getLastLocalSyncTimestamp`](../interfaces/EventStorageAdapter.md#getlastlocalsynctimestamp)

***

### setLastLocalSyncTimestamp()

> **setLastLocalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:456](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L456)

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

Defined in: [storage/IndexedDbEventStorageAdapter.ts:471](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L471)

Get the timestamp of the last external sync pull

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getLastPullExternalSyncTimestamp`](../interfaces/EventStorageAdapter.md#getlastpullexternalsynctimestamp)

***

### setLastPullExternalSyncTimestamp()

> **setLastPullExternalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:488](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L488)

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

Defined in: [storage/IndexedDbEventStorageAdapter.ts:503](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L503)

Get the timestamp of the last external sync push

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getLastPushExternalSyncTimestamp`](../interfaces/EventStorageAdapter.md#getlastpushexternalsynctimestamp)

***

### setLastPushExternalSyncTimestamp()

> **setLastPushExternalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEventStorageAdapter.ts:520](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L520)

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

Defined in: [storage/IndexedDbEventStorageAdapter.ts:535](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L535)

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

Defined in: [storage/IndexedDbEventStorageAdapter.ts:555](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEventStorageAdapter.ts#L555)

Get complete audit trail for a specific entity

#### Parameters

##### entityGuid

`string`

#### Returns

`Promise`\<[`AuditLogEntry`](../interfaces/AuditLogEntry.md)[]\>

#### Implementation of

[`EventStorageAdapter`](../interfaces/EventStorageAdapter.md).[`getAuditTrailByEntityGuid`](../interfaces/EventStorageAdapter.md#getaudittrailbyentityguid)
