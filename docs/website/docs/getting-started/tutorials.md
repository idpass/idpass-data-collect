---
id: tutorials
title: Tutorials
sidebar_position: 3
---

# DataCollect Tutorials

This tutorial is for running standalone DataCollect instances with authentication.

Welcome to the comprehensive DataCollect tutorials! Whether you're building a data collection app for field workers, managing household surveys, or creating a robust entity management system, these step-by-step guides will help you get up and running quickly with secure authentication.

## What You'll Learn

- 🏗️ **Complete Setup**: Build a fully functional EntityDataManager with authentication from scratch
- 🔐 **Authentication**: Configure multi-provider authentication (Auth0, Keycloak, custom)
- 📝 **Form Management**: Create, update, and manage entities through forms
- 🔍 **Data Retrieval**: Search and filter your data efficiently
- 🔄 **Synchronization**: Keep your data in sync across devices and servers with authenticated operations
- 🚀 **Advanced Features**: Handle duplicates, complex operations, and error scenarios

## Prerequisites

Before starting these tutorials, make sure you have:
- Basic knowledge of TypeScript/JavaScript
- Node.js installed on your system
- A code editor (VS Code recommended)
- Understanding of basic database concepts
- Authentication provider setup (Auth0, Keycloak, or custom)

## Tutorial 1: Basic EntityDataManager Setup with Authentication

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
} from 'datacollect';
```

### Step 2: Initialize Storage Components with Authentication

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

## Tutorial 2: Authentication Workflows

This tutorial demonstrates how to implement various authentication workflows with the EntityDataManager.

### Basic Authentication

```typescript
// Check authentication status
const isAuthenticated = await manager.isAuthenticated();
console.log("Currently authenticated:", isAuthenticated);

// Login with username/password (default provider)
const credentials: PasswordCredentials = {
  username: "admin@example.com",
  password: "password123"
};

await manager.login(credentials);
console.log("Login successful");

// Verify authentication
const authenticated = await manager.isAuthenticated();
console.log("Authentication status:", authenticated);
```

### Provider-Specific Authentication

```typescript
// Login with Auth0
await manager.login({
  username: "user@example.com",
  password: "password123"
}, "auth0");

// Login with Keycloak
await manager.login({
  username: "user@example.com",
  password: "password123"
}, "keycloak");

// Login with token
const tokenCredentials: TokenCredentials = {
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
};

await manager.login(tokenCredentials, "auth0");
```

### Token Management

```typescript
// Validate token
const isValid = await manager.validateToken("auth0", "your-token");
console.log("Token valid:", isValid);

// Handle authentication callback (for OAuth flows)
await manager.handleCallback("auth0");

// Logout
await manager.logout();
console.log("Logged out successfully");
```

## Tutorial 3: Working with Forms and Entities (Authenticated)

This tutorial demonstrates how to submit forms and work with entities in an authenticated environment.

### Authenticated Entity Operations

```typescript
// Ensure authentication before operations
if (!await manager.isAuthenticated()) {
  await manager.login({
    username: "admin@example.com",
    password: "password123"
  });
}

// Create a new individual
const individualForm: FormSubmission = {
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: "create-individual",
  data: { 
    name: "John Doe",
    age: 30,
    email: "john.doe@example.com"
  },
  timestamp: new Date().toISOString(),
  userId: "user-id",
  syncLevel: SyncLevel.LOCAL,
};

const individual = await manager.submitForm(individualForm);
console.log("Created individual:", individual);
```

### Creating Groups with Authentication

```typescript
// Create a new group (requires authentication)
const groupForm: FormSubmission = {
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: "create-group",
  data: { 
    name: "Family Group",
    headOfGroup: "John Doe",
    address: "123 Main St",
    phoneNumber: "555-1234"
  },
  timestamp: new Date().toISOString(),
  userId: "user-id",
  syncLevel: SyncLevel.LOCAL,
};

const group = await manager.submitForm(groupForm);
console.log("Created group:", group);
```

### Creating Groups with Initial Members

```typescript
// Create a group with initial members
const familyForm: FormSubmission = {
  guid: uuidv4(),
  type: "create-group",
  entityGuid: uuidv4(),
  data: {
    name: "Doe Family",
    headOfGroup: "John Doe",
    address: "123 Main St",
    phoneNumber: "555-1234",
    email: "john@doe.com",
    income: 50000,
    members: [
      { 
        guid: uuidv4(), 
        name: "Jane Doe", 
        dateOfBirth: "1985-05-15", 
        relationship: "Spouse" 
      },
      { 
        guid: uuidv4(), 
        name: "Jimmy Doe", 
        dateOfBirth: "2010-03-20", 
        relationship: "Child" 
      },
    ],
  },
  timestamp: new Date().toISOString(),
  userId: "user-1",
  syncLevel: SyncLevel.LOCAL,
};

const family = await manager.submitForm(familyForm);
console.log("Created family with members:", family);
```

### Adding Members to Existing Groups

```typescript
// Add a member to an existing group
const addMemberForm: FormSubmission = {
  guid: uuidv4(),
  type: "add-member",
  entityGuid: group.guid, // Use the group's GUID
  data: {
    members: [
      { 
        guid: uuidv4(), 
        name: "New Member", 
        dateOfBirth: "1990-01-01", 
        relationship: "Friend" 
      }
    ],
  },
  timestamp: new Date().toISOString(),
  userId: "user-1",
  syncLevel: SyncLevel.LOCAL,
};

const updatedGroup = await manager.submitForm(addMemberForm);
console.log("Updated group:", updatedGroup);
```

### Updating Entities

```typescript
// Update an existing individual
const updateForm: FormSubmission = {
  guid: uuidv4(),
  entityGuid: individual.guid, // Use the individual's GUID
  type: "update-individual",
  data: { 
    name: "John Doe Updated",
    age: 31,
    email: "john.updated@example.com"
  },
  timestamp: new Date().toISOString(),
  userId: "user-id",
  syncLevel: SyncLevel.LOCAL,
};

const updatedIndividual = await manager.submitForm(updateForm);
console.log("Updated individual:", updatedIndividual);
```

### Using Custom Event Appliers

```typescript
// Use the custom add-elderly applier
const addElderlyForm: FormSubmission = {
  guid: uuidv4(),
  type: "add-elderly",
  entityGuid: group.guid,
  data: {
    members: [
      { 
        name: "Grandpa Joe", 
        dateOfBirth: "1940-02-20", 
        relationship: "Parent" 
      }
    ],
  },
  timestamp: new Date().toISOString(),
  userId: "user-1",
  syncLevel: SyncLevel.LOCAL,
};

const groupWithElderly = await manager.submitForm(addElderlyForm);
console.log("Group with elderly member:", groupWithElderly);
```

## Tutorial 4: Entity Retrieval and Search

Master the art of finding and retrieving your data efficiently. This tutorial covers various search patterns and data access methods.

### Getting Individual Entities

```typescript
// Get a specific entity by GUID
const entity = await manager.getEntity(individual.guid);
if (entity) {
  console.log("Retrieved entity:", entity.modified);
  console.log("Entity type:", entity.modified.type);
  console.log("Entity name:", entity.modified.name);
}
```

### Getting All Entities

```typescript
// Get all entities
const allEntities = await manager.getAllEntities();
console.log("Total entities:", allEntities.length);

// Filter by type
const individuals = allEntities.filter(e => e.modified.type === EntityType.Individual);
const groups = allEntities.filter(e => e.modified.type === EntityType.Group);

console.log("Individuals:", individuals.length);
console.log("Groups:", groups.length);
```

### Searching Entities

```typescript
// Search by name
const nameResults = await manager.searchEntities([{ name: "John Doe" }]);
console.log("Name search results:", nameResults);

// Search by age range
const ageResults = await manager.searchEntities([{ age: { $gt: 25 } }]);
console.log("Age search results:", ageResults);

// Search by type
const groupResults = await manager.searchEntities([{ type: "group" }]);
console.log("Group search results:", groupResults);

// Search by email pattern
const emailResults = await manager.searchEntities([{ email: { $regex: "@example.com$" } }]);
console.log("Email search results:", emailResults);
```

## Tutorial 5: Authenticated Synchronization

Learn how to keep your data synchronized across multiple devices and servers with secure authentication. This is crucial for offline-capable applications.

### Authenticated Synchronization Setup

```typescript
// Ensure authentication before sync
if (!await manager.isAuthenticated()) {
  await manager.login({
    username: "admin@example.com",
    password: "password123"
  });
}

// Check for unsynced events
const hasUnsynced = await manager.hasUnsyncedEvents();
console.log("Has unsynced events:", hasUnsynced);

