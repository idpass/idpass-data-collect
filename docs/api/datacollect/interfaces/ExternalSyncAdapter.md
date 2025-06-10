[**ID PASS Data Collect API Documentation v0.0.1**](../README.md)

***

[ID PASS Data Collect API Documentation](../globals.md) / ExternalSyncAdapter

# Interface: ExternalSyncAdapter

Defined in: [interfaces/types.ts:656](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L656)

External sync adapter interface for third-party system integration.

Implementations handle the specifics of syncing with different external systems.

## Methods

### sync()

> **sync**(`credentials?`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:658](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L658)

Perform synchronization with the external system

#### Parameters

##### credentials?

[`ExternalSyncCredentials`](ExternalSyncCredentials.md)

#### Returns

`Promise`\<`void`\>
