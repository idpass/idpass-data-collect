[**ID PASS Data Collect API Documentation v0.0.1**](../README.md)

***

[ID PASS Data Collect API Documentation](../globals.md) / EventStore

# Interface: EventStore

Defined in: [interfaces/types.ts:267](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L267)

Event store interface for managing form submissions and audit logs.

Provides event sourcing capabilities with Merkle tree integrity verification.
All changes to entities flow through this store as immutable events.

## Methods

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:269](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L269)

Initialize the event store (create tables, indexes, etc.)

#### Returns

`Promise`\<`void`\>

***

### saveEvent()

> **saveEvent**(`form`): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:271](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L271)

Save a single event and return its ID

#### Parameters

##### form

[`FormSubmission`](FormSubmission.md)

#### Returns

`Promise`\<`string`\>

***

### getEvents()

> **getEvents**(): `Promise`\<[`FormSubmission`](FormSubmission.md)[]\>

Defined in: [interfaces/types.ts:273](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L273)

Get events with optional filtering

#### Returns

`Promise`\<[`FormSubmission`](FormSubmission.md)[]\>

***

### getAllEvents()

> **getAllEvents**(): `Promise`\<[`FormSubmission`](FormSubmission.md)[]\>

Defined in: [interfaces/types.ts:275](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L275)

Get all events in the store

#### Returns

`Promise`\<[`FormSubmission`](FormSubmission.md)[]\>

***

### getMerkleRoot()

> **getMerkleRoot**(): `string`

Defined in: [interfaces/types.ts:277](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L277)

Get the current Merkle tree root hash for integrity verification

#### Returns

`string`

***

### verifyEvent()

> **verifyEvent**(`event`, `proof`): `boolean`

Defined in: [interfaces/types.ts:279](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L279)

Verify an event using Merkle tree proof

#### Parameters

##### event

[`FormSubmission`](FormSubmission.md)

##### proof

`string`[]

#### Returns

`boolean`

***

### getProof()

> **getProof**(`form`): `Promise`\<`string`[]\>

Defined in: [interfaces/types.ts:281](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L281)

Get Merkle tree proof for an event

#### Parameters

##### form

[`FormSubmission`](FormSubmission.md)

#### Returns

`Promise`\<`string`[]\>

***

### logAuditEntry()

> **logAuditEntry**(`entry`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:283](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L283)

Log a single audit entry

#### Parameters

##### entry

[`AuditLogEntry`](AuditLogEntry.md)

#### Returns

`Promise`\<`void`\>

***

### saveAuditLogs()

> **saveAuditLogs**(`entries`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:285](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L285)

Save multiple audit log entries

#### Parameters

##### entries

[`AuditLogEntry`](AuditLogEntry.md)[]

#### Returns

`Promise`\<`void`\>

***

### updateEventSyncLevel()

> **updateEventSyncLevel**(`id`, `syncLevel`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:287](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L287)

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

Defined in: [interfaces/types.ts:289](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L289)

Update the sync level of an audit log entry

#### Parameters

##### id

`string`

##### syncLevel

[`SyncLevel`](../enumerations/SyncLevel.md)

#### Returns

`Promise`\<`void`\>

***

### getAuditLogsSince()

> **getAuditLogsSince**(`timestamp`): `Promise`\<[`AuditLogEntry`](AuditLogEntry.md)[]\>

Defined in: [interfaces/types.ts:291](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L291)

Get audit logs created since a specific timestamp

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<[`AuditLogEntry`](AuditLogEntry.md)[]\>

***

### getEventsSince()

> **getEventsSince**(`timestamp`): `Promise`\<[`FormSubmission`](FormSubmission.md)[]\>

Defined in: [interfaces/types.ts:293](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L293)

Get events created since a specific timestamp

#### Parameters

##### timestamp

`string` | `Date`

#### Returns

`Promise`\<[`FormSubmission`](FormSubmission.md)[]\>

***

### getEventsSincePagination()

> **getEventsSincePagination**(`timestamp`, `limit`): `Promise`\<\{ `events`: [`FormSubmission`](FormSubmission.md)[]; `nextCursor`: `null` \| `string` \| `Date`; \}\>

Defined in: [interfaces/types.ts:295](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L295)

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

Defined in: [interfaces/types.ts:303](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L303)

Update sync levels for multiple events

#### Parameters

##### events

[`FormSubmission`](FormSubmission.md)[]

#### Returns

`Promise`\<`void`\>

***

### getLastRemoteSyncTimestamp()

> **getLastRemoteSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:305](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L305)

Get the timestamp of the last remote sync

#### Returns

`Promise`\<`string`\>

***

### setLastRemoteSyncTimestamp()

> **setLastRemoteSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:307](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L307)

Set the timestamp of the last remote sync

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

***

### getLastLocalSyncTimestamp()

> **getLastLocalSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:309](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L309)

Get the timestamp of the last local sync

#### Returns

`Promise`\<`string`\>

***

### setLastLocalSyncTimestamp()

> **setLastLocalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:311](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L311)

Set the timestamp of the last local sync

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

***

### getLastPullExternalSyncTimestamp()

> **getLastPullExternalSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:313](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L313)

Get the timestamp of the last external sync pull

#### Returns

`Promise`\<`string`\>

***

### setLastPullExternalSyncTimestamp()

> **setLastPullExternalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:315](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L315)

Set the timestamp of the last external sync pull

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

***

### getLastPushExternalSyncTimestamp()

> **getLastPushExternalSyncTimestamp**(): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:317](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L317)

Get the timestamp of the last external sync push

#### Returns

`Promise`\<`string`\>

***

### setLastPushExternalSyncTimestamp()

> **setLastPushExternalSyncTimestamp**(`timestamp`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:319](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L319)

Set the timestamp of the last external sync push

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<`void`\>

***

### isEventExisted()

> **isEventExisted**(`guid`): `Promise`\<`boolean`\>

Defined in: [interfaces/types.ts:321](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L321)

Check if an event with the given GUID exists

#### Parameters

##### guid

`string`

#### Returns

`Promise`\<`boolean`\>

***

### getAuditTrailByEntityGuid()

> **getAuditTrailByEntityGuid**(`entityGuid`): `Promise`\<[`AuditLogEntry`](AuditLogEntry.md)[]\>

Defined in: [interfaces/types.ts:323](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L323)

Get complete audit trail for a specific entity

#### Parameters

##### entityGuid

`string`

#### Returns

`Promise`\<[`AuditLogEntry`](AuditLogEntry.md)[]\>

***

### clearStore()

> **clearStore**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:325](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L325)

Clear all data from the store (for testing)

#### Returns

`Promise`\<`void`\>

***

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:327](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L327)

Close database connections and cleanup resources

#### Returns

`Promise`\<`void`\>
