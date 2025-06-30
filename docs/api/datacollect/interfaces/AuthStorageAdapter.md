[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / AuthStorageAdapter

# Interface: AuthStorageAdapter

Defined in: [interfaces/types.ts:772](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L772)

## Methods

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:773](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L773)

#### Returns

`Promise`\<`void`\>

***

### getUsername()

> **getUsername**(): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:774](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L774)

#### Returns

`Promise`\<`string`\>

***

### getToken()

> **getToken**(): `Promise`\<`null` \| \{ `provider`: `string`; `token`: `string`; \}\>

Defined in: [interfaces/types.ts:775](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L775)

#### Returns

`Promise`\<`null` \| \{ `provider`: `string`; `token`: `string`; \}\>

***

### getTokenByProvider()

> **getTokenByProvider**(`provider`): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:776](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L776)

#### Parameters

##### provider

`string`

#### Returns

`Promise`\<`string`\>

***

### setUsername()

> **setUsername**(`username`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:777](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L777)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`void`\>

***

### setToken()

> **setToken**(`provider`, `token`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:778](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L778)

#### Parameters

##### provider

`string`

##### token

`string`

#### Returns

`Promise`\<`void`\>

***

### removeToken()

> **removeToken**(`provider`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:779](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L779)

#### Parameters

##### provider

`string`

#### Returns

`Promise`\<`void`\>

***

### removeAllTokens()

> **removeAllTokens**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:780](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L780)

#### Returns

`Promise`\<`void`\>

***

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:781](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L781)

#### Returns

`Promise`\<`void`\>

***

### clearStore()

> **clearStore**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:782](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L782)

#### Returns

`Promise`\<`void`\>
