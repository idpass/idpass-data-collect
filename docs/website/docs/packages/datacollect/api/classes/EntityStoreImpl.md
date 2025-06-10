[idpass-data-collect](../index.md) / EntityStoreImpl

# Class: EntityStoreImpl

Defined in: [components/EntityStore.ts:92](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L92)

Entity store implementation for managing current entity state with change tracking.

The EntityStoreImpl provides the current state view in the event sourcing architecture.
It maintains both the initial state (from last sync/load) and the current modified state
for each entity, enabling conflict resolution and change tracking.

Key responsibilities:
- **State Management**: Maintains current entity state derived from events
- **Change Tracking**: Tracks changes between initial and current state
- **Duplicate Detection**: Manages potential duplicate entity pairs
- **Search Operations**: Provides flexible entity querying capabilities
- **Sync Coordination**: Marks entities as synced and manages sync states
- **External ID Mapping**: Maps between internal and external system IDs

Architecture:
- Uses pluggable storage adapters for different persistence backends
- Implements CQRS query side - provides read operations for entities
- Maintains entity pairs (initial + modified) for conflict resolution
- Supports flexible search criteria with MongoDB-style queries

## Examples

Basic usage:
```typescript
const entityStore = new EntityStoreImpl(storageAdapter);
await entityStore.initialize();

// Save entity state
await entityStore.saveEntity(initialEntity, modifiedEntity);

// Retrieve entity
const entityPair = await entityStore.getEntity('entity-123');
if (entityPair) {
  console.log('Initial state:', entityPair.initial);
  console.log('Current state:', entityPair.modified);
  console.log('Has changes:', entityPair.initial.version !== entityPair.modified.version);
}
```

Search operations:
```typescript
// Find all adults
const adults = await entityStore.searchEntities([
  { "data.age": { $gte: 18 } },
  { "type": "individual" }
]);

// Find groups by name pattern
const families = await entityStore.searchEntities([
  { "data.name": { $regex: /family/i } },
  { "type": "group" }
]);
```

Duplicate management:
```typescript
// Save potential duplicates found during entity creation
await entityStore.savePotentialDuplicates([
  { entityGuid: 'person-123', duplicateGuid: 'person-456' }
]);

// Get all potential duplicates for review
const duplicates = await entityStore.getPotentialDuplicates();

// Resolve duplicates after manual review
await entityStore.resolvePotentialDuplicates(resolvedDuplicates);
```

## Implements

- [`EntityStore`](../interfaces/EntityStore.md)

## Constructors

### Constructor

> **new EntityStoreImpl**(`entityStorageAdapter`): `EntityStoreImpl`

Defined in: [components/EntityStore.ts:111](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L111)

Creates a new EntityStoreImpl instance.

#### Parameters

##### entityStorageAdapter

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md)

Storage adapter for persistence (IndexedDB, PostgreSQL, etc.)

#### Returns

`EntityStoreImpl`

#### Example

```typescript
// With IndexedDB for browser
const indexedDbAdapter = new IndexedDbEntityStorageAdapter('tenant-123');
const browserEntityStore = new EntityStoreImpl(indexedDbAdapter);

// With PostgreSQL for server
const postgresAdapter = new PostgresEntityStorageAdapter(connectionString, 'tenant-123');
const serverEntityStore = new EntityStoreImpl(postgresAdapter);
```

## Methods

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [components/EntityStore.ts:120](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L120)

Closes database connections and cleans up resources.

Should be called when the EntityStore is no longer needed to prevent memory leaks.

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EntityStore`](../interfaces/EntityStore.md).[`closeConnection`](../interfaces/EntityStore.md#closeconnection)

***

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [components/EntityStore.ts:131](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L131)

Initializes the entity store and prepares it for operations.

This method must be called before any other operations.

#### Returns

`Promise`\<`void`\>

#### Throws

When storage initialization fails

#### Implementation of

[`EntityStore`](../interfaces/EntityStore.md).[`initialize`](../interfaces/EntityStore.md#initialize)

***

### deleteEntity()

> **deleteEntity**(`id`): `Promise`\<`void`\>

Defined in: [components/EntityStore.ts:143](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L143)

Deletes an entity from the store.

⚠️ **WARNING**: This permanently removes the entity and cannot be undone!

#### Parameters

##### id

`string`

Internal database ID of the entity to delete

#### Returns

`Promise`\<`void`\>

#### Throws

When deletion fails

#### Implementation of

[`EntityStore`](../interfaces/EntityStore.md).[`deleteEntity`](../interfaces/EntityStore.md#deleteentity)

***

### searchEntities()

> **searchEntities**(`criteria`): `Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Defined in: [components/EntityStore.ts:170](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L170)

Searches entities using flexible criteria.

Supports MongoDB-style query syntax for complex searches.

#### Parameters

##### criteria

[`SearchCriteria`](../type-aliases/SearchCriteria.md)

Search criteria array with query conditions

#### Returns

`Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Array of entity pairs matching the criteria

#### Example

```typescript
// Search for adults
const adults = await entityStore.searchEntities([
  { "data.age": { $gte: 18 } },
  { "type": "individual" }
]);

// Search for groups containing "family"
const families = await entityStore.searchEntities([
  { "data.name": { $regex: /family/i } },
  { "type": "group" }
]);
```

#### Implementation of

[`EntityStore`](../interfaces/EntityStore.md).[`searchEntities`](../interfaces/EntityStore.md#searchentities)

***

### getEntity()

> **getEntity**(`id`): `Promise`\<`null` \| [`EntityPair`](../interfaces/EntityPair.md)\>

Defined in: [components/EntityStore.ts:196](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L196)

Retrieves a specific entity by its internal database ID.

#### Parameters

##### id

`string`

Internal database ID of the entity

#### Returns

`Promise`\<`null` \| [`EntityPair`](../interfaces/EntityPair.md)\>

Entity pair with initial and current state, or null if not found

#### Example

```typescript
const entityPair = await entityStore.getEntity('entity-123');
if (entityPair) {
  console.log('Found entity:', entityPair.modified.data.name);
  
  // Check if entity has local changes
  const hasChanges = entityPair.initial.version !== entityPair.modified.version;
  if (hasChanges) {
    console.log('Entity has unsaved changes');
  }
} else {
  console.log('Entity not found');
}
```

#### Implementation of

[`EntityStore`](../interfaces/EntityStore.md).[`getEntity`](../interfaces/EntityStore.md#getentity)

***

### saveEntity()

> **saveEntity**(`initial`, `modified`): `Promise`\<`void`\>

Defined in: [components/EntityStore.ts:230](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L230)

Saves an entity with both initial and current state for change tracking.

The initial state represents the entity as it was when last synced/loaded,
while the modified state represents the current state after applying events.

#### Parameters

##### initial

[`EntityDoc`](../interfaces/EntityDoc.md)

Initial state of the entity (from last sync)

##### modified

[`EntityDoc`](../interfaces/EntityDoc.md)

Current modified state of the entity

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
// Save a new entity
const newEntity = {
  id: 'person-123',
  guid: 'person-123',
  type: 'individual',
  data: { name: 'John Doe', age: 30 },
  version: 1,
  lastUpdated: new Date().toISOString(),
  syncLevel: SyncLevel.LOCAL
};

// Initially, both states are the same
await entityStore.saveEntity(newEntity, newEntity);

// Later, after modifications
const modifiedEntity = { ...newEntity, data: { ...newEntity.data, age: 31 }, version: 2 };
await entityStore.saveEntity(newEntity, modifiedEntity); // Keep original initial state
```

#### Implementation of

