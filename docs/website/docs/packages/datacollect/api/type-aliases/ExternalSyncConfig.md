[idpass-data-collect](../index.md) / ExternalSyncConfig

# Type Alias: ExternalSyncConfig

> **ExternalSyncConfig** = `object`

Defined in: [interfaces/types.ts:644](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L644)

Configuration for external system synchronization.

## Example

```typescript
const openSppConfig: ExternalSyncConfig = {
  type: "openspp",
  url: "http://openspp.example.com",
  database: "openspp_db",
  auth: "basic"
};
```

## Properties

### type

> **type**: `string`

Defined in: [interfaces/types.ts:646](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L646)

Type of external system (e.g., 'openspp', 'mock-sync-server')

***

### auth?

> `optional` **auth**: `string`

Defined in: [interfaces/types.ts:648](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L648)

Authentication method (e.g., 'basic', 'token')

***

### url

> **url**: `string`

Defined in: [interfaces/types.ts:650](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L650)

URL of the external system

***

### extraFields

> **extraFields**: `object`[]

Defined in: [interfaces/types.ts:652](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L652)

Extra fields for the external system

#### name

> **name**: `string`

#### value

> **value**: `string`
