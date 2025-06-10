[**ID PASS Data Collect API Documentation v0.0.1**](../README.md)

***

[ID PASS Data Collect API Documentation](../globals.md) / PostgresEntityStorageAdapter

# Class: PostgresEntityStorageAdapter

Defined in: [storage/PostgresEntityStorageAdapter.ts:141](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L141)

PostgreSQL implementation of the EntityStorageAdapter for server-side entity persistence.

This adapter provides scalable, ACID-compliant entity storage using PostgreSQL with
advanced features like JSONB support, full-text search, and multi-tenant isolation.
It's designed for production server deployments requiring robust data persistence.

Key features:
- **ACID Transactions**: Full PostgreSQL transaction support for data consistency
- **JSONB Storage**: Efficient JSON storage with native PostgreSQL indexing and querying
- **Multi-Tenant Support**: Complete tenant isolation using tenant_id partitioning
- **Advanced Search**: Rich query capabilities with JSONB operators and regex support
- **Connection Pooling**: Efficient connection management for high-concurrency scenarios
- **Scalable Architecture**: Designed for production workloads with proper indexing
- **Duplicate Detection**: Optimized duplicate tracking with compound primary keys

Architecture:
- Uses PostgreSQL connection pooling for performance and scalability
- Stores entities as JSONB documents for flexible schema evolution
- Implements tenant isolation at the database level
- Provides optimized queries with proper indexing strategies
- Supports advanced search operations using PostgreSQL's JSONB capabilities

Database Schema:
```
-- Main entities table
CREATE TABLE entities (
  id TEXT,
  guid TEXT,
  initial JSONB,           -- Original entity state
  modified JSONB,          -- Current entity state
  sync_level TEXT,         -- Synchronization status
  last_updated TIMESTAMP,  -- Last modification timestamp
  tenant_id TEXT,          -- Tenant isolation
  PRIMARY KEY (id, tenant_id),
  UNIQUE (guid, tenant_id)
);

-- Potential duplicates tracking
CREATE TABLE potential_duplicates (
  entity_guid TEXT,
  duplicate_guid TEXT,
  tenant_id TEXT,
  PRIMARY KEY (entity_guid, duplicate_guid, tenant_id)
);
```

## Examples

Basic server setup:
```typescript
const adapter = new PostgresEntityStorageAdapter(
  'postgresql://user:pass@localhost:5432/datacollect',
  'tenant-123'
);

await adapter.initialize();

// Save an entity
const entityPair: EntityPair = {
  guid: 'person-456',
  initial: originalEntity,
  modified: updatedEntity
};
await adapter.saveEntity(entityPair);
```

Advanced search with JSONB:
```typescript
// Search for adults with complex criteria
const adults = await adapter.searchEntities([
  { "data.age": { $gte: 18 } },           // Age >= 18
  { "data.status": "active" },             // Exact string match
  { "data.name": { $regex: "john" } },     // Case-insensitive regex
  { "data.verified": true }                // Boolean match
]);

// Search with numeric ranges
const middleAged = await adapter.searchEntities([
  { "data.age": { $gte: 30 } },
  { "data.age": { $lte: 65 } }
]);
```

Multi-tenant deployment:
```typescript
// Tenant-specific adapters
const orgAAdapter = new PostgresEntityStorageAdapter(connectionString, 'org-a');
const orgBAdapter = new PostgresEntityStorageAdapter(connectionString, 'org-b');

// Each adapter operates on isolated data
await orgAAdapter.initialize();
await orgBAdapter.initialize();

// Data is completely isolated between tenants
await orgAAdapter.saveEntity(entityForOrgA);
await orgBAdapter.saveEntity(entityForOrgB);
```

Production connection configuration:
```typescript
const adapter = new PostgresEntityStorageAdapter(
  'postgresql://datacollect_user:secure_pass@db.example.com:5432/datacollect_prod?sslmode=require',
  process.env.TENANT_ID
);

// Initialize with proper error handling
try {
  await adapter.initialize();
  console.log('Database initialized successfully');
} catch (error) {
  console.error('Database initialization failed:', error);
  process.exit(1);
}
```

