[**ID PASS Data Collect API Documentation v0.0.1**](../README.md)

***

[ID PASS Data Collect API Documentation](../globals.md) / EntityStorageAdapter

# Interface: EntityStorageAdapter

Defined in: [interfaces/types.ts:531](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L531)

Storage adapter interface for entity persistence.

Provides the low-level storage operations for entities.
Implementations include IndexedDbEntityStorageAdapter and PostgresEntityStorageAdapter.

## Methods

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:533](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L533)

Initialize the storage adapter (create tables, indexes, etc.)

#### Returns

`Promise`\<`void`\>

***

### saveEntity()

> **saveEntity**(`entity`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:535](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L535)

Save an entity pair to storage

#### Parameters

##### entity

[`EntityPair`](EntityPair.md)

#### Returns

`Promise`\<`void`\>

***

### getEntity()

> **getEntity**(`id`): `Promise`\<`null` \| [`EntityPair`](EntityPair.md)\>

Defined in: [interfaces/types.ts:537](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L537)

Get entity by internal ID

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`null` \| [`EntityPair`](EntityPair.md)\>

***

### getEntityByExternalId()

> **getEntityByExternalId**(`externalId`): `Promise`\<`null` \| [`EntityPair`](EntityPair.md)\>

Defined in: [interfaces/types.ts:539](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L539)

Get entity by external system ID

#### Parameters

##### externalId

`string`

#### Returns

`Promise`\<`null` \| [`EntityPair`](EntityPair.md)\>

***

### searchEntities()

> **searchEntities**(`criteria`): `Promise`\<[`EntityPair`](EntityPair.md)[]\>

Defined in: [interfaces/types.ts:541](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L541)

Search entities using query criteria

#### Parameters

##### criteria

[`SearchCriteria`](../type-aliases/SearchCriteria.md)

#### Returns

`Promise`\<[`EntityPair`](EntityPair.md)[]\>

***

### getAllEntities()

> **getAllEntities**(): `Promise`\<[`EntityPair`](EntityPair.md)[]\>

Defined in: [interfaces/types.ts:543](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L543)

Get all entities from storage

#### Returns

`Promise`\<[`EntityPair`](EntityPair.md)[]\>

***

### deleteEntity()

> **deleteEntity**(`id`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:545](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L545)

Delete an entity by ID

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>

***

### savePotentialDuplicates()

> **savePotentialDuplicates**(`duplicates`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:547](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L547)

Save potential duplicate entity pairs for review

#### Parameters

##### duplicates

`object`[]

#### Returns

`Promise`\<`void`\>

***

### getPotentialDuplicates()

> **getPotentialDuplicates**(): `Promise`\<`object`[]\>

Defined in: [interfaces/types.ts:549](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L549)

Get all potential duplicate pairs

#### Returns

`Promise`\<`object`[]\>

***

### resolvePotentialDuplicates()

> **resolvePotentialDuplicates**(`duplicates`): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:551](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L551)

Resolve potential duplicate pairs (mark as reviewed)

#### Parameters

##### duplicates

`object`[]

#### Returns

`Promise`\<`void`\>

***

### clearStore()

> **clearStore**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:553](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L553)

Clear all data from storage (for testing)

#### Returns

`Promise`\<`void`\>

***

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [interfaces/types.ts:555](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L555)

Close database connections and cleanup resources

#### Returns

`Promise`\<`void`\>
