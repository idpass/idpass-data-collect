[**ID PASS Data Collect API Documentation v0.0.1**](../README.md)

***

[ID PASS Data Collect API Documentation](../globals.md) / SyncAdapterImpl

# Class: SyncAdapterImpl

Defined in: [components/SyncAdapter.ts:22](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/SyncAdapter.ts#L22)

Sync adapter interface for external system synchronization.

Provides integration with external systems for bi-directional data sync.
Implementations include OpenSppSyncAdapter and MockSyncServerAdapter.

## Implements

- [`SyncAdapter`](../interfaces/SyncAdapter.md)

## Constructors

### Constructor

> **new SyncAdapterImpl**(`apiUrl`): `SyncAdapterImpl`

Defined in: [components/SyncAdapter.ts:31](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/SyncAdapter.ts#L31)

#### Parameters

##### apiUrl

`string`

#### Returns

`SyncAdapterImpl`

## Methods

### pushEvents()

> **pushEvents**(`events`): `Promise`\<`void`\>

Defined in: [components/SyncAdapter.ts:33](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/SyncAdapter.ts#L33)

Push events to external system

#### Parameters

##### events

[`FormSubmission`](../interfaces/FormSubmission.md)[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`SyncAdapter`](../interfaces/SyncAdapter.md).[`pushEvents`](../interfaces/SyncAdapter.md#pushevents)

***

### pushEntities()

> **pushEntities**(`entities`): `Promise`\<`void`\>

Defined in: [components/SyncAdapter.ts:56](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/SyncAdapter.ts#L56)

Push entities to external system

#### Parameters

##### entities

[`EntityDoc`](../interfaces/EntityDoc.md)[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`SyncAdapter`](../interfaces/SyncAdapter.md).[`pushEntities`](../interfaces/SyncAdapter.md#pushentities)

***

### pullEntities()

> **pullEntities**(): `Promise`\<`void`\>

Defined in: [components/SyncAdapter.ts:79](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/SyncAdapter.ts#L79)

Pull entities from external system

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`SyncAdapter`](../interfaces/SyncAdapter.md).[`pullEntities`](../interfaces/SyncAdapter.md#pullentities)

***

### onSyncComplete()

> **onSyncComplete**(`callback`): `void`

Defined in: [components/SyncAdapter.ts:105](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/SyncAdapter.ts#L105)

Register callback for sync completion

#### Parameters

##### callback

(`status`) => `void`

#### Returns

`void`

#### Implementation of

[`SyncAdapter`](../interfaces/SyncAdapter.md).[`onSyncComplete`](../interfaces/SyncAdapter.md#onsynccomplete)

***

### startAutoSync()

> **startAutoSync**(`interval`): `void`

Defined in: [components/SyncAdapter.ts:109](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/SyncAdapter.ts#L109)

Start automatic synchronization at specified interval

#### Parameters

##### interval

`number`

#### Returns

`void`

#### Implementation of

[`SyncAdapter`](../interfaces/SyncAdapter.md).[`startAutoSync`](../interfaces/SyncAdapter.md#startautosync)

***

### stopAutoSync()

> **stopAutoSync**(): `void`

Defined in: [components/SyncAdapter.ts:116](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/SyncAdapter.ts#L116)

Stop automatic synchronization

#### Returns

`void`

#### Implementation of

[`SyncAdapter`](../interfaces/SyncAdapter.md).[`stopAutoSync`](../interfaces/SyncAdapter.md#stopautosync)

***

### getServerTimestamp()

> **getServerTimestamp**(): `Promise`\<`string`\>

Defined in: [components/SyncAdapter.ts:147](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/SyncAdapter.ts#L147)

Get the server timestamp to prevent clock differences between clients and server

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`SyncAdapter`](../interfaces/SyncAdapter.md).[`getServerTimestamp`](../interfaces/SyncAdapter.md#getservertimestamp)
