[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / AuthAdapter

# Interface: AuthAdapter

Defined in: [interfaces/types.ts:763](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L763)

## Methods

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:764](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L764)

#### Returns

`Promise`\<`void`\>

***

### isAuthenticated()

> **isAuthenticated**(): `Promise`\<`boolean`\>

Defined in: [interfaces/types.ts:765](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L765)

#### Returns

`Promise`\<`boolean`\>

***

### login()

> **login**(`credentials`): `Promise`\<\{ `username`: `string`; `token`: `string`; \}\>

Defined in: [interfaces/types.ts:766](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L766)

#### Parameters

##### credentials

`null` | [`PasswordCredentials`](PasswordCredentials.md) | [`TokenCredentials`](TokenCredentials.md)

#### Returns

`Promise`\<\{ `username`: `string`; `token`: `string`; \}\>

***

### logout()

> **logout**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:767](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L767)

#### Returns

`Promise`\<`void`\>

***

### validateToken()

> **validateToken**(`token`): `Promise`\<`boolean`\>

Defined in: [interfaces/types.ts:768](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L768)

#### Parameters

##### token

`string`

#### Returns

`Promise`\<`boolean`\>

***

### handleCallback()

> **handleCallback**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:769](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L769)

#### Returns

`Promise`\<`void`\>