## Implements

- [`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md)

## Constructors

### Constructor

> **new PostgresEntityStorageAdapter**(`connectionString`, `tenantId?`): `PostgresEntityStorageAdapter`

Defined in: [storage/PostgresEntityStorageAdapter.ts:165](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L165)

Creates a new PostgresEntityStorageAdapter instance.

#### Parameters

##### connectionString

`string`

PostgreSQL connection string with credentials and database info

##### tenantId?

`string`

Optional tenant identifier for multi-tenant isolation (defaults to "default")

#### Returns

`PostgresEntityStorageAdapter`

#### Example

```typescript
// Local development
const adapter = new PostgresEntityStorageAdapter(
  'postgresql://user:pass@localhost:5432/datacollect_dev'
);

// Production with tenant isolation
const prodAdapter = new PostgresEntityStorageAdapter(
  'postgresql://datacollect_user:secure_pass@db.prod.com:5432/datacollect?sslmode=require',
  'tenant-org-123'
);
```

## Methods

### closeConnection()

> **closeConnection**(): `Promise`\<`void`\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:188](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L188)

Closes all connections in the PostgreSQL connection pool.

Should be called during application shutdown to ensure graceful
cleanup of database connections.

#### Returns

`Promise`\<`void`\>

#### Example

```typescript
// Application shutdown handler
process.on('SIGTERM', async () => {
  await adapter.closeConnection();
  console.log('Database connections closed');
  process.exit(0);
});
```

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`closeConnection`](../interfaces/EntityStorageAdapter.md#closeconnection)

***

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:218](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L218)

Initializes the PostgreSQL database with required tables and schemas.

Creates:
- `entities` table with JSONB storage for flexible entity data
- `potential_duplicates` table for duplicate detection
- Proper indexing and constraints for multi-tenant isolation
- Primary keys and unique constraints for data integrity

This method is idempotent and safe to call multiple times.

#### Returns

`Promise`\<`void`\>

#### Throws

When database connection fails or table creation fails

#### Example

```typescript
const adapter = new PostgresEntityStorageAdapter(connectionString, tenantId);

try {
  await adapter.initialize();
  console.log('Database schema initialized');
} catch (error) {
  console.error('Failed to initialize database:', error);
  throw error;
}
```

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`initialize`](../interfaces/EntityStorageAdapter.md#initialize)

***

### getAllEntities()

> **getAllEntities**(): `Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:247](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L247)

Get all entities from storage

#### Returns

`Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`getAllEntities`](../interfaces/EntityStorageAdapter.md#getallentities)

***

### searchEntities()

> **searchEntities**(`criteria`): `Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:298](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L298)

Searches entities using advanced PostgreSQL JSONB query capabilities.

Supports rich query operators optimized for PostgreSQL:
- `$gt`, `$gte`: Greater than, greater than or equal (numeric)
- `$lt`, `$lte`: Less than, less than or equal (numeric)
- `$eq`: Exact equality (numeric)
- `$regex`: Case-insensitive regex matching using PostgreSQL ~* operator
- String values: Case-insensitive exact matching
- Boolean values: Direct boolean comparison
- Numeric values: Exact numeric comparison

All searches examine both initial and modified entity states for comprehensive results.

#### Parameters

##### criteria

[`SearchCriteria`](../type-aliases/SearchCriteria.md)

Array of search criteria objects

#### Returns

`Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Array of entity pairs matching all criteria

#### Example

```typescript
// Complex multi-criteria search
const results = await adapter.searchEntities([
  { "data.age": { $gte: 21 } },          // Adults over 21
  { "data.age": { $lt: 65 } },           // Under retirement age
  { "data.status": "active" },            // Active status
  { "data.name": { $regex: "smith" } },    // Name contains "smith"
  { "data.verified": true }               // Verified accounts
]);

