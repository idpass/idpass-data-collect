---
id: basic-entitydatamanager-setup
title: Basic EntityDataManager Setup
sidebar_position: 1
---

# Basic EntityDataManager Setup

This tutorial shows you how to set up a complete EntityDataManager instance with authentication and all required components. You'll build a robust foundation that can handle real-world data collection scenarios with secure authentication.

### Step 1: Import Required Dependencies

```typescript
import { v4 as uuidv4 } from "uuid";
import { cloneDeep } from "lodash";
import {
  EntityDataManager,
  IndexedDbEntityStorageAdapter,
  IndexedDbEventStorageAdapter,
  IndexedDbAuthStorageAdapter,
  EventStoreImpl,
  EntityStoreImpl,
  EventApplierService,
  InternalSyncManager,
  ExternalSyncManager,
  AuthManager,
  EntityType,
  SyncLevel,
  FormSubmission,
  EventApplier,
  EntityDoc,
  IndividualDoc,
  GroupDoc,
  EntityPair,
  AuthConfig,
  PasswordCredentials,
  TokenCredentials
} from 'idpass-data-collect';
```

### Step 2: Initialize Storage Components

```typescript
// Configuration
const userId = "your-user-id";
const appId = "your-app-id";
const internalUrl = "http://localhost:3000"; // Your sync server URL
const externalUrl = "http://localhost:3001"; // External system URL

// Initialize Event Store
const eventStore = new EventStoreImpl(new IndexedDbEventStorageAdapter(appId));
await eventStore.initialize();

// Initialize Entity Store
const entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter(appId));
await entityStore.initialize();

// Initialize Auth Storage
const authStorageAdapter = new IndexedDbAuthStorageAdapter(appId);
await authStorageAdapter.initialize();
```

### Step 3: Configure Authentication

```typescript
// Configure authentication providers
const authConfigs: AuthConfig[] = [
  {
    type: "auth0",
    fields: {
      domain: "your-domain.auth0.com",
      clientId: "your-client-id",
      redirectUri: "http://localhost:3000/callback",
      scope: "openid profile email"
    }
  },
  {
    type: "keycloak",
    fields: {
      realm: "your-realm",
      clientId: "your-client-id",
      serverUrl: "http://localhost:8080/auth"
    }
  }
];

// Initialize Auth Manager
const authManager = new AuthManager(
  authConfigs,
  internalUrl,
  authStorageAdapter
);
await authManager.initialize();
```

### Step 4: Set Up Event Applier Service

```typescript
// Create the event applier service
const eventApplierService = new EventApplierService(eventStore, entityStore);

// Register custom event appliers (optional)
const addElderlyApplier: EventApplier = {
  apply: async (
    entity: EntityDoc,
    form: FormSubmission,
    getEntity: (id: string) => Promise<EntityPair | null>,
    saveEntity: (
      action: string,
      existingEntity: EntityDoc,
      modifiedEntity: EntityDoc,
      changes: Record<string, any>,
    ) => Promise<void>,
  ): Promise<EntityDoc> => {
    if (entity.type !== "group") {
      throw new Error("Cannot add elderly member to non-group entity");
    }

    const elderName = form?.data?.members?.[0]?.name || "Unnamed Elderly";
    const elderlyGuid = uuidv4();
    const individual: IndividualDoc = {
      id: uuidv4(),
      guid: elderlyGuid,
      type: EntityType.Individual,
      name: elderName,
      version: 1,
      data: { name: elderName, memberType: "Elderly" },
      lastUpdated: new Date().toISOString(),
    };

    const clonedEntity = cloneDeep(entity) as GroupDoc;
    if (clonedEntity.memberIds && form.data && form.data.members) {
      clonedEntity.memberIds.push(elderlyGuid);
      clonedEntity.version += 1;
    } else {
      throw new Error("Invalid entity or form data structure");
    }

    await saveEntity(form.type, individual, individual, individual);
    await saveEntity(form.type, entity, clonedEntity, { memberIds: clonedEntity.memberIds });
    return clonedEntity;
  },
};

// Register the custom applier
eventApplierService.registerEventApplier("add-elderly", addElderlyApplier);
```

### Step 5: Configure Sync Managers

```typescript
// Internal sync manager for client-server synchronization
const internalSyncManager = new InternalSyncManager(
  eventStore, 
  entityStore, 
  eventApplierService, 
  internalUrl,
  authStorageAdapter,
  appId
);

// External sync manager for external system integration
const externalSyncManager = new ExternalSyncManager(eventStore, eventApplierService, {
  type: "mock-sync-server", // or your external system type
  url: externalUrl,
  extraFields: [],
});
```

### Step 6: Create EntityDataManager Instance with Authentication

```typescript
// Create the main manager with authentication
const manager = new EntityDataManager(
  eventStore,
  entityStore,
  eventApplierService,
  externalSyncManager,
  internalSyncManager,
  authManager
);

// Initialize authentication
await manager.initializeAuthManager();
```

**Congratulations!** You've successfully set up your first EntityDataManager with authentication. This foundation will serve as the backbone for all your secure data collection operations.