if (hasUnsynced) {
  const unsyncedCount = await manager.getUnsyncedEventsCount();
  console.log("Unsynced events count:", unsyncedCount);
}
```

### Manual Synchronization

```typescript
// Sync with the server (requires authentication)
try {
  await manager.syncWithSyncServer();
  console.log("Sync completed successfully");
  
  // Verify sync
  const hasUnsyncedAfter = await manager.hasUnsyncedEvents();
  console.log("Has unsynced events after sync:", hasUnsyncedAfter);
} catch (error) {
  console.error("Sync failed:", error);
  
  // Check if authentication expired
  if (!await manager.isAuthenticated()) {
    console.log("Re-authenticating...");
    await manager.login({
      username: "admin@example.com",
      password: "password123"
    });
    
    // Retry sync
    await manager.syncWithSyncServer();
  }
}
```

### Working with Sync Events

```typescript
// Create data that will be synced
const syncForm: FormSubmission = {
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: "create-individual",
  data: { name: "Sync Test User" },
  timestamp: new Date().toISOString(),
  userId: "user-1",
  syncLevel: SyncLevel.LOCAL,
};

await manager.submitForm(syncForm);

// Check sync status
const hasUnsyncedBefore = await manager.hasUnsyncedEvents();
console.log("Has unsynced events before sync:", hasUnsyncedBefore);

// Sync to server (requires authentication)
await manager.syncWithSyncServer();

// Verify sync completion
const hasUnsyncedAfter = await manager.hasUnsyncedEvents();
console.log("Has unsynced events after sync:", hasUnsyncedAfter);
```

## Tutorial 6: Advanced Operations

Take your DataCollect implementation to the next level with advanced features like duplicate detection, complex operations, and performance optimization.

### Duplicate Detection and Resolution

```typescript
// Create potential duplicates
const duplicate1 = await manager.submitForm({
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: "create-individual",
  data: { name: "John Doe" },
  timestamp: new Date().toISOString(),
  userId: "user-id",
  syncLevel: SyncLevel.LOCAL,
});

const duplicate2 = await manager.submitForm({
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: "create-individual",
  data: { name: "John Doe" },
  timestamp: new Date().toISOString(),
  userId: "user-id",
  syncLevel: SyncLevel.LOCAL,
});

// Check for potential duplicates
const potentialDuplicates = await manager.getPotentialDuplicates();
console.log("Potential duplicates:", potentialDuplicates);

// Resolve duplicates
if (potentialDuplicates.length > 0) {
  await manager.submitForm({
    guid: uuidv4(),
    type: "resolve-duplicate",
    entityGuid: duplicate2.guid,
    data: { 
      duplicates: [{ 
        entityGuid: duplicate2.guid, 
        duplicateGuid: duplicate1.guid 
      }], 
      shouldDelete: true 
    },
    timestamp: new Date().toISOString(),
    userId: "user-id",
    syncLevel: SyncLevel.LOCAL,
  });
  
  // Verify resolution
  const duplicatesAfter = await manager.getPotentialDuplicates();
  console.log("Duplicates after resolution:", duplicatesAfter);
}
```

### Entity Deletion

```typescript
// Delete an entity
const deleteForm: FormSubmission = {
  guid: uuidv4(),
  entityGuid: individual.guid,
  type: "delete-entity",
  data: { reason: "Data cleanup" },
  timestamp: new Date().toISOString(),
  userId: "user-id",
  syncLevel: SyncLevel.LOCAL,
};

await manager.submitForm(deleteForm);

// Verify deletion
const entitiesAfterDelete = await manager.getAllEntities();
console.log("Entities after deletion:", entitiesAfterDelete.length);
```

### Complex Group Operations

```typescript
// Create a complex group structure
const createComplexGroup = async (groupName: string, members: any[]): Promise<GroupDoc> => {
  const formData: FormSubmission = {
    guid: uuidv4(),
    type: "create-group",
    entityGuid: uuidv4(),
    data: {
      name: groupName,
      headOfGroup: members[0].name,
      members: members,
    },
    timestamp: new Date().toISOString(),
    userId: "test-user",
    syncLevel: SyncLevel.LOCAL,
  };

  return await manager.submitForm(formData) as GroupDoc;
};

// Create multiple groups
const groups = await Promise.all([
  createComplexGroup("Group 1", [
    { guid: uuidv4(), name: "John Doe", dateOfBirth: "1980-01-01", relationship: "Head" },
    { guid: uuidv4(), name: "Jane Doe", dateOfBirth: "1982-02-02", relationship: "Spouse" },
    { guid: uuidv4(), name: "Jimmy Doe", dateOfBirth: "2010-03-03", relationship: "Child" },
  ]),
  createComplexGroup("Group 2", [
    { guid: uuidv4(), name: "Bob Smith", dateOfBirth: "1975-05-05", relationship: "Head" },
    { guid: uuidv4(), name: "Alice Smith", dateOfBirth: "1977-06-06", relationship: "Spouse" },
  ]),
]);

console.log("Created groups:", groups.length);

