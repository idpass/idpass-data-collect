[idpass-data-collect](../index.md) / IndexedDbEntityStorageAdapter

# Class: IndexedDbEntityStorageAdapter

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:88](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L88)

IndexedDB implementation of the EntityStorageAdapter for browser-based entity persistence.

This adapter provides offline-first entity storage using the browser's IndexedDB API.
It implements the full EntityStorageAdapter interface with optimized indexing for fast
queries and efficient duplicate detection.

Key features:
- **Offline Storage**: Stores entities locally in the browser using IndexedDB
- **Multi-Tenant Support**: Isolated databases per tenant using tenant ID prefixes
- **Optimized Indexing**: Multiple indexes for fast lookups (GUID, name, externalId, timestamps)
- **Search Capabilities**: Flexible search with operators ($gt, $lt, $eq, $regex)
- **Duplicate Detection**: Built-in storage for potential duplicate pairs
- **Change Tracking**: Tracks initial and modified entity states for sync

Architecture:
- Uses IndexedDB object stores with compound keys for efficient storage
- Implements cursor-based iteration for memory-efficient operations
- Provides ACID transaction support for data consistency
- Supports both simple and complex search criteria

## Examples

Basic usage:
```typescript
const adapter = new IndexedDbEntityStorageAdapter('tenant-123');
await adapter.initialize();

// Save an entity pair
const entityPair: EntityPair = {
  guid: 'person-456',
  initial: originalEntity,
  modified: updatedEntity
};
await adapter.saveEntity(entityPair);

// Retrieve entity
const retrieved = await adapter.getEntity('person-456');
```

Search entities:
```typescript
// Search for adults
const adults = await adapter.searchEntities([
  { "modified.data.age": { $gt: 18 } },
  { "modified.type": "individual" }
]);

// Search by name pattern
const smiths = await adapter.searchEntities([
  { "modified.data.name": { $regex: "smith" } }
]);
```

Multi-tenant setup:
```typescript
// Tenant-specific adapter
const tenantAdapter = new IndexedDbEntityStorageAdapter('org-xyz');
await tenantAdapter.initialize(); // Creates database: entityStore_org-xyz

// Default adapter
const defaultAdapter = new IndexedDbEntityStorageAdapter();
await defaultAdapter.initialize(); // Creates database: entityStore
```

## Implements

- [`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md)

## Constructors

### Constructor

> **new IndexedDbEntityStorageAdapter**(`tenantId`): `IndexedDbEntityStorageAdapter`

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:108](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L108)

Creates a new IndexedDbEntityStorageAdapter instance.

#### Parameters

##### tenantId

`string` = `""`

Optional tenant identifier for multi-tenant isolation
                  When provided, creates a separate database prefixed with tenant ID

#### Returns

`IndexedDbEntityStorageAdapter`

#### Example

```typescript
// Default database (entityStore)
const adapter = new IndexedDbEntityStorageAdapter();

// Tenant-specific database (entityStore_org-123)
const tenantAdapter = new IndexedDbEntityStorageAdapter('org-123');
```

## Properties

### tenantId

> `readonly` **tenantId**: `string` = `""`

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:108](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L108)

Optional tenant identifier for multi-tenant isolation
                  When provided, creates a separate database prefixed with tenant ID

## Methods

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:120](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L120)

Closes the IndexedDB connection and cleans up resources.

For IndexedDB, connections are automatically managed by the browser,
so this method is a no-op but maintained for interface compatibility.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`closeConnection`](../interfaces/EntityStorageAdapter.md#closeconnection)

***

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:144](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L144)

Initializes the IndexedDB database with required object stores and indexes.

Creates:
- Main "entities" object store with GUID as primary key
- Indexes for fast lookups: guid, lastUpdated, type_lastUpdated, name, externalId
- "potentialDuplicates" object store for duplicate detection
- Compound key indexes for efficient duplicate pair management

This method must be called before any other operations.

#### Returns

`Promise`\<`void`\>

#### Throws

When IndexedDB is not supported or database creation fails

#### Example

```typescript
const adapter = new IndexedDbEntityStorageAdapter('tenant-123');
await adapter.initialize();
// Now ready for entity operations
```

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`initialize`](../interfaces/EntityStorageAdapter.md#initialize)

***

### getAllEntities()

> **getAllEntities**(): `Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:191](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L191)

Retrieves all entities stored in the database.

#### Returns

`Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Array of all entity pairs

#### Example

```typescript
const allEntities = await adapter.getAllEntities();
console.log(`Found ${allEntities.length} entities`);

