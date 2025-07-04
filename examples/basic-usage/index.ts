// Add browser environment setup for Node.js
import "fake-indexeddb/auto";
import "core-js/stable/structured-clone";

// Mock window object for Node.js environment
if (typeof window === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as unknown as { window: any }).window = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    indexedDB: (global as any).indexedDB,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    IDBRequest: (global as any).IDBRequest,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    IDBOpenDBRequest: (global as any).IDBOpenDBRequest,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    IDBTransaction: (global as any).IDBTransaction,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    IDBDatabase: (global as any).IDBDatabase,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    IDBObjectStore: (global as any).IDBObjectStore,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    IDBIndex: (global as any).IDBIndex,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    IDBCursor: (global as any).IDBCursor,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    IDBCursorWithValue: (global as any).IDBCursorWithValue,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    IDBKeyRange: (global as any).IDBKeyRange,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    IDBVersionChangeEvent: (global as any).IDBVersionChangeEvent,
  };
}

// BEGIN example code
import {
  EntityDataManager,
  IndexedDbEntityStorageAdapter,
  IndexedDbEventStorageAdapter,
  IndexedDbAuthStorageAdapter,
  EventApplierService,
  EventStoreImpl,
  EntityStoreImpl,
  InternalSyncManager,
  FormSubmission,
  SyncLevel,
} from "idpass-data-collect";
import { v4 as uuidv4 } from "uuid";

async function main() {
  // Initialize the data manager
  const userId = "demo-user";
  const tenantId = "demo-tenant";

  // Set up storage adapters
  const entityAdapter = new IndexedDbEntityStorageAdapter(tenantId);
  const eventAdapter = new IndexedDbEventStorageAdapter(tenantId);
  const authAdapter = new IndexedDbAuthStorageAdapter(tenantId);

  // Initialize storage adapters
  await Promise.all([entityAdapter.initialize(), eventAdapter.initialize(), authAdapter.initialize()]);

  // Set up event store
  const eventStore = new EventStoreImpl(eventAdapter);
  await eventStore.initialize();

  // Set up entity store
  const entityStore = new EntityStoreImpl(entityAdapter);
  await entityStore.initialize();

  // Set up event applier service
  const eventApplierService = new EventApplierService(eventStore, entityStore);

  // Set up sync (optional - can work offline without this)
  const internalSyncManager = new InternalSyncManager(
    eventStore,
    entityStore,
    eventApplierService,
    "http://localhost:3000", // Your sync server URL
    authAdapter, // Auth storage adapter instead of token string
    "default", // Config ID (optional, defaults to "default")
  );

  // Create the entity data manager
  const manager = new EntityDataManager(
    eventStore,
    entityStore,
    eventApplierService,
    undefined, // externalSyncManager (optional)
    internalSyncManager, // internalSyncManager (optional)
    undefined, // authManager (optional)
  );

  // Example 1: Create a household group
  console.log("Creating household group...");
  const createGroupForm: FormSubmission = {
    guid: uuidv4(),
    type: "create-group",
    entityGuid: uuidv4(),
    data: {
      name: "Smith Family",
      address: "123 Main St",
      city: "Springfield",
    },
    timestamp: new Date().toISOString(),
    userId: userId,
    syncLevel: SyncLevel.LOCAL,
  };

  const group = await manager.submitForm(createGroupForm);
  console.log("Created group:", group);

  // Example 2: Add members to the household
  console.log("Adding family members...");
  const members = [
    {
      guid: uuidv4(),
      name: "John Smith",
      dateOfBirth: "1980-01-15",
      relationship: "Head",
    },
    {
      guid: uuidv4(),
      name: "Jane Smith",
      dateOfBirth: "1982-03-20",
      relationship: "Spouse",
    },
    {
      guid: uuidv4(),
      name: "Alice Smith",
      dateOfBirth: "2010-07-10",
      relationship: "Child",
    },
  ];

  if (!group) {
    throw new Error("Group not found");
  }
  const addMembersForm: FormSubmission = {
    guid: uuidv4(),
    entityGuid: group.guid,
    type: "add-member",
    data: { members },
    timestamp: new Date().toISOString(),
    userId: userId,
    syncLevel: SyncLevel.LOCAL,
  };

  const updatedGroup = await manager.submitForm(addMembersForm);
  console.log("Updated group with members:", updatedGroup);

  // Example 3: Create an individual record (not part of a group)
  console.log("Creating individual record...");
  const createIndividualForm: FormSubmission = {
    guid: uuidv4(),
    entityGuid: uuidv4(),
    type: "create-individual",
    data: {
      name: "Bob Johnson",
      dateOfBirth: "1990-05-25",
      phoneNumber: "+1234567890",
    },
    timestamp: new Date().toISOString(),
    userId: userId,
    syncLevel: SyncLevel.LOCAL,
  };

  const individual = await manager.submitForm(createIndividualForm);
  console.log("Created individual:", individual);

  // Example 4: Update individual data
  console.log("Updating individual data...");
  if (!individual) {
    throw new Error("Individual not found");
  }
  const updateForm: FormSubmission = {
    guid: uuidv4(),
    entityGuid: individual.guid,
    type: "update-individual",
    data: {
      phoneNumber: "+0987654321",
      email: "bob.johnson@example.com",
    },
    timestamp: new Date().toISOString(),
    userId: userId,
    syncLevel: SyncLevel.LOCAL,
  };

  const updatedIndividual = await manager.submitForm(updateForm);
  console.log("Updated individual:", updatedIndividual);

  // Example 5: Sync with server (if configured)
  if (internalSyncManager) {
    console.log("Syncing with server...");
    try {
      await internalSyncManager.sync();
      console.log("Sync completed successfully");
    } catch (error) {
      console.error("Sync failed:", error);
    }
  }
}

// Run the example
main().catch(console.error);
