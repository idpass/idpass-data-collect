---
id: authenticated-synchronization
title: Authenticated Synchronization
sidebar_position: 5
---

# Authenticated Synchronization

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
