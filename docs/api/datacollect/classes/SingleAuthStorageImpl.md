[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / SingleAuthStorageImpl

# Class: SingleAuthStorageImpl

Defined in: [services/SingleAuthStorageImpl.ts:22](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/services/SingleAuthStorageImpl.ts#L22)

## Implements

- [`SingleAuthStorage`](../interfaces/SingleAuthStorage.md)

## Constructors

### Constructor

> **new SingleAuthStorageImpl**(`storage`, `provider`): `SingleAuthStorageImpl`

Defined in: [services/SingleAuthStorageImpl.ts:23](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/services/SingleAuthStorageImpl.ts#L23)

#### Parameters

##### storage

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md)

##### provider

`string` = `"default_provider"`

#### Returns

`SingleAuthStorageImpl`

## Methods

### getToken()

> **getToken**(): `Promise`\<`string`\>

Defined in: [services/SingleAuthStorageImpl.ts:28](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/services/SingleAuthStorageImpl.ts#L28)

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`SingleAuthStorage`](../interfaces/SingleAuthStorage.md).[`getToken`](../interfaces/SingleAuthStorage.md#gettoken)

***

### setToken()

> **setToken**(`token`): `Promise`\<`void`\>

Defined in: [services/SingleAuthStorageImpl.ts:32](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/services/SingleAuthStorageImpl.ts#L32)

#### Parameters

##### token

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`SingleAuthStorage`](../interfaces/SingleAuthStorage.md).[`setToken`](../interfaces/SingleAuthStorage.md#settoken)

***

### removeToken()

> **removeToken**(): `Promise`\<`void`\>

Defined in: [services/SingleAuthStorageImpl.ts:36](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/services/SingleAuthStorageImpl.ts#L36)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`SingleAuthStorage`](../interfaces/SingleAuthStorage.md).[`removeToken`](../interfaces/SingleAuthStorage.md#removetoken)
