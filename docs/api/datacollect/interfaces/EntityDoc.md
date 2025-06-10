[**ID PASS Data Collect API Documentation v0.0.1**](../README.md)

***

[ID PASS Data Collect API Documentation](../globals.md) / EntityDoc

# Interface: EntityDoc

Defined in: [interfaces/types.ts:54](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L54)

Core entity document representing either an individual or group.

All entities in the system extend from this base interface.
Uses event sourcing - the current state is derived from applying events.

## Example

```typescript
const individual: EntityDoc = {
  id: "1",
  guid: "550e8400-e29b-41d4-a716-446655440000",
  type: EntityType.Individual,
  version: 1,
  data: { name: "John Doe", age: 30 },
  lastUpdated: "2024-01-01T00:00:00Z"
};
```

## Extended by

- [`GroupDoc`](GroupDoc.md)
- [`IndividualDoc`](IndividualDoc.md)
- [`DetailEntityDoc`](DetailEntityDoc.md)

## Properties

### id

> **id**: `string`

Defined in: [interfaces/types.ts:56](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L56)

Internal database ID (auto-generated)

***

### guid

> **guid**: `string`

Defined in: [interfaces/types.ts:58](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L58)

Global unique identifier (user-provided or generated)

***

### externalId?

> `optional` **externalId**: `string`

Defined in: [interfaces/types.ts:60](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L60)

Optional external system identifier for sync

***

### name?

> `optional` **name**: `string`

Defined in: [interfaces/types.ts:62](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L62)

Optional display name for the entity

***

### type

> **type**: [`EntityType`](../enumerations/EntityType.md)

Defined in: [interfaces/types.ts:64](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L64)

Type of entity (Individual or Group)

***

### version

> **version**: `number`

Defined in: [interfaces/types.ts:66](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L66)

Version number for optimistic concurrency control

***

### data

> **data**: `Record`\<`string`, `any`\>

Defined in: [interfaces/types.ts:69](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L69)

Flexible data payload containing entity-specific fields

***

### lastUpdated

> **lastUpdated**: `string`

Defined in: [interfaces/types.ts:71](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L71)

ISO timestamp of last modification