// Geographic search
const localUsers = await adapter.searchEntities([
  { "data.address.city": "Boston" },
  { "data.address.state": "MA" }
]);
```

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`searchEntities`](../interfaces/EntityStorageAdapter.md#searchentities)

***

### saveEntity()

> **saveEntity**(`entity`): `Promise`\<`void`\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:346](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L346)

Save an entity pair to storage

#### Parameters

##### entity

[`EntityPair`](../interfaces/EntityPair.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`saveEntity`](../interfaces/EntityStorageAdapter.md#saveentity)

***

### getEntity()

> **getEntity**(`id`): `Promise`\<`null` \| [`EntityPair`](../interfaces/EntityPair.md)\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:360](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L360)

Get entity by internal ID

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`null` \| [`EntityPair`](../interfaces/EntityPair.md)\>

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`getEntity`](../interfaces/EntityStorageAdapter.md#getentity)

***

### getAllEntityData()

> **getAllEntityData**(): `Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:381](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L381)

#### Returns

`Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

***

### getModifiedEntitiesSince()

> **getModifiedEntitiesSince**(`timestamp`): `Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:385](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L385)

#### Parameters

##### timestamp

`string`

#### Returns

`Promise`\<[`EntityPair`](../interfaces/EntityPair.md)[]\>

***

### markEntityAsSynced()

> **markEntityAsSynced**(`id`): `Promise`\<`void`\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:402](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L402)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>

***

### deleteEntity()

> **deleteEntity**(`id`): `Promise`\<`void`\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:416](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L416)

Delete an entity by ID

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`deleteEntity`](../interfaces/EntityStorageAdapter.md#deleteentity)

***

### getEntityByExternalId()

> **getEntityByExternalId**(`externalId`): `Promise`\<`null` \| [`EntityPair`](../interfaces/EntityPair.md)\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:429](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L429)

Get entity by external system ID

#### Parameters

##### externalId

`string`

#### Returns

`Promise`\<`null` \| [`EntityPair`](../interfaces/EntityPair.md)\>

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`getEntityByExternalId`](../interfaces/EntityStorageAdapter.md#getentitybyexternalid)

***

### setExternalId()

> **setExternalId**(`guid`, `externalId`): `Promise`\<`void`\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:450](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L450)

#### Parameters

##### guid

`string`

##### externalId

`string`

#### Returns

`Promise`\<`void`\>

***

### getPotentialDuplicates()

> **getPotentialDuplicates**(): `Promise`\<`object`[]\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:466](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L466)

Get all potential duplicate pairs

#### Returns

`Promise`\<`object`[]\>

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`getPotentialDuplicates`](../interfaces/EntityStorageAdapter.md#getpotentialduplicates)

***

### savePotentialDuplicates()

> **savePotentialDuplicates**(`duplicates`): `Promise`\<`void`\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:482](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L482)

Save potential duplicate entity pairs for review

#### Parameters

##### duplicates

`object`[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`savePotentialDuplicates`](../interfaces/EntityStorageAdapter.md#savepotentialduplicates)

***

### resolvePotentialDuplicates()

> **resolvePotentialDuplicates**(`duplicates`): `Promise`\<`void`\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:501](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L501)

Resolve potential duplicate pairs (mark as reviewed)

#### Parameters

##### duplicates

`object`[]

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`resolvePotentialDuplicates`](../interfaces/EntityStorageAdapter.md#resolvepotentialduplicates)

***

### clearStore()

> **clearStore**(): `Promise`\<`void`\>

Defined in: [storage/PostgresEntityStorageAdapter.ts:513](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/storage/PostgresEntityStorageAdapter.ts#L513)

Clear all data from storage (for testing)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`EntityStorageAdapter`](../interfaces/EntityStorageAdapter.md).[`clearStore`](../interfaces/EntityStorageAdapter.md#clearstore)