// Filter by type
const individuals = allEntities.filter(e => e.modified.type === 'individual');
const groups = allEntities.filter(e => e.modified.type === 'group');
```

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`getAllEntities`](../interfaces/EntityStorageAdapter.md#getallentities)

***

### searchEntities()

> **searchEntities**(`criteria`): `Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:230](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L230)

Searches entities using flexible criteria with support for operators and string matching.

Supports multiple search operators:
- `$gt`: Greater than comparison
- `$lt`: Less than comparison  
- `$eq`: Exact equality
- `$regex`: Regular expression pattern matching
- String values: Case-insensitive substring search
- Numeric values: Exact equality

Searches both initial and modified entity states, as well as nested data properties.

#### Parameters

##### criteria

[`SearchCriteria`](../type-aliases/SearchCriteria.md)

Array of search criteria objects

#### Returns

`Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Array of entity pairs matching all criteria

#### Example

```typescript
// Search for adults with age greater than 18
const adults = await adapter.searchEntities([
  { "modified.data.age": { $gt: 18 } },
  { "modified.type": "individual" }
]);

// Search by name pattern (case-insensitive)
const johns = await adapter.searchEntities([
  { "modified.data.name": { $regex: "john" } }
]);

// Simple substring search
const smithFamilies = await adapter.searchEntities([
  { "modified.data.familyName": "smith" }
]);
```

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`searchEntities`](../interfaces/EntityStorageAdapter.md#searchentities)

***

### saveEntity()

> **saveEntity**(`entity`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:316](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L316)

Saves an entity pair (initial and modified states) to IndexedDB.

Stores both the initial state (for conflict resolution) and modified state
(current version) with the entity's GUID as the primary key.

#### Parameters

##### entity

[`EntityPair`](../interfaces/EntityPair.md)

Entity pair containing initial and modified states

#### Returns

`Promise`\<`void`\>

#### Throws

When IndexedDB is not initialized or save operation fails

#### Example

```typescript
const entityPair: EntityPair = {
  guid: 'person-123',
  initial: originalEntity,
  modified: { ...originalEntity, data: { ...originalEntity.data, age: 31 } }
};

await adapter.saveEntity(entityPair);
```

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`saveEntity`](../interfaces/EntityStorageAdapter.md#saveentity)

***

### getEntity()

> **getEntity**(`guid`): `Promise`\<`null` \| [`EntityPair`](../interfaces/EntityPair.md)\>

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:355](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L355)

Retrieves an entity pair by its GUID.

Uses the optimized GUID index for fast lookups.

#### Parameters

##### guid

`string`

Global unique identifier of the entity

#### Returns

`Promise`\<`null` \| [`EntityPair`](../interfaces/EntityPair.md)\>

Entity pair if found, null otherwise

#### Example

```typescript
const entity = await adapter.getEntity('person-123');
if (entity) {
  console.log('Current state:', entity.modified);
  console.log('Original state:', entity.initial);
} else {
  console.log('Entity not found');
}
```

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`getEntity`](../interfaces/EntityStorageAdapter.md#getentity)

***

### getEntityByExternalId()

> **getEntityByExternalId**(`externalId`): `Promise`\<`null` \| [`EntityPair`](../interfaces/EntityPair.md)\>

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:400](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L400)

Retrieves an entity pair by its external system identifier.

Useful for finding entities that have been synced with external systems
like OpenSPP or other third-party platforms.

#### Parameters

##### externalId

`string`

External system identifier

#### Returns

`Promise`\<`null` \| [`EntityPair`](../interfaces/EntityPair.md)\>

Entity pair if found, null otherwise

#### Example

```typescript
// Find entity by OpenSPP ID
const entity = await adapter.getEntityByExternalId('openspp-456');
if (entity) {
  console.log('Synced entity:', entity.modified.data);
}
```

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`getEntityByExternalId`](../interfaces/EntityStorageAdapter.md#getentitybyexternalid)

***

### getModifiedEntitiesSince()

> **getModifiedEntitiesSince**(`timestamp`): `Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:477](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L477)

Retrieves entities that have been modified since a specific timestamp.

Uses the lastUpdated index for efficient timestamp-based queries.
Essential for incremental synchronization operations.

#### Parameters

##### timestamp

`string`

ISO timestamp to filter from (exclusive)

#### Returns

`Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Array of entity pairs modified after the timestamp

#### Example

```typescript
const lastSync = '2024-01-01T00:00:00.000Z';
const modified = await adapter.getModifiedEntitiesSince(lastSync);

