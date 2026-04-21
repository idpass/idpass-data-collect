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
  - `"mock"` - For testing and development
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

  **For OpenSPP Adapter:**
  - `database`: OpenSPP/Odoo database name (required)
  - `username`: Username for authentication (required)
  - `password`: Password for authentication (required)
  - `batchSize`: Number of entities per batch (default: 50)
  - `batchDelayMs`: Delay between batches in milliseconds (default: 1000)
  - `maxRetries`: Maximum retry attempts for failed entities (default: 2)
  - `fieldMappings`: JSON array of field mappings with transformers (see Field Mapping section)

  **For Mock Registry Server:**
  - `clientId`: OAuth2 client ID registered on the mock registry (required)
  - `clientSecret`: OAuth2 client secret (required)
  - `identifierScheme`: Identifier scheme URI (default: `urn:mock:vocab:id-type`)
  - `identifierType`: Identifier type for DC-pushed entities (default: `system_id`)
  - `timeout`: HTTP request timeout in milliseconds (optional)

  **For Custom Adapters:**
  - Any adapter-specific configuration parameters
  - Database connection strings
  - Custom headers or authentication tokens
  - Sync frequency settings

### Configuration Examples by Adapter Type

#### Mock Registry Server Configuration
```json
{
  "type": "mock",
  "url": "http://localhost:9999",
  "adapterConfig": {
    "clientId": "mock-client",
    "clientSecret": "mock-secret",
    "identifierScheme": "urn:mock:vocab:id-type",
    "identifierType": "system_id"
  }
}
```

Start the reference server from the monorepo:

```bash
docker compose -f docker/docker-compose.dev.yaml --profile mock up -d
pnpm seed   # provisions a 'demo-mock-registry' config wired to http://localhost:9999
```

The `pnpm seed` script auto-seeds 2 households and 5 persons into the mock server (via `python -m mock_server seed`) and uploads a DC app config with `externalSync.type = "mock"`, ready for the admin UI to trigger.

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
- **Strategy**: Each adapter (e.g., `MockRegistrySyncAdapter`, `OpenFnSyncAdapter`) implements the `ExternalSyncAdapter` interface
- **Registry**: The `adaptersMapping` object serves as a registry of available strategies

### Key Components

```typescript
const adaptersMapping = {
  "mock": MockRegistrySyncAdapter,
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

### 1. Mock Registry Server Adapter

**Type**: `mock`

OAuth2 HTTP client for the reference [mock registry server](https://github.com/idpass/idpass-datacollect/tree/main/examples/mock-server) (Python + Litestar + SQLite). Used as the canonical reference V2 adapter and for end-to-end sync testing without OpenSPP.

- **Pull**: `GET /v1/persons` and `GET /v1/groups` with `updated_since` watermark
- **Push**: `POST`/`PATCH` of individuals and groups, `system_id` identifier for DC-originated entities
- **Auth**: OAuth2 client credentials (JWT, 1-hour TTL, auto-refresh)
- **Conflict handling**: maps HTTP 412 Precondition Failed to `ConflictError`

**Configuration**:
```json
{
  "type": "mock",
  "url": "http://localhost:9999",
  "adapterConfig": {
    "clientId": "mock-client",
    "clientSecret": "mock-secret",
    "identifierScheme": "urn:mock:vocab:id-type",
    "identifierType": "system_id"
  }
}
```

See also: [Building a V2 Adapter](../adapters/building-an-adapter.md) — uses this adapter as the worked example.

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

### 3. OpenSPP Adapter

**Type**: `openspp-adapter`

Integration with OpenSPP social protection platform:

- **Push**: Sends entities to OpenSPP with field mapping and transformation
- **Pull**: Retrieves updates from OpenSPP and applies them locally
- **Authentication**: Uses basic authentication (username/password)
- **Field Mapping**: Visual interface for mapping form fields to OpenSPP fields
- **Data Transformers**: Automatic format conversion (dates, IDs, multi-select, boolean)
- **Batch Processing**: Configurable batch sizes and delays

**Configuration**:
```json
{
  "type": "openspp-adapter",
  "url": "https://openspp.example.com",
  "auth": "basic",
  "extraFields": [
    { "name": "database", "value": "openspp" },
    { "name": "username", "value": "admin" },
    { "name": "password", "value": "password" },
    { "name": "batchSize", "value": "50" },
    { "name": "batchDelayMs", "value": "1000" },
    { "name": "maxRetries", "value": "2" }
  ]
}
```

For detailed OpenSPP adapter documentation, see the [OpenSPP Adapter Guide](../adapters/openspp-adapter.md).

## Usage Examples

### Basic Initialization

```typescript
import { ExternalSyncManager } from './components/ExternalSyncManager';
import { EventStore } from './interfaces/types';
import { EventApplierService } from './services/EventApplierService';

// Configuration
const config: ExternalSyncConfig = {
  type: 'mock',
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

## Field Mapping and Transformers

For adapters that support field mapping (like OpenSPP), you can configure field mappings with data transformers to handle format conversion between form data and external system formats.

### Field Mapping Structure

Field mappings define how form fields map to external system fields, with optional transformers for data conversion:

```json
{
  "formField": "first_name",
  "opensppField": "firstname",
  "transformer": {
    "type": "text",
    "options": {}
  }
}
```

### Transformer Types

The system supports several transformer types:

- **text**: Pass-through or string conversion (default)
- **date**: Date format conversion with configurable input/output formats
- **id**: ID value handling for relation fields
- **multiselect**: Array-to-delimited-string conversion
- **boolean**: Boolean normalization with configurable truthy/falsy values

For detailed transformer documentation, see the [OpenSPP Adapter Guide](../adapters/openspp-adapter.md#transformer-types).

### Configuring Field Mappings

Field mappings can be configured:

1. **Via Admin UI**: Use the visual field mapping dialog in the configuration editor
2. **Via JSON Config**: Include mappings in the `fieldMappings` extraField as a JSON string

Example field mappings configuration:

```json
{
  "name": "fieldMappings",
  "value": "[{\"formField\":\"birth_date\",\"opensppField\":\"birthdate\",\"transformer\":{\"type\":\"date\",\"options\":{\"inputFormat\":\"auto\",\"outputFormat\":\"YYYY-MM-DD\"}}},{\"formField\":\"gender\",\"opensppField\":\"gender_id\",\"transformer\":{\"type\":\"id\"}}]"
}
```

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
  "mock": MockRegistrySyncAdapter,
  "openfn-adapter": OpenFnSyncAdapter,
  "openspp-adapter": OpenSppOdooSyncAdapter,
  "custom-adapter": CustomSyncAdapter, // Add new adapter
};
```

3. **Update Admin UI**:
```vue
<v-select
  v-model="form.externalSync.type"
  :items="[
    { title: 'Mock Registry Server', value: 'mock' },
    { title: 'OpenFn', value: 'openfn-adapter' },
    { title: 'OpenSPP', value: 'openspp-adapter' },
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
- **FieldMappingDialog.vue**: Visual interface for field mapping configuration
- **MockRegistrySyncAdapter**: V2 OAuth2 HTTP client for the reference mock registry (examples/mock-server)
- **OpenFnSyncAdapter**: OpenFn platform integration
- **OpenSppOdooSyncAdapter**: OpenSPP platform integration with field mapping
- **EventStore**: Event storage and timestamp management
- **EventApplierService**: Event application to entities
- **FieldTransformers**: Data transformation utilities (text, date, id, multiselect, boolean)

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