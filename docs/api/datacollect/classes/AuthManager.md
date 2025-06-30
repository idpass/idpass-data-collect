[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / AuthManager

# Class: AuthManager

Defined in: [components/AuthManager.ts:38](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L38)

## Constructors

### Constructor

> **new AuthManager**(`configs`, `syncServerUrl`, `authStorage?`): `AuthManager`

Defined in: [components/AuthManager.ts:39](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L39)

#### Parameters

##### configs

[`AuthConfig`](../interfaces/AuthConfig.md)[]

##### syncServerUrl

`string`

##### authStorage?

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md)

#### Returns

`AuthManager`

## Methods

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [components/AuthManager.ts:46](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L46)

#### Returns

`Promise`\<`void`\>

***

### isAuthenticated()

> **isAuthenticated**(): `Promise`\<`boolean`\>

Defined in: [components/AuthManager.ts:68](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L68)

#### Returns

`Promise`\<`boolean`\>

***

### login()

> **login**(`credentials`, `type?`): `Promise`\<`void`\>

Defined in: [components/AuthManager.ts:89](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L89)

#### Parameters

##### credentials

`null` | [`PasswordCredentials`](../interfaces/PasswordCredentials.md) | [`TokenCredentials`](../interfaces/TokenCredentials.md)

##### type?

`string`

#### Returns

`Promise`\<`void`\>

***

### logout()

> **logout**(): `Promise`\<`void`\>

Defined in: [components/AuthManager.ts:128](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L128)

#### Returns

`Promise`\<`void`\>

***

### validateToken()

> **validateToken**(`type`, `token`): `Promise`\<`boolean`\>

Defined in: [components/AuthManager.ts:135](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L135)

#### Parameters

##### type

`string`

##### token

`string`

#### Returns

`Promise`\<`boolean`\>

***

### handleCallback()

> **handleCallback**(`type`): `Promise`\<`void`\>

Defined in: [components/AuthManager.ts:139](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/AuthManager.ts#L139)

#### Parameters

##### type

`string`

#### Returns

`Promise`\<`void`\>
