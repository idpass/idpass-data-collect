---
id: configuration
title: Configuration
sidebar_position: 4
---

# Configuration

The configuration is to be used together with backend, admin and mobile solution to take advantage of multi-tenants setup.
The configuration can be set up either manually or using Config creation in admin.

## Getting Started

This guide will walk you through the complete setup process for using the IDPass Data Collect system with configuration management.

### Prerequisites

Before starting, ensure you have:
- Backend service running
- Admin interface accessible
- Mobile app installed or your own application ready
- Network connectivity between all components

### Step 1: Start Required Services

#### Start Backend Service

```bash
# Navigate to your backend directory
cd packages/backend

# Start the backend service
npm start
```

The backend service should be running on the configured port (typically `http://localhost:3000` or similar).

#### Start Admin Interface

```bash
# Navigate to your admin directory
cd packages/admin

# Start the admin interface
npm start
```

The admin interface should be accessible at `http://localhost:5173` or your configured URL.

### Step 2: Import or Create Sample Configuration

#### Option A: Create Configuration via Admin Interface

1. Open your admin interface in a web browser
1. Navigate to Create Config
1. Fill in the required fields
1. Save the configuration

#### Option B: Import Existing Configuration File

1. In the admin interface, go to Home
2. Click "Upload JSON Config File"
3. Select your configuration file (JSON format)
5. Confirm the import

#### Sample Configuration File

```json
{
  "id": "sample",
  "name": "sample",
  "description": "Sample config",
  "version": "1",
  "entityForms": [
    {
      "name": "household",
      "title": "Household",
      "dependsOn": "",
      "formio": {
        "components": [
          {
            "label": "Name",
            "applyMaskOn": "change",
            "tableView": true,
            "validateWhenHidden": false,
            "key": "name",
            "type": "textfield",
            "input": true
          },
          {
            "type": "button",
            "label": "Submit",
            "key": "submit",
            "disableOnInvalid": true,
            "input": true,
            "tableView": false
          }
        ]
      }
    }
  ],
  "externalSync": {
    "type": "mock-sync-server",
    "url": "http://localhost:4000",
    "auth": "",
    "extraFields": {}
  },
  "authConfigs": [],
  "syncServerUrl": "localhost:3000"
}
```

### Step 3: Get Configuration via Mobile App

(You can use mobile package to run a browser app)

#### Using the Mobile App

1. Open the IDPass Data Collect mobile app
2. Navigate to the Configuration section
3. Use the QR code scanner or manual entry to get your configuration:
   - **QR Code**: Scan the QR code displayed in the admin interface
   - **Manual Entry**: Enter the configuration ID or URL manually
4. The app will download and validate the configuration

#### Using Your Own Application

If you're using your own application, implement the configuration retrieval:

```javascript
// Example: Retrieve configuration from backend
const response = await fetch(`${serverUrl}/${configId}.json`);
const config = await response.json();

// Initialize your app with the configuration
await initializeDataCollect(config);
```

### Step 4: Initialize DataCollect with Configuration

#### Initialize the DataCollect Library

```javascript
import { 
  EntityDataManager,
  EntityStoreImpl,
  EventStoreImpl,
  EventApplierService,
  IndexedDbEntityStorageAdapter,
  IndexedDbEventStorageAdapter,
  ExternalSyncManager
} from '@idpass/datacollect';

// Initialize with your imported configuration
const initializeDataCollect = async (config) => {
  // Create storage adapters
  const eventStorageAdapter = new IndexedDbEventStorageAdapter('my-data-collect-events');
  const entityStorageAdapter = new IndexedDbEntityStorageAdapter('my-data-collect-entities');
  
  // Initialize stores
  const eventStore = new EventStoreImpl('user-id', eventStorageAdapter);
  await eventStore.initialize();
  
  const entityStore = new EntityStoreImpl(entityStorageAdapter);
  await entityStore.initialize();
  
  // Create event applier service
  const eventApplierService = new EventApplierService('user-id', eventStore, entityStore);

  // Create internal sync manager
  internalSyncManager = new InternalSyncManager(eventStore, entityStore, eventApplierService, config.syncServerUrl, "");
  
  // Create the main data manager
  const dataCollect = new EntityDataManager(
    eventStore,
    entityStore,
    eventApplierService,
    null, // Client instance doesn't need to setup external sync
    internalSyncManager

  );
  
  return dataCollect;
};

// Initialize the system
const dataCollect = await initializeDataCollect(importedConfig);
```

### Step 5: Collect Data

#### Create New Records

```javascript
// Create a new individual record
const formData = {
  guid: "form-id",
  entityGuid: "form-id", 
  type: "create-individual",
  data: { 
    name: "John Doe",
    dateOfBirth: "1990-01-01",
    // Add other fields as needed
  },
  timestamp: new Date().toISOString(),
  userId: "user-id",
  syncLevel: 0 // SyncLevel.LOCAL
};

const individual = await dataCollect.submitForm(formData);
console.log('Created individual:', individual);
```

#### View Collected Data

```javascript
// Get all collected data
const allData = await dataCollect.getAllEntities();
console.log('All collected data:', allData);

// Get a specific entity by GUID
const entity = await dataCollect.getEntity("entity-guid");
console.log('Specific entity:', entity);

// Search for specific records
const searchResults = await dataCollect.searchEntities([
  { name: "John Doe" }
]);
console.log('Search results:', searchResults);
```

### Step 6: Sync to Server Using Backend User

#### Authenticate with Backend

```javascript
await manager.login("admin@hdm.example", "admin1@");
```

#### Perform Synchronization

```javascript
await manager.syncWithSyncServer();
```

### Step 7: Verify Synced Data in Admin

#### Check Admin Interface

1. Open your admin interface
2. Navigate to Home
3. Check Apps card the following:
   - **Entities**: Verify the number of records matches your collection

#### User another client instance to get synced data

```javascript
await anotherManager.login("admin@hdm.example", "admin1@");
await manager.syncWithSyncServer();
```


### Troubleshooting

#### Common Issues

1. **Configuration Not Found**
   - Verify the configuration ID is correct
   - Check that the configuration exists in the admin interface
   - Ensure network connectivity to the backend

2. **Authentication Failures**
   - Verify username and password are correct
   - Check that the user has proper permissions
   - Ensure the authentication endpoint is accessible

3. **Sync Failures**
   - Check network connectivity
   - Verify the backend service is running
   - Review sync logs for specific error messages
   - Ensure data schema matches between client and server

4. **Data Not Appearing in Admin**
   - Verify sync completed successfully
   - Check that the correct user account is being used
   - Review admin permissions and data visibility settings

#### Getting Help

If you encounter issues not covered in this guide:
- Check the [API Reference](../packages/backend/api-reference-overview.md) for detailed endpoint documentation
- Review the [Architecture Documentation](../architecture/index.md) for system understanding
- Contact your system administrator for backend-specific issues

## Next Steps

<!-- - [First App Tutorial](../getting-started/#your-first-application) - Build your first application -->
- [Configuration](../configuration) - Learn more about configuration
- [Packages](../packages) - Explore the packages
- [Architecture](../architecture/) - Architecture Overview
- [Deployment Guide](../deployment) - Production deployment