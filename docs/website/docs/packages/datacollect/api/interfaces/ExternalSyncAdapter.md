[idpass-data-collect](../index.md) / ExternalSyncAdapter

# Interface: ExternalSyncAdapter

Defined in: [interfaces/types.ts:660](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L660)

External sync adapter interface for third-party system integration.

Implementations handle the specifics of syncing with different external systems.

## Methods

### sync()

> **sync**(`credentials?`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:662](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L662)

Perform synchronization with the external system

#### Parameters

##### credentials?

[`ExternalSyncCredentials`](ExternalSyncCredentials.md)

#### Returns

`Promise`\<`void`\>
