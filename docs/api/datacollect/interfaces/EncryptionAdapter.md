[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / EncryptionAdapter

# Interface: EncryptionAdapter

Defined in: [interfaces/types.ts:445](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L445)

Encryption adapter interface for data protection.

Provides encryption capabilities for sensitive data fields.
Currently not fully implemented (data parameter is 'never').

## Methods

### encrypt()

> **encrypt**(`data`): `Promise`\<`string`\>

Defined in: [interfaces/types.ts:447](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L447)

Encrypt data (not implemented)

#### Parameters

##### data

`never`

#### Returns

`Promise`\<`string`\>

***

### decrypt()

> **decrypt**(`data`): `Promise`\<`unknown`\>

Defined in: [interfaces/types.ts:449](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L449)

Decrypt encrypted data

#### Parameters

##### data

`string`

#### Returns

`Promise`\<`unknown`\>
