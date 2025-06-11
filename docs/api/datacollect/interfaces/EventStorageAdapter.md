[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / EventStorageAdapter

# Interface: EventStorageAdapter

Defined in: [interfaces/types.ts:336](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L336)

Storage adapter interface for event persistence.

Provides the low-level storage operations for events and audit logs.
Implementations include IndexedDbEventStorageAdapter and PostgresEventStorageAdapter.

## Methods

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:338](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L338)

Initialize the storage adapter (create tables, indexes, etc.)

#### Returns

`Promise`\<`void`\>

***

### saveEvents()

> **saveEvents**(`forms`): `Promise`\<`string`[]\>

Defined in: [interfaces/types.ts:340](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L340)

Save multiple events and return their IDs

#### Parameters

##### forms

[`FormSubmission`](FormSubmission.md)[]

#### Returns

`Promise`\<`string`[]\>

***

### getEvents()

> **getEvents**(): `Promise`\<[`FormSubmission`](FormSubmission.md)[]\>

Defined in: [interfaces/types.ts:342](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L342)

Get all events from storage

#### Returns

`Promise`\<[`FormSubmission`](FormSubmission.md)[]\>

***

### saveAuditLog()

> **saveAuditLog**(`entries`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:344](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L344)

Save multiple audit log entries

#### Parameters

##### entries

[`AuditLogEntry`](AuditLogEntry.md)[]

#### Returns

`Promise`\<`void`\>

***

### getAuditLog()

> **getAuditLog**(): `Promise`\<[`AuditLogEntry`](AuditLogEntry.md)[]\>

Defined in: [interfaces/types.ts:346](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L346)

Get all audit log entries

#### Returns

`Promise`\<[`AuditLogEntry`](AuditLogEntry.md)[]\>

***

### saveMerkleRoot()

> **saveMerkleRoot**(`root`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:348](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L348)

Save Merkle tree root hash

#### Parameters

##### root

`string`

#### Returns

`Promise`\<`void`\>

***

### getMerkleRoot()

> **getMerkleRoot**(): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:350](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L350)

Get current Merkle tree root hash

#### Returns

`Promise`\<`string`\>

***

### updateEventSyncLevel()

> **updateEventSyncLevel**(`id`, `syncLevel`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:352](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L352)

Update the sync level of an event

#### Parameters

##### id

`string`

##### syncLevel

[`SyncLevel`](../enumerations/SyncLevel.md)

#### Returns

`Promise`\<`void`\>

***

### updateAuditLogSyncLevel()

> **updateAuditLogSyncLevel**(`id`, `syncLevel`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:354](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L354)

Update the sync level of an audit log entry

#### Parameters

##### id

`string`

##### syncLevel

[`SyncLevel`](../enumerations/SyncLevel.md)

#### Returns

`Promise`\<`void`\>

***

### getEventsSince()

> **getEventsSince**(`timestamp`): `Promise`\<[`FormSubmission`](FormSubmission.md)[]\>

Defined in: [interfaces/types.ts:356](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L356)

Get events created since a specific timestamp

#### Parameters

##### timestamp

`string` | `Date`

#### Returns

`Promise`\<[`FormSubmission`](FormSubmission.md)[]\>

***

### getAuditLogsSince()

> **getAuditLogsSince**(`timestamp`): `Promise`\<[`AuditLogEntry`](AuditLogEntry.md)[]\>

Defined in: [interfaces/types.ts:358](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L358)

Get audit logs created since a specific timestamp

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<[`AuditLogEntry`](AuditLogEntry.md)[]\>

***

### getEventsSincePagination()

> **getEventsSincePagination**(`timestamp`, `limit`): `Promise`\<\{ `events`: [`FormSubmission`](FormSubmission.md)[]; `nextCursor`: `null` \| `string` \| `Date`; \}\>

Defined in: [interfaces/types.ts:360](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L360)

Get events since timestamp with pagination support (10 events/page default)

#### Parameters

##### timestamp

`string` | `Date`

##### limit

`number`

#### Returns

`Promise`\<\{ `events`: [`FormSubmission`](FormSubmission.md)[]; `nextCursor`: `null` \| `string` \| `Date`; \}\>

***

### updateSyncLevelFromEvents()

> **updateSyncLevelFromEvents**(`events`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:368](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L368)

Update sync levels for multiple events

#### Parameters

##### events

[`FormSubmission`](FormSubmission.md)[]

#### Returns

`Promise`\<`void`\>

***

### getLastRemoteSyncTimestamp()

> **getLastRemoteSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:370](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L370)

Get the timestamp of the last remote sync

#### Returns

`Promise`\<`string`\>

***

### setLastRemoteSyncTimestamp()

> **setLastRemoteSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:372](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L372)

Set the timestamp of the last remote sync

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

***

### getLastLocalSyncTimestamp()

> **getLastLocalSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:374](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L374)

Get the timestamp of the last local sync

#### Returns

`Promise`\<`string`\>

***

### setLastLocalSyncTimestamp()

> **setLastLocalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:376](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L376)

Set the timestamp of the last local sync

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

***

### getLastPullExternalSyncTimestamp()

> **getLastPullExternalSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:378](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L378)

Get the timestamp of the last external sync pull

#### Returns

`Promise`\<`string`\>

***

### setLastPullExternalSyncTimestamp()

> **setLastPullExternalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:380](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L380)

Set the timestamp of the last external sync pull

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

***

### getLastPushExternalSyncTimestamp()

> **getLastPushExternalSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:382](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L382)

Get the timestamp of the last external sync push

#### Returns

`Promise`\<`string`\>

***

### setLastPushExternalSyncTimestamp()

> **setLastPushExternalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:384](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L384)

Set the timestamp of the last external sync push

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

***

### isEventExisted()

> **isEventExisted**(`guid`): `Promise`\<`boolean`\>

Defined in: [interfaces/types.ts:386](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L386)

Check if an event with the given GUID exists

#### Parameters

##### guid

`string`

#### Returns

`Promise`\<`boolean`\>

***

### getAuditTrailByEntityGuid()

> **getAuditTrailByEntityGuid**(`entityGuid`): `Promise`\<[`AuditLogEntry`](AuditLogEntry.md)[]\>

Defined in: [interfaces/types.ts:388](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L388)

Get complete audit trail for a specific entity

#### Parameters

##### entityGuid

`string`

#### Returns

`Promise`\<[`AuditLogEntry`](AuditLogEntry.md)[]\>

***

### clearStore()

> **clearStore**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:390](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L390)

Clear all data from the store (for testing)

#### Returns

`Promise`\<`void`\>

***

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:392](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L392)

Close database connections and cleanup resources

#### Returns

`Promise`\<`void`\>
