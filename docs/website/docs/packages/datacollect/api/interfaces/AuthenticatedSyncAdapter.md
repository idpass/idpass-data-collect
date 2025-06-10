[idpass-data-collect](../index.md) / AuthenticatedSyncAdapter

# Interface: AuthenticatedSyncAdapter

Defined in: [interfaces/types.ts:584](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L584)

Authenticated sync adapter for systems requiring authentication.

## Extends

- [`SyncAdapter`](SyncAdapter.md)

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

#### Inherited from

[`SyncAdapter`](SyncAdapter.md).[`pushEvents`](SyncAdapter.md#pushevents)

***

### pullEntities()

> **pullEntities**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:568](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L568)

Pull entities from external system

#### Returns

`Promise`\<`void`\>

#### Inherited from

[`SyncAdapter`](SyncAdapter.md).[`pullEntities`](SyncAdapter.md#pullentities)

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

#### Inherited from

[`SyncAdapter`](SyncAdapter.md).[`pushEntities`](SyncAdapter.md#pushentities)

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

#### Inherited from

[`SyncAdapter`](SyncAdapter.md).[`onSyncComplete`](SyncAdapter.md#onsynccomplete)

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

#### Inherited from

[`SyncAdapter`](SyncAdapter.md).[`startAutoSync`](SyncAdapter.md#startautosync)

***

### stopAutoSync()

> **stopAutoSync**(): `void`

Defined in: [interfaces/types.ts:576](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L576)

Stop automatic synchronization

#### Returns

`void`

#### Inherited from

[`SyncAdapter`](SyncAdapter.md).[`stopAutoSync`](SyncAdapter.md#stopautosync)

***

### getServerTimestamp()

> **getServerTimestamp**(): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:578](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L578)

Get the server timestamp to prevent clock differences between clients and server

#### Returns

`Promise`\<`string`\>

#### Inherited from

[`SyncAdapter`](SyncAdapter.md).[`getServerTimestamp`](SyncAdapter.md#getservertimestamp)

***

### authenticate()

> **authenticate**(): `Promise`\<`any`\>

Defined in: [interfaces/types.ts:587](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L587)

Authenticate with the external system

#### Returns

`Promise`\<`any`\>
