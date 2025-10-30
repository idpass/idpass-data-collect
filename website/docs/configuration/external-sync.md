---
id: external-sync
title: External Sync Config
sidebar_position: 3
---

# [External Sync Config](../../glossary#external-sync)

## Overview

The [External Sync system](../../glossary#external-sync) in DataCollect provides a unified interface for synchronizing data with external third-party systems. It implements the Strategy pattern to support multiple external system integrations through pluggable adapters.

The system aims to:

:::info
This configuration is typically used by sync server instances to synchronize data with external systems. The sync server reads this configuration to understand the data structure, authentication requirements, and sync endpoints needed to properly exchange data with external systems like OpenSPP, OpenFn, or other third-party platforms.
:::

## Sample Configuration

Here's a complete example of an external sync configuration with detailed field explanations:

```json
{
  "externalSync": {
    "type": "openfn-adapter",
    "url": "https://api.openfn.org/workflow/trigger/abc123",
    "extraFields": [
      {
        "name": "apiKey",
        "value": "sk_prod_1234567890abcdef"
      },
      {
        "name": "workflowId",
        "value": "wf_1234567890"
      },
      {
        "name": "batchSize",
        "value": "50"
      },
      {
        "name": "timeout",
        "value": "30000"
      }
    ]
  }
}
```

### Field Explanations

#### `type` (Required)
- **Purpose**: Specifies which adapter to use for synchronization
- **Values**: 
  - `"mock-sync-server"` - For testing and development
  - `"openfn-adapter"` - For OpenFn workflow integration
  - Custom adapter types as defined in your system
- **Example**: `"openfn-adapter"`

#### `url` (Required)
- **Purpose**: The endpoint URL of the external system for data synchronization
- **Format**: Full URL including protocol, domain, and path
- **Examples**:
  - `"https://api.openfn.org/workflow/trigger/abc123"`
  - `"http://localhost:3000/mock-sync"`
  - `"https://your-external-system.com/api/sync"`

#### `extraFields` (Required Array)
- **Purpose**: Additional configuration parameters specific to the adapter type
- **Structure**: Array of objects with `name` and `value` properties
- **Common Fields**:

  **For OpenFn Adapter:**
  - `apiKey`: Your OpenFn API key for authentication
  - `workflowId`: The specific workflow ID to trigger
  - `batchSize`: Number of records to process in each batch (default: 100)
  - `timeout`: Request timeout in milliseconds (default: 30000)

  **For Mock Sync Server:**
  - `batchSize`: Number of events to process per batch
  - `retryAttempts`: Number of retry attempts for failed requests
  - `delayBetweenBatches`: Delay in milliseconds between batch processing

  **For Custom Adapters:**
  - Any adapter-specific configuration parameters
  - Database connection strings
  - Custom headers or authentication tokens
  - Sync frequency settings

### Configuration Examples by Adapter Type

#### Mock Sync Server Configuration
```json
{
  "type": "mock-sync-server",
  "url": "http://localhost:3000/mock-sync",
  "extraFields": [
    { "name": "batchSize", "value": "25" },
    { "name": "retryAttempts", "value": "3" }
  ]
}
```

#### OpenFn Adapter Configuration
```json
{
  "type": "openfn-adapter",
  "auth": "api-key",
  "url": "https://api.openfn.org/workflow/trigger/def456",
  "extraFields": [
    { "name": "apiKey", "value": "sk_prod_abcdef123456" },
    { "name": "workflowId", "value": "wf_abcdef123456" },
    { "name": "batchSize", "value": "50" },
    { "name": "timeout", "value": "60000" }
  ]
}
```

#### Custom External System Configuration
```json
{
  "type": "custom-adapter",
  "auth": "basic",
  "url": "https://your-system.com/api/sync",
  "extraFields": [
    { "name": "username", "value": "sync_user" },
    { "name": "password", "value": "secure_password" },
    { "name": "database", "value": "production_db" },
    { "name": "syncInterval", "value": "300000" }
  ]
}
```

## Architecture

### Design Pattern
The External Sync system uses the **Strategy pattern** to handle different external system integrations:

- **Context**: `ExternalSyncManager` acts as the context that manages the synchronization strategy
- **Strategy**: Each adapter (e.g., `MockSyncServerAdapter`, `OpenFnSyncAdapter`) implements the `ExternalSyncAdapter` interface
- **Registry**: The `adaptersMapping` object serves as a registry of available strategies

### Key Components

```typescript
const adaptersMapping = {
  "mock-sync-server": MockSyncServerAdapter,
  "openfn-adapter": OpenFnSyncAdapter,
};
```

## Configuration

### ExternalSyncConfig Interface

The configuration is defined by the `ExternalSyncConfig` type:

```typescript
type ExternalSyncConfig = {
  type: string;           // Adapter type identifier
  auth?: string;          // Authentication method
  url: string;           // External system URL
  extraFields: { name: string; value: string }[]; // Additional configuration
};
```

### Configuration in Admin UI

The Admin interface provides a user-friendly way to configure external sync settings.

## Available Adapters

### 1. Mock Sync Server Adapter

**Type**: `mock-sync-server`

A testing adapter that simulates external system synchronization:

- **Push**: Sends events to a mock server endpoint
- **Pull**: Retrieves data from the mock server
- **Batch Processing**: Processes events in configurable batches (default: 100)
- **Timestamp Tracking**: Maintains sync timestamps for incremental sync

**Configuration**:
```json
{
  "type": "mock-sync-server",
  "url": "http://localhost:3000/mock-sync",
  "extraFields": []
}
```

### 2. OpenFn Adapter

**Type**: `openfn-adapter`

Integration with OpenFn workflow automation platform:

- **Push**: Sends entities to OpenFn workflows via API
- **Authentication**: Uses API key authentication
- **Pull**: Not yet implemented (planned for future)

**Configuration**:
```json
{
  "type": "openfn-adapter",
  "url": "https://api.openfn.org/workflow/trigger",
  "extraFields": [
    { "name": "apiKey", "value": "your-api-key" }
  ]
}
```

## Usage Examples

### Basic Initialization

```typescript
import { ExternalSyncManager } from './components/ExternalSyncManager';
import { EventStore } from './interfaces/types';
import { EventApplierService } from './services/EventApplierService';

// Configuration
const config: ExternalSyncConfig = {
  type: 'mock-sync-server',
  url: 'http://localhost:3000/sync',
  extraFields: []
};

// Initialize manager
const manager = new ExternalSyncManager(
  eventStore,
  eventApplierService,
  config
);

// Initialize adapter
await manager.initialize();

// Check if adapter was loaded
if (manager.isInitialized()) {
  await manager.synchronize();
}
```

### With Authentication

```typescript
const credentials: ExternalSyncCredentials = {
  username: 'sync_user',
  password: 'secure_password'
};

await manager.synchronize(credentials);
```

### Error Handling

```typescript
try {
  await manager.initialize();
  
  if (manager.isInitialized()) {
    await manager.synchronize();
    console.log('Sync completed successfully');
  } else {
    console.error('No adapter available for type:', config.type);
  }
} catch (error) {
  if (error.message === 'Adapter not initialized') {
    console.error('Please call initialize() first');
  } else {
    console.error('External sync failed:', error.message);
  }
}
```

## API Reference

### Constructor

```typescript
constructor(
  eventStore: EventStore,
  eventApplierService: EventApplierService,
  config: ExternalSyncConfig
)
```

**Parameters**:
- `eventStore`: Store for managing events and audit logs
- `eventApplierService`: Service for applying events to entities
- `config`: Configuration object specifying the external system type and settings

### Methods

#### `initialize(): Promise<void>`

Initializes the external sync manager by instantiating the appropriate adapter.

**Behavior**:
- Looks up the adapter class based on configuration type
- Creates an instance with provided dependencies
- If adapter type not found, manager remains uninitialized

**Throws**: `Error` when adapter instantiation fails

#### `synchronize(credentials?: ExternalSyncCredentials): Promise<void>`

Performs synchronization with the external system using the configured adapter.

**Parameters**:
- `credentials`: Optional authentication credentials for the external system

**Behavior**:
- Delegates sync operation to the loaded adapter
- Handles system-specific integration logic
- Typically involves pulling/pushing data and applying changes

**Throws**: `Error` when adapter is not initialized or sync operation fails

#### `isInitialized(): boolean`

Checks if the external sync manager has been properly initialized with an adapter.

**Returns**: `true` if an adapter is loaded and ready for synchronization

## Integration with DataCollect System

### Event Sourcing Integration

The External Sync system integrates with DataCollect's event sourcing architecture:

1. **Event Store**: Tracks all form submissions and maintains sync timestamps
2. **Event Applier Service**: Applies pulled events to local entities
3. **Sync Levels**: Manages synchronization state (LOCAL, REMOTE, EXTERNAL)

### Sync Process Flow

1. **Push Phase**:
   - Retrieve events since last push timestamp
   - Send events to external system in batches
   - Update push timestamp after successful batch

2. **Pull Phase**:
   - Retrieve data from external system since last pull
   - Convert external data to FormSubmission events
   - Apply events using EventApplierService
   - Update pull timestamp

### Timestamp Management

The system maintains separate timestamps for:
- `lastPushExternalSyncTimestamp`: Last successful push to external system
- `lastPullExternalSyncTimestamp`: Last successful pull from external system

This enables incremental synchronization and prevents data loss.

## Extending the System

### Adding New Adapters

To add support for a new external system:

1. **Create Adapter Class**:
```typescript
class CustomSyncAdapter implements ExternalSyncAdapter {
  constructor(
    private eventStore: EventStore,
    private eventApplierService: EventApplierService,
    private config: ExternalSyncConfig
  ) {}

  async sync(credentials?: ExternalSyncCredentials): Promise<void> {
    // Implement sync logic
  }
}
```

2. **Register in Adapters Mapping**:
```typescript
const adaptersMapping = {
  "mock-sync-server": MockSyncServerAdapter,
  "openfn-adapter": OpenFnSyncAdapter,
  "custom-adapter": CustomSyncAdapter, // Add new adapter
};
```

3. **Update Admin UI**:
```vue
<v-select
  v-model="form.externalSync.type"
  :items="[
    { title: 'Mock Sync Server', value: 'mock-sync-server' },
    { title: 'OpenFn', value: 'openfn-adapter' },
    { title: 'Custom System', value: 'custom-adapter' }, // Add new option
  ]"
  label="Type"
/>
```

### Configuration Schema

Each adapter can define its own configuration schema by extending `ExternalSyncConfig`:

```typescript
interface CustomSyncConfig extends ExternalSyncConfig {
  database?: string;
  timeout?: number;
  retryAttempts?: number;
}
```

## Best Practices

### Error Handling
- Always check `isInitialized()` before calling `synchronize()`
- Implement proper error handling for network failures
- Use try-catch blocks around sync operations

### Performance
- Use batch processing for large datasets
- Implement incremental sync using timestamps
- Consider implementing retry logic for failed operations

### Security
- Store sensitive credentials securely
- Use HTTPS for external system communication
- Implement proper authentication mechanisms

### Monitoring
- Log sync operations for debugging
- Track sync success/failure rates
- Monitor sync performance metrics

## Related Components

- **ConfigCreateView.vue**: Admin UI for configuring external sync
- **MockSyncServerAdapter**: Testing adapter for development
- **OpenFnSyncAdapter**: OpenFn platform integration
- **EventStore**: Event storage and timestamp management
- **EventApplierService**: Event application to entities

## Troubleshooting

### Common Issues

1. **Adapter Not Found**
   - Ensure the adapter type is correctly registered in `adaptersMapping`
   - Check that the adapter class is properly imported

2. **Authentication Failures**
   - Verify credentials are correctly formatted
   - Check that the external system accepts the authentication method

3. **Sync Failures**
   - Check network connectivity to external system
   - Verify the external system URL is correct
   - Review error logs for specific failure reasons

4. **Data Loss**
   - Ensure timestamps are properly maintained
   - Check that incremental sync is working correctly
   - Verify event ordering and processing

### Debug Mode

Enable debug logging to troubleshoot sync issues:

```typescript
// Enable detailed logging
console.log('Sync configuration:', config);
console.log('Adapter initialized:', manager.isInitialized());
console.log('Sync timestamps:', {
  lastPush: await eventStore.getLastPushExternalSyncTimestamp(),
  lastPull: await eventStore.getLastPullExternalSyncTimestamp()
});
```