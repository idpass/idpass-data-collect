---
id: index
title: Quick Start
sidebar_position: 1
---

### Prerequisites

- Node.js 22+
- PNPM 10+
- PostgreSQL 15+ (for backend)
- Modern web browser with [IndexedDB](../../glossary#indexeddb) support

### 5-Minute Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/idpass/idpass-data-collect.git
   cd idpass-data-collect
   ```

2. **Build the DataCollect library**
   ```bash
   cd packages/datacollect
   npm install
   npm run build
   ```

3. **Set up the backend** (optional, for sync functionality)
   ```bash
   cd packages/backend
   npm install
   cp .env.example .env
   # Edit .env with your database settings
   npm run dev
   ```

4. **Try the admin interface** (optional)
   ```bash
   cd packages/admin
   npm install
   npm run dev
   ```

5. **Try the mobile app** (optional)
   ```bash
   cd packages/mobile
   npm install
   npm run dev
   ```

### Your First Application

Create a simple client application:

```typescript
import {
  [EntityDataManager](../../glossary#entitydatamanager),
  IndexedDbEntityStorageAdapter,
  IndexedDbEventStorageAdapter,
  IndexedDbAuthStorageAdapter,
  [EventStoreImpl](../../glossary#eventstore),
  [EntityStoreImpl](../../glossary#entitystore),
  EventApplierService,
  InternalSyncManager,
  ExternalSyncManager,
  AuthManager,
  SyncLevel
} from "idpass-data-collect";

// Initialize the data manager with authentication
async function initializeDataManager() {
  // Initialize storage adapters
  const eventStorageAdapter = new IndexedDbEventStorageAdapter('my-events');
  const entityStorageAdapter = new IndexedDbEntityStorageAdapter('my-entities');
  const authStorageAdapter = new IndexedDbAuthStorageAdapter('my-auth');

  // Initialize stores
  const eventStore = new EventStoreImpl(eventStorageAdapter);
  const entityStore = new EntityStoreImpl(entityStorageAdapter);
  await eventStore.initialize();
  await entityStore.initialize();
  await authStorageAdapter.initialize();

  // Set up services
  const eventApplierService = new EventApplierService(eventStore, entityStore);

  // Create sync managers
  const internalSyncManager = new InternalSyncManager(
    eventStore,
    entityStore,
    eventApplierService,
    'http://localhost:3000',
    authStorageAdapter
  );

  const externalSyncManager = new ExternalSyncManager(
    eventStore,
    eventApplierService,
    {
      type: 'mock-sync-server',
      url: 'http://localhost:4000',
      auth: '',
      extraFields: {}
    }
  );

  // Create authentication manager
  const authManager = new AuthManager(
    [], // No auth configs for this simple example
    'http://localhost:3000',
    authStorageAdapter
  );

  // Create the main manager
  return new EntityDataManager(
    eventStore,
    entityStore,
    eventApplierService,
    externalSyncManager,
    internalSyncManager,
    authManager
  );
}

// Initialize the data manager
const manager = await initializeDataManager();

// Create a household group
const groupData = {
  guid: "group-001",
  type: "create-group",
  entityGuid: "group-001",
  data: { name: "Smith Family" },
  timestamp: new Date().toISOString(),
  userId: "user-1",
  syncLevel: SyncLevel.LOCAL,
};

const group = await manager.submitForm(groupData);
console.log("Created group:", group);

// Add a family member
const memberData = {
  guid: "member-001",
  entityGuid: "individual-001",
  type: "create-individual", 
  data: { 
    name: "John Smith",
    dateOfBirth: "1980-01-01",
    relationship: "Head"
  },
  timestamp: new Date().toISOString(),
  userId: "user-1",
  syncLevel: SyncLevel.LOCAL,
};

const member = await manager.submitForm(memberData);
console.log("Created member:", member);
```

## What's Next?

- [Installation Guide](./installation.md) - Detailed installation instructions
- [Configuration](./configuration.md) - Configure for your environment  
- [API Reference](../../packages/datacollect/api/) - Complete API documentation

## Need Help?

- Open an issue on [GitHub](https://github.com/idpass/idpass-data-collect/issues)
- Join our [Community Discussions](https://github.com/idpass/idpass-data-collect/discussions)
