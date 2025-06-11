[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / ExportImportManager

# Interface: ExportImportManager

Defined in: [interfaces/types.ts:458](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L458)

Export/import manager interface for data portability.

Enables exporting all entity and event data for backup, migration,
or integration with other systems.

## Methods

### exportData()

> **exportData**(`format`): `Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

Defined in: [interfaces/types.ts:460](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L460)

Export all data in the specified format

#### Parameters

##### format

`"json"` | `"binary"`

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

***

### importData()

> **importData**(`data`): `Promise`\<[`ImportResult`](../type-aliases/ImportResult.md)\>

Defined in: [interfaces/types.ts:462](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L462)

Import data from a buffer

#### Parameters

##### data

`Buffer`

#### Returns

`Promise`\<[`ImportResult`](../type-aliases/ImportResult.md)\>