console.log(`${modified.length} entities modified since last sync`);
for (const entity of modified) {
  console.log(`${entity.modified.data.name} updated at ${entity.modified.lastUpdated}`);
}
```

***

### markEntityAsSynced()

> **markEntityAsSynced**(`id`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:525](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L525)

Marks an entity as synced by updating its lastUpdated timestamp.

Used by sync managers to track which entities have been successfully
synchronized with remote systems.

#### Parameters

##### id

`string`

GUID of the entity to mark as synced

#### Returns

`Promise`\<`void`\>

#### Throws

When IndexedDB is not initialized

#### Example

```typescript
// After successful sync
await adapter.markEntityAsSynced('person-123');
```

***

### deleteEntity()

> **deleteEntity**(`id`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:557](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L557)

Deletes an entity and cleans up any related duplicate entries.

Removes the entity from both the main store and any potential duplicate
pairs where this entity appears as either the primary or duplicate entity.

#### Parameters

##### id

`string`

GUID of the entity to delete

#### Returns

`Promise`\<`void`\>

#### Throws

When IndexedDB is not initialized

#### Example

```typescript
await adapter.deleteEntity('person-123');
console.log('Entity and related duplicates removed');
```

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`deleteEntity`](../interfaces/EntityStorageAdapter.md#deleteentity)

***

### savePotentialDuplicates()

> **savePotentialDuplicates**(`duplicates`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:606](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L606)

Saves potential duplicate entity pairs for manual review.

Stores pairs of entity GUIDs that may represent the same real-world entity.
These pairs are typically identified by automated duplicate detection algorithms.

#### Parameters

##### duplicates

`object`[]

Array of entity GUID pairs flagged as potential duplicates

#### Returns

`Promise`\<`void`\>

#### Throws

When IndexedDB is not initialized

#### Example

```typescript
const duplicatePairs = [
  { entityGuid: 'person-123', duplicateGuid: 'person-456' },
  { entityGuid: 'person-789', duplicateGuid: 'person-101' }
];

await adapter.savePotentialDuplicates(duplicatePairs);
console.log('Duplicate pairs saved for review');
```

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`savePotentialDuplicates`](../interfaces/EntityStorageAdapter.md#savepotentialduplicates)

***

### getPotentialDuplicates()

> **getPotentialDuplicates**(): `Promise`\<`object`[]\>

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:646](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L646)

Retrieves all potential duplicate entity pairs awaiting review.

Returns pairs of entity GUIDs that have been flagged by duplicate detection
algorithms and need manual review and resolution.

#### Returns

`Promise`\<`object`[]\>

Array of entity GUID pairs flagged as potential duplicates

#### Throws

When IndexedDB is not initialized

#### Example

```typescript
const duplicates = await adapter.getPotentialDuplicates();

for (const pair of duplicates) {
  const entity1 = await adapter.getEntity(pair.entityGuid);
  const entity2 = await adapter.getEntity(pair.duplicateGuid);
  
  console.log('Potential duplicate detected:');
  console.log('Entity 1:', entity1?.modified.data);
  console.log('Entity 2:', entity2?.modified.data);
}
```

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`getPotentialDuplicates`](../interfaces/EntityStorageAdapter.md#getpotentialduplicates)

***

### resolvePotentialDuplicates()

> **resolvePotentialDuplicates**(`duplicates`): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:686](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L686)

Resolves potential duplicate pairs by removing them from the review queue.

Typically called after manual review when duplicates have been confirmed
as either true duplicates (and merged/deleted) or false positives.

#### Parameters

##### duplicates

`object`[]

Array of duplicate pairs to mark as resolved

#### Returns

`Promise`\<`void`\>

#### Throws

When IndexedDB is not initialized

#### Example

```typescript
// After manual review and resolution
const resolvedPairs = [
  { entityGuid: 'person-123', duplicateGuid: 'person-456' }
];

await adapter.resolvePotentialDuplicates(resolvedPairs);
console.log('Duplicate pairs marked as resolved');
```

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`resolvePotentialDuplicates`](../interfaces/EntityStorageAdapter.md#resolvepotentialduplicates)

***

### clearStore()

> **clearStore**(): `Promise`\<`void`\>

Defined in: [storage/IndexedDbEntityStorageAdapter.ts:721](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/IndexedDbEntityStorageAdapter.ts#L721)

Clears all data from the entity store and potential duplicates store.

⚠️ **WARNING**: This permanently deletes all stored entities and duplicate pairs!
Only use for testing or when intentionally resetting the local database.

#### Returns

`Promise`\<`void`\>

#### Throws

When IndexedDB is not initialized or clear operation fails

#### Example

```typescript
// For testing environments only
if (process.env.NODE_ENV === 'test') {
  await adapter.clearStore();
  console.log('Test data cleared');
}
```

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`clearStore`](../interfaces/EntityStorageAdapter.md#clearstore)
