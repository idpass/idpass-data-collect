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

## Indexable

\[`key`: `string`\]: `unknown`

Additional configuration properties specific to the adapter

## Properties

### type

> **type**: `string`

Defined in: [interfaces/types.ts:646](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L646)

Type of external system (e.g., 'openspp', 'mock-sync-server')
