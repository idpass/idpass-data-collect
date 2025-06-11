[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / DetailGroupDoc

# Interface: DetailGroupDoc

Defined in: [interfaces/types.ts:176](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L176)

Detailed group document with member information loaded.

Used for displaying complete group information including member details.

## Extends

- [`GroupDoc`](GroupDoc.md)

## Properties

### id

> **id**: `string`

Defined in: [interfaces/types.ts:56](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L56)

Internal database ID (auto-generated)

#### Inherited from

[`GroupDoc`](GroupDoc.md).[`id`](GroupDoc.md#id)

***

### guid

> **guid**: `string`

Defined in: [interfaces/types.ts:58](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L58)

Global unique identifier (user-provided or generated)

#### Inherited from

[`GroupDoc`](GroupDoc.md).[`guid`](GroupDoc.md#guid)

***

### externalId?

> `optional` **externalId**: `string`

Defined in: [interfaces/types.ts:60](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L60)

Optional external system identifier for sync

#### Inherited from

[`GroupDoc`](GroupDoc.md).[`externalId`](GroupDoc.md#externalid)

***

### name?

> `optional` **name**: `string`

Defined in: [interfaces/types.ts:62](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L62)

Optional display name for the entity

#### Inherited from

[`GroupDoc`](GroupDoc.md).[`name`](GroupDoc.md#name)

***

### version

> **version**: `number`

Defined in: [interfaces/types.ts:66](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L66)

Version number for optimistic concurrency control

#### Inherited from

[`GroupDoc`](GroupDoc.md).[`version`](GroupDoc.md#version)

***

### data

> **data**: `Record`\<`string`, `any`\>

Defined in: [interfaces/types.ts:69](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L69)

Flexible data payload containing entity-specific fields

#### Inherited from

[`GroupDoc`](GroupDoc.md).[`data`](GroupDoc.md#data)

***

### lastUpdated

> **lastUpdated**: `string`

Defined in: [interfaces/types.ts:71](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L71)

ISO timestamp of last modification

#### Inherited from

[`GroupDoc`](GroupDoc.md).[`lastUpdated`](GroupDoc.md#lastupdated)

***

### type

> **type**: [`Group`](../enumerations/EntityType.md#group)

Defined in: [interfaces/types.ts:137](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L137)

Type of entity (Individual or Group)

#### Inherited from

[`GroupDoc`](GroupDoc.md).[`type`](GroupDoc.md#type)

***

### memberIds

> **memberIds**: `string`[]

Defined in: [interfaces/types.ts:139](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L139)

Array of entity GUIDs that are members of this group

#### Inherited from

[`GroupDoc`](GroupDoc.md).[`memberIds`](GroupDoc.md#memberids)

***

### memberCount

> **memberCount**: `number`

Defined in: [interfaces/types.ts:178](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L178)

Number of members in this group

***

### missing?

> `optional` **missing**: `true`

Defined in: [interfaces/types.ts:180](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L180)

Indicates if the group is missing/not found

***

### members

> **members**: [`DetailEntityDoc`](DetailEntityDoc.md)[] \| `DetailGroupDoc`[]

Defined in: [interfaces/types.ts:182](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L182)

Loaded member entities (can be nested groups)
