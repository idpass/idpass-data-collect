[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / IndividualDoc

# Interface: IndividualDoc

Defined in: [interfaces/types.ts:157](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L157)

Individual entity representing a single person.

## Example

```typescript
const person: IndividualDoc = {
  type: EntityType.Individual,
  data: {
    name: "John Doe",
    dateOfBirth: "1990-01-01"
  },
  // ... other EntityDoc properties
};
```

## Extends

- [`EntityDoc`](EntityDoc.md)

## Properties

### id

> **id**: `string`

Defined in: [interfaces/types.ts:56](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L56)

Internal database ID (auto-generated)

#### Inherited from

[`EntityDoc`](EntityDoc.md).[`id`](EntityDoc.md#id)

***

### guid

> **guid**: `string`

Defined in: [interfaces/types.ts:58](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L58)

Global unique identifier (user-provided or generated)

#### Inherited from

[`EntityDoc`](EntityDoc.md).[`guid`](EntityDoc.md#guid)

***

### externalId?

> `optional` **externalId**: `string`

Defined in: [interfaces/types.ts:60](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L60)

Optional external system identifier for sync

#### Inherited from

[`EntityDoc`](EntityDoc.md).[`externalId`](EntityDoc.md#externalid)

***

### name?

> `optional` **name**: `string`

Defined in: [interfaces/types.ts:62](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L62)

Optional display name for the entity

#### Inherited from

[`EntityDoc`](EntityDoc.md).[`name`](EntityDoc.md#name)

***

### version

> **version**: `number`

Defined in: [interfaces/types.ts:66](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L66)

Version number for optimistic concurrency control

#### Inherited from

[`EntityDoc`](EntityDoc.md).[`version`](EntityDoc.md#version)

***

### data

> **data**: `Record`\<`string`, `any`\>

Defined in: [interfaces/types.ts:69](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L69)

Flexible data payload containing entity-specific fields

#### Inherited from

[`EntityDoc`](EntityDoc.md).[`data`](EntityDoc.md#data)

***

### lastUpdated

> **lastUpdated**: `string`

Defined in: [interfaces/types.ts:71](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L71)

ISO timestamp of last modification

#### Inherited from

[`EntityDoc`](EntityDoc.md).[`lastUpdated`](EntityDoc.md#lastupdated)

***

### type

> **type**: [`Individual`](../enumerations/EntityType.md#individual)

Defined in: [interfaces/types.ts:158](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L158)

Type of entity (Individual or Group)

#### Overrides

[`EntityDoc`](EntityDoc.md).[`type`](EntityDoc.md#type)
