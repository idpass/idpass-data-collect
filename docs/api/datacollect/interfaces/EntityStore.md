[**ID PASS Data Collect API Documentation v0.0.1**](../README.md)

***

[ID PASS Data Collect API Documentation](../globals.md) / EntityStore

# Interface: EntityStore

Defined in: [interfaces/types.ts:494](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L494)

Entity store interface for managing current entity state.

Stores the materialized view of entities derived from applying events.
Optimized for fast queries and lookups.

## Methods

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:496](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L496)

Initialize the entity store (create tables, indexes, etc.)

#### Returns

`Promise`\<`void`\>

***

### saveEntity()

> **saveEntity**(`initial`, `modified`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:498](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L498)

Save entity with both initial and current state

#### Parameters

##### initial

[`EntityDoc`](EntityDoc.md)

##### modified

[`EntityDoc`](EntityDoc.md)

#### Returns

`Promise`\<`void`\>

***

### getEntity()

> **getEntity**(`id`): `Promise`\<`null` \| [`EntityPair`](EntityPair.md)\>

Defined in: [interfaces/types.ts:500](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L500)

Get entity by internal ID

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`null` \| [`EntityPair`](EntityPair.md)\>

***

### getEntityByExternalId()

> **getEntityByExternalId**(`externalId`): `Promise`\<`null` \| [`EntityPair`](EntityPair.md)\>

Defined in: [interfaces/types.ts:502](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L502)

Get entity by external system ID

#### Parameters

##### externalId

`string`

#### Returns

`Promise`\<`null` \| [`EntityPair`](EntityPair.md)\>

***

### searchEntities()

> **searchEntities**(`criteria`): `Promise`\<[`EntityPair`](EntityPair.md)[]\>

Defined in: [interfaces/types.ts:504](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L504)

Search entities using query criteria

#### Parameters

##### criteria

[`SearchCriteria`](../type-aliases/SearchCriteria.md)

#### Returns

`Promise`\<[`EntityPair`](EntityPair.md)[]\>

***

### getAllEntities()

> **getAllEntities**(): `Promise`\<[`EntityPair`](EntityPair.md)[]\>

Defined in: [interfaces/types.ts:506](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L506)

Get all entities in the store

#### Returns

`Promise`\<[`EntityPair`](EntityPair.md)[]\>

***

### getModifiedEntitiesSince()

> **getModifiedEntitiesSince**(`timestamp`): `Promise`\<[`EntityPair`](EntityPair.md)[]\>

Defined in: [interfaces/types.ts:508](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L508)

Get entities modified since a timestamp (for sync)

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<[`EntityPair`](EntityPair.md)[]\>

***

### markEntityAsSynced()

> **markEntityAsSynced**(`id`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:510](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L510)

Mark an entity as synced with remote server

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>

***

### deleteEntity()

> **deleteEntity**(`id`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:512](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L512)

Delete an entity by ID

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>

***

### savePotentialDuplicates()

> **savePotentialDuplicates**(`duplicates`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:514](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L514)

Save potential duplicate entity pairs for review

#### Parameters

##### duplicates

`object`[]

#### Returns

`Promise`\<`void`\>

***

### getPotentialDuplicates()

> **getPotentialDuplicates**(): `Promise`\<`object`[]\>

Defined in: [interfaces/types.ts:516](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L516)

Get all potential duplicate pairs

#### Returns

`Promise`\<`object`[]\>

***

### resolvePotentialDuplicates()

> **resolvePotentialDuplicates**(`duplicates`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:518](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L518)

Resolve potential duplicate pairs (mark as reviewed)

#### Parameters

##### duplicates

`object`[]

#### Returns

`Promise`\<`void`\>

***

### clearStore()

> **clearStore**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:520](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L520)

Clear all data from the store (for testing)

#### Returns

`Promise`\<`void`\>

***

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:522](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L522)

Close database connections and cleanup resources

#### Returns

`Promise`\<`void`\>