[`EntityStore`](../interfaces/EntityStore.md).[`saveEntity`](../interfaces/EntityStore.md#saveentity)

***

### getAllEntities()

> **getAllEntities**(): `Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Defined in: [components/EntityStore.ts:251](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L251)

Retrieves all entities from the store.

#### Returns

`Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Array of all entity pairs with initial and current state

#### Example

```typescript
const allEntities = await entityStore.getAllEntities();

// Find entities with local changes
const modifiedEntities = allEntities.filter(pair => 
  pair.initial.version !== pair.modified.version
);

console.log(`${modifiedEntities.length} entities have local changes`);
```

#### Implementation of

[`EntityStore`](../interfaces/EntityStore.md).[`getAllEntities`](../interfaces/EntityStore.md#getallentities)

***

### getModifiedEntitiesSince()

> **getModifiedEntitiesSince**(`timestamp`): `Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Defined in: [components/EntityStore.ts:274](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L274)

Retrieves entities modified since a specific timestamp.

Useful for incremental sync operations to identify entities that need synchronization.

#### Parameters

##### timestamp

`string`

ISO timestamp to filter entities from

#### Returns

`Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Array of entity pairs modified after the specified timestamp

#### Example

```typescript
const lastSync = '2024-01-01T00:00:00Z';
const modifiedEntities = await entityStore.getModifiedEntitiesSince(lastSync);

console.log(`${modifiedEntities.length} entities modified since last sync`);
modifiedEntities.forEach(pair => {
  console.log(`${pair.modified.data.name} was updated at ${pair.modified.lastUpdated}`);
});
```

#### Implementation of

[`EntityStore`](../interfaces/EntityStore.md).[`getModifiedEntitiesSince`](../interfaces/EntityStore.md#getmodifiedentitiessince)

***

### markEntityAsSynced()

> **markEntityAsSynced**(`id`): `Promise`\<`void`\>

Defined in: [components/EntityStore.ts:298](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L298)

Marks an entity as synced by updating its initial state to match current state.

This method is typically called after successfully syncing an entity with the server,
to indicate that the current state is now the baseline for future change detection.

#### Parameters

##### id

`string`

Internal database ID of the entity to mark as synced

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
// After successfully syncing entity to server
await syncEntityToServer(entityId);
await entityStore.markEntityAsSynced(entityId);

// Now the entity is considered "clean" with no local changes
const entityPair = await entityStore.getEntity(entityId);
console.log('Has changes:', entityPair.initial.version !== entityPair.modified.version); // false
```

#### Implementation of

[`EntityStore`](../interfaces/EntityStore.md).[`markEntityAsSynced`](../interfaces/EntityStore.md#markentityassynced)

***

### getEntityByExternalId()

> **getEntityByExternalId**(`externalId`): `Promise`\<`null` \| [`EntityPair`](../interfaces/EntityPair.md)\>

Defined in: [components/EntityStore.ts:325](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L325)

Retrieves an entity by its external system ID.

Used for mapping between internal entities and external system records
during synchronization operations.

#### Parameters

##### externalId

`string`

External system identifier for the entity

#### Returns

`Promise`\<`null` \| [`EntityPair`](../interfaces/EntityPair.md)\>

Entity pair if found, null otherwise

#### Example

```typescript
// Find entity by OpenSPP ID
const entityPair = await entityStore.getEntityByExternalId('openspp-123');
if (entityPair) {
  console.log('Found entity for external ID:', entityPair.modified.data.name);
  // Update with new external data...
}
```

#### Implementation of

[`EntityStore`](../interfaces/EntityStore.md).[`getEntityByExternalId`](../interfaces/EntityStore.md#getentitybyexternalid)

***

### savePotentialDuplicates()

> **savePotentialDuplicates**(`duplicates`): `Promise`\<`void`\>

Defined in: [components/EntityStore.ts:349](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L349)

Saves potential duplicate entity pairs for manual review.

The system automatically detects potential duplicates during entity creation
based on similarity algorithms. These pairs require manual review and resolution.

#### Parameters

##### duplicates

`object`[]

Array of entity GUID pairs that are potential duplicates

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
// System detected potential duplicates during entity creation
const duplicates = [
  { entityGuid: 'person-123', duplicateGuid: 'person-456' },
  { entityGuid: 'person-789', duplicateGuid: 'person-101' }
];

await entityStore.savePotentialDuplicates(duplicates);
console.log('Potential duplicates saved for review');
```

#### Implementation of

[`EntityStore`](../interfaces/EntityStore.md).[`savePotentialDuplicates`](../interfaces/EntityStore.md#savepotentialduplicates)

***

### getPotentialDuplicates()

> **getPotentialDuplicates**(): `Promise`\<`object`[]\>

Defined in: [components/EntityStore.ts:374](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L374)

Retrieves all potential duplicate entity pairs awaiting review.

#### Returns

`Promise`\<`object`[]\>

Array of entity GUID pairs that are potential duplicates

#### Example

```typescript
const duplicates = await entityStore.getPotentialDuplicates();

for (const pair of duplicates) {
  const entity1 = await entityStore.getEntity(pair.entityGuid);
  const entity2 = await entityStore.getEntity(pair.duplicateGuid);
  
  console.log('Potential duplicate pair:');
  console.log('Entity 1:', entity1?.modified.data);
  console.log('Entity 2:', entity2?.modified.data);
  
  // Present to user for manual review...
}
```

#### Implementation of

[`EntityStore`](../interfaces/EntityStore.md).[`getPotentialDuplicates`](../interfaces/EntityStore.md#getpotentialduplicates)

***

### resolvePotentialDuplicates()

> **resolvePotentialDuplicates**(`duplicates`): `Promise`\<`void`\>

Defined in: [components/EntityStore.ts:397](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L397)

Resolves potential duplicate pairs after manual review.

Removes the specified duplicate pairs from the pending list,
indicating they have been reviewed and resolved by a user.

#### Parameters

##### duplicates

`object`[]

Array of duplicate pairs that have been resolved

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
// After user manually reviews and resolves duplicates
const resolvedDuplicates = [
  { entityGuid: 'person-123', duplicateGuid: 'person-456' } // User confirmed these are different people
];

await entityStore.resolvePotentialDuplicates(resolvedDuplicates);
console.log('Duplicate pairs resolved and removed from pending list');
```

#### Implementation of

[`EntityStore`](../interfaces/EntityStore.md).[`resolvePotentialDuplicates`](../interfaces/EntityStore.md#resolvepotentialduplicates)

***

### clearStore()

> **clearStore**(): `Promise`\<`void`\>

Defined in: [components/EntityStore.ts:416](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/EntityStore.ts#L416)

Clears all entities from the store.

⚠️ **WARNING**: This permanently deletes all entity data and cannot be undone!
Only use for testing or when intentionally resetting the system.

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
// For testing only
if (process.env.NODE_ENV === 'test') {
  await entityStore.clearStore();
  console.log('Test entity data cleared');
}
```

#### Implementation of

[`EntityStore`](../interfaces/EntityStore.md).[`clearStore`](../interfaces/EntityStore.md#clearstore)
