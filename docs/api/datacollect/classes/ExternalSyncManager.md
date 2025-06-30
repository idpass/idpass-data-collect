[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / ExternalSyncManager

# Class: ExternalSyncManager

Defined in: [components/ExternalSyncManager.ts:103](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/ExternalSyncManager.ts#L103)

Manages synchronization with external third-party systems using pluggable adapters.

The ExternalSyncManager provides a unified interface for syncing DataCollect data
with various external systems like OpenSPP, SCOPE, or custom APIs. It uses the
Strategy pattern with pluggable adapters to handle system-specific integration logic.

Key features:
- **Pluggable Adapters**: Support for multiple external systems via adapter pattern
- **Dynamic Loading**: Adapters are instantiated based on configuration type
- **Credential Management**: Secure handling of authentication credentials
- **Error Handling**: Graceful handling of adapter initialization and sync failures
- **Configuration-Driven**: Flexible configuration per external system

Architecture:
- Uses Strategy pattern for different external system integrations
- Adapters are registered in the adaptersMapping registry
- Each adapter implements the ExternalSyncAdapter interface
- Configuration determines which adapter to instantiate and how to configure it

## Examples

Basic usage with mock adapter:
```typescript
const config: ExternalSyncConfig = {
  type: 'mock-sync-server',
  url: 'http://mock.example.com',
  timeout: 30000
};

const externalSync = new ExternalSyncManager(
  eventStore,
  eventApplierService,
  config
);

await externalSync.initialize();
await externalSync.synchronize();
```

With authentication credentials:
```typescript
const credentials: ExternalSyncCredentials = {
  username: 'sync_user',
  password: 'secure_password'
};

await externalSync.synchronize(credentials);
```

Custom adapter registration:
```typescript
// In adaptersMapping (requires code modification):
const adaptersMapping = {
  "mock-sync-server": MockSyncServerAdapter,
  "openspp": OpenSppSyncAdapter,
  "custom-api": CustomApiSyncAdapter
};

// Then use with config:
const opensppConfig: ExternalSyncConfig = {
  type: 'openspp',
  url: 'http://openspp.example.com',
  database: 'openspp_db'
};
```

## Constructors

### Constructor

> **new ExternalSyncManager**(`eventStore`, `eventApplierService`, `config`): `ExternalSyncManager`

Defined in: [components/ExternalSyncManager.ts:129](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/ExternalSyncManager.ts#L129)

Creates a new ExternalSyncManager instance.

#### Parameters

##### eventStore

[`EventStore`](../interfaces/EventStore.md)

Store for managing events and audit logs

##### eventApplierService

[`EventApplierService`](EventApplierService.md)

Service for applying events to entities

##### config

[`ExternalSyncConfig`](../type-aliases/ExternalSyncConfig.md)

Configuration object specifying the external system type and settings

#### Returns

`ExternalSyncManager`

#### Example

```typescript
const config: ExternalSyncConfig = {
  type: 'openspp',
  url: 'http://openspp.example.com',
  database: 'openspp_production',
  timeout: 60000
};

const manager = new ExternalSyncManager(
  eventStore,
  eventApplierService,
  config
);
```

## Methods

### initialize()

> **initialize**(): `Promise`\<`void`\>

Defined in: [components/ExternalSyncManager.ts:160](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/ExternalSyncManager.ts#L160)

Initializes the external sync manager by instantiating the appropriate adapter.

Looks up the adapter class based on the configuration type and creates an instance
with the provided dependencies. If the adapter type is not found in the registry,
the manager remains uninitialized (adapter will be null).

This method must be called before attempting synchronization.

#### Returns

`Promise`\<`void`\>

#### Throws

When adapter instantiation fails

#### Example

```typescript
const manager = new ExternalSyncManager(eventStore, eventApplierService, config);

await manager.initialize();

// Check if adapter was successfully loaded
if (manager.isInitialized()) {
  await manager.synchronize();
} else {
  console.log('No adapter available for type:', config.type);
}
```

***

### synchronize()

> **synchronize**(`credentials?`): `Promise`\<`void`\>

Defined in: [components/ExternalSyncManager.ts:211](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/ExternalSyncManager.ts#L211)

Performs synchronization with the external system using the configured adapter.

Delegates the actual sync operation to the loaded adapter, which handles the
system-specific integration logic. The sync operation typically involves:
- Pulling data from the external system
- Transforming data to DataCollect format
- Applying changes using the EventApplierService
- Optionally pushing local changes to the external system

#### Parameters

##### credentials?

[`ExternalSyncCredentials`](../interfaces/ExternalSyncCredentials.md)

Optional authentication credentials for the external system

#### Returns

`Promise`\<`void`\>

#### Throws

When adapter is not initialized or sync operation fails

#### Examples

```typescript
// Simple sync without credentials (if adapter doesn't require them)
await manager.synchronize();

// Sync with basic authentication
await manager.synchronize({
  username: 'integration_user',
  password: 'secure_password'
});
```

Error handling:
```typescript
try {
  await manager.synchronize(credentials);
  console.log('External sync completed successfully');
} catch (error) {
  if (error.message === 'Adapter not initialized') {
    console.log('Please call initialize() first');
  } else {
    console.error('External sync failed:', error.message);
  }
}
```

***

### isInitialized()

> **isInitialized**(): `boolean`

Defined in: [components/ExternalSyncManager.ts:235](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/components/ExternalSyncManager.ts#L235)

Checks if the external sync manager has been properly initialized with an adapter.

#### Returns

`boolean`

True if an adapter is loaded and ready for synchronization

#### Example

```typescript
const manager = new ExternalSyncManager(eventStore, eventApplierService, config);
await manager.initialize();

if (manager.isInitialized()) {
  console.log('Ready for external sync');
} else {
  console.log('No adapter available for:', config.type);
}
```
