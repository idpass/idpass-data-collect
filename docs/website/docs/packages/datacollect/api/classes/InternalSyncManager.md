[idpass-data-collect](../index.md) / InternalSyncManager

# Class: InternalSyncManager

Defined in: [components/InternalSyncManager.ts:79](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/InternalSyncManager.ts#L79)

Manages bidirectional synchronization between local DataCollect instances and the remote sync server.

The InternalSyncManager implements a two-phase sync process:
1. **Push Phase**: Sends local unsynced events to the remote server
2. **Pull Phase**: Retrieves and applies remote events to local storage

Key features:
- Pagination support (10 events per page by default)
- JWT-based authentication with automatic token refresh
- Conflict detection and resolution
- Audit log synchronization
- Progress tracking and error handling

## Examples

Basic usage:
```typescript
const syncManager = new InternalSyncManager(
  eventStore,
  entityStore,
  eventApplierService,
  'https://sync.example.com',
  'jwt-token',
  'app-config-id'
);

// Authenticate
await syncManager.login('user@example.com', 'password');

// Check for pending changes
if (await syncManager.hasUnsyncedEvents()) {
  console.log(`${await syncManager.getUnsyncedEventsCount()} events pending`);

  // Perform full sync
  await syncManager.sync();
}
```

Manual sync phases:
```typescript
// Push local changes first
await syncManager.pushToRemote();

// Then pull remote changes
await syncManager.pullFromRemote();
```

## Constructors

### Constructor

> **new InternalSyncManager**(`eventStore`, `entityStore`, `eventApplierService`, `syncServerUrl`, `authStorage`, `configId`): `InternalSyncManager`

Defined in: [components/InternalSyncManager.ts:96](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/InternalSyncManager.ts#L96)

Creates a new InternalSyncManager instance.

#### Parameters

##### eventStore

[`EventStore`](../interfaces/EventStore.md)

Store for managing events and form submissions

##### entityStore

[`EntityStore`](../interfaces/EntityStore.md)

Store for managing current entity state

##### eventApplierService

[`EventApplierService`](EventApplierService.md)

Service for applying events to entities

##### syncServerUrl

`string`

Base URL of the remote sync server

##### authStorage

[`AuthStorageAdapter`](../interfaces/AuthStorageAdapter.md)

##### configId

`string` = `"default"`

Configuration ID for multi-tenant setups (defaults to "default")

#### Returns

`InternalSyncManager`

## Properties

### isSyncing

> **isSyncing**: `boolean` = `false`

Defined in: [components/InternalSyncManager.ts:81](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/InternalSyncManager.ts#L81)

Flag indicating if a sync operation is currently in progress

## Methods

### getUnsyncedEventsCount()

> **getUnsyncedEventsCount**(): `Promise`\<`number`\>

Defined in: [components/InternalSyncManager.ts:137](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/InternalSyncManager.ts#L137)

Gets the count of events waiting to be synchronized with the server.

#### Returns

`Promise`\<`number`\>

Number of unsynced events

#### Example

```typescript
const count = await syncManager.getUnsyncedEventsCount();
console.log(`${count} events pending sync`);

if (count > 50) {
  console.log('Large number of changes - consider syncing soon');
}
```

***

### hasUnsyncedEvents()

> **hasUnsyncedEvents**(): `Promise`\<`boolean`\>

Defined in: [components/InternalSyncManager.ts:158](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/InternalSyncManager.ts#L158)

Checks if there are any events waiting to be synchronized.

#### Returns

`Promise`\<`boolean`\>

True if there are unsynced events, false otherwise

#### Example

```typescript
if (await syncManager.hasUnsyncedEvents()) {
  console.log('Local changes detected - sync recommended');
  await syncManager.sync();
} else {
  console.log('No local changes to sync');
}
```

***

### checkIfDuplicatesExist()

> **checkIfDuplicatesExist**(): `Promise`\<`boolean`\>

Defined in: [components/InternalSyncManager.ts:395](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/InternalSyncManager.ts#L395)

Checks if there are any unresolved potential duplicates.

Sync operations are blocked when duplicates exist to prevent
data inconsistencies. Users must resolve duplicates before syncing.

#### Returns

`Promise`\<`boolean`\>

True if potential duplicates exist, false otherwise

#### Example

```typescript
if (await syncManager.checkIfDuplicatesExist()) {
  console.log('Please resolve duplicate entities before syncing');
  const duplicates = await entityStore.getPotentialDuplicates();
  // Show duplicate resolution UI
}
```

***

### sync()

> **sync**(): `Promise`\<`void`\>

Defined in: [components/InternalSyncManager.ts:439](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/InternalSyncManager.ts#L439)

Performs a complete bidirectional synchronization with the remote server.

This is the main sync method that orchestrates the entire sync process:
1. **Duplicate Check**: Ensures no unresolved duplicates exist
2. **Upload Phase**: Pushes local events to server (chunked, with retry)
3. **Download Phase**: Pulls and applies remote events (paginated)

The sync operation is atomic - if any phase fails, the entire sync is rolled back.
Only one sync operation can run at a time (protected by `isSyncing` flag).

#### Returns

`Promise`\<`void`\>

#### Throws

When duplicates exist, authentication fails, or network errors occur

#### Examples

```typescript
try {
  console.log('Starting full synchronization...');
  await syncManager.sync();
  console.log('Sync completed successfully');
} catch (error) {
  if (error.message.includes('Duplicates exist')) {
    console.log('Please resolve duplicates first');
  } else {
    console.error('Sync failed:', error.message);
  }
}
```

Checking sync status:
```typescript
if (syncManager.isSyncing) {
  console.log('Sync already in progress...');
  return;
}

await syncManager.sync();
```
