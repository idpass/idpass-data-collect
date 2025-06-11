[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / SyncAdapter

# Interface: SyncAdapter

Defined in: [interfaces/types.ts:564](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L564)

Sync adapter interface for external system synchronization.

Provides integration with external systems for bi-directional data sync.
Implementations include OpenSppSyncAdapter and MockSyncServerAdapter.

## Extended by

- [`AuthenticatedSyncAdapter`](AuthenticatedSyncAdapter.md)

## Methods

### pushEvents()

> **pushEvents**(`events`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:566](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L566)

Push events to external system

#### Parameters

##### events

[`FormSubmission`](FormSubmission.md)[]

#### Returns

`Promise`\<`void`\>

***

### pullEntities()

> **pullEntities**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:568](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L568)

Pull entities from external system

#### Returns

`Promise`\<`void`\>

***

### pushEntities()

> **pushEntities**(`entities`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:570](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L570)

Push entities to external system

#### Parameters

##### entities

[`EntityDoc`](EntityDoc.md)[]

#### Returns

`Promise`\<`void`\>

***

### onSyncComplete()

> **onSyncComplete**(`callback`): `void`

Defined in: [interfaces/types.ts:572](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L572)

Register callback for sync completion

#### Parameters

##### callback

(`status`) => `void`

#### Returns

`void`

***

### startAutoSync()

> **startAutoSync**(`interval`): `void`

Defined in: [interfaces/types.ts:574](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L574)

Start automatic synchronization at specified interval

#### Parameters

##### interval

`number`

#### Returns

`void`

***

### stopAutoSync()

> **stopAutoSync**(): `void`

Defined in: [interfaces/types.ts:576](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L576)

Stop automatic synchronization

#### Returns

`void`

***

### getServerTimestamp()

> **getServerTimestamp**(): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:578](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L578)

Get the server timestamp to prevent clock differences between clients and server

#### Returns

`Promise`\<`string`\>