// Modify groups
const removeMember = async (groupId: string, memberId: string): Promise<GroupDoc> => {
  const formData: FormSubmission = {
    guid: uuidv4(),
    type: "remove-member",
    entityGuid: groupId,
    data: { memberId },
    timestamp: new Date().toISOString(),
    userId: "test-user",
    syncLevel: SyncLevel.LOCAL,
  };
  return await manager.submitForm(formData) as GroupDoc;
};

// Remove a member from the first group
const updatedGroup = await removeMember(groups[0].guid, groups[0].memberIds[0]);
console.log("Updated group member count:", updatedGroup.memberIds.length);
```

## Tutorial 7: Error Handling and Best Practices

Learn how to build robust, production-ready applications with proper error handling, authentication management, and performance optimization techniques.

### Authentication Error Handling

```typescript
try {
  // Attempt authenticated operation
  await manager.syncWithSyncServer();
} catch (error) {
  if (error.message.includes("Unauthorized") || error.message.includes("401")) {
    console.log("Authentication expired, re-authenticating...");
    
    try {
      await manager.login({
        username: "admin@example.com",
        password: "password123"
      });
      
      // Retry the operation
      await manager.syncWithSyncServer();
    } catch (authError) {
      console.error("Re-authentication failed:", authError.message);
      // Handle authentication failure
    }
  } else {
    console.error("Sync error:", error.message);
  }
}
```

### Form Submission Error Handling

```typescript
try {
  // Submit form with invalid data
  const invalidForm: FormSubmission = {
    guid: uuidv4(),
    type: "unknown-type", // This will cause an error
    entityGuid: uuidv4(),
    data: { name: "Test" },
    timestamp: new Date().toISOString(),
    userId: "user-id",
    syncLevel: SyncLevel.LOCAL,
  };

  await manager.submitForm(invalidForm);
} catch (error) {
  console.error("Form submission error:", error.message);
  // Handle the error appropriately
}
```

### Authentication State Management

```typescript
// Check authentication before operations
const ensureAuthenticated = async () => {
  if (!await manager.isAuthenticated()) {
    throw new Error("Authentication required");
  }
};

// Wrapper for authenticated operations
const authenticatedOperation = async (operation: () => Promise<any>) => {
  await ensureAuthenticated();
  
  try {
    return await operation();
  } catch (error) {
    if (error.message.includes("Unauthorized")) {
      // Re-authenticate and retry
      await manager.login({
        username: "admin@example.com",
        password: "password123"
      });
      return await operation();
    }
    throw error;
  }
};

// Usage
await authenticatedOperation(() => manager.syncWithSyncServer());
```

### Cleanup and Resource Management

```typescript
// Clean up stores and authentication when done
const cleanup = async () => {
  await manager.logout();
  entityStore.clearStore();
  eventStore.clearStore();
  authStorageAdapter.clearStore();
};

// Use in your application lifecycle
window.addEventListener('beforeunload', cleanup);
```

### Performance Optimization

```typescript
// Batch operations when possible
const batchCreateIndividuals = async (individuals: any[]) => {
  // Ensure authentication once
  await ensureAuthenticated();
  
  const promises = individuals.map(individual => 
    manager.submitForm({
      guid: uuidv4(),
      entityGuid: uuidv4(),
      type: "create-individual",
      data: individual,
      timestamp: new Date().toISOString(),
      userId: "user-id",
      syncLevel: SyncLevel.LOCAL,
    })
  );
  
  return await Promise.all(promises);
};

// Use for bulk operations
const manyIndividuals = [
  { name: "Person 1", age: 25 },
  { name: "Person 2", age: 30 },
  { name: "Person 3", age: 35 },
];

const createdIndividuals = await batchCreateIndividuals(manyIndividuals);
console.log("Batch created:", createdIndividuals.length);
```

## Next Steps

Ready to take your DataCollect knowledge further? Explore these resources:

- 📖 [Configuration Guide](./configuration.md) - Customize DataCollect and authentication for your specific needs
- 🚀 [Backend Package](../backend/) - Add server synchronization and authentication capabilities
- 👥 [Admin Package](../admin/) - Build a complete management solution with user authentication
- 🔧 [API Reference](../datacollect/) - Dive deep into the technical details
- 🏗️ [Architecture Guide](../architecture/) - Understand the system design and authentication patterns

## Need Help?

- 📚 Check out the [examples folder](../../../examples/) for complete working implementations
- 🐛 Report issues on our [GitHub repository](https://github.com/your-org/idpass-data-collect)
- 🤝 Join our community discussions

Happy coding! 🚀