import {
  EntityDataManager,
  IndexedDbEntityStorageAdapter,
  IndexedDbEventStorageAdapter,
  SyncAdapterImpl,
  EventApplierService,
  EventStoreImpl,
  EntityStoreImpl,
  InternalSyncManager,
  FormSubmission,
  SyncLevel,
} from 'idpass-data-collect';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  // Initialize the data manager
  const userId = 'demo-user';
  
  // Set up event store
  const eventStore = new EventStoreImpl(userId, new IndexedDbEventStorageAdapter());
  await eventStore.initialize();
  
  // Set up entity store
  const entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
  await entityStore.initialize();
  
  // Set up event applier service
  const eventApplierService = new EventApplierService(userId, eventStore, entityStore);
  
  // Set up sync (optional - can work offline without this)
  const internalSyncManager = new InternalSyncManager(
    eventStore,
    eventApplierService,
    'http://localhost:3000', // Your sync server URL
    '' // Auth token (if required)
  );
  
  const syncAdapter = new SyncAdapterImpl('');
  
  // Create the entity data manager
  const manager = new EntityDataManager(
    eventStore,
    entityStore,
    syncAdapter,
    internalSyncManager,
    eventApplierService
  );
  
  // Example 1: Create a household group
  console.log('Creating household group...');
  const createGroupForm: FormSubmission = {
    guid: uuidv4(),
    type: 'create-group',
    entityGuid: uuidv4(),
    data: { 
      name: 'Smith Family',
      address: '123 Main St',
      city: 'Springfield'
    },
    timestamp: new Date().toISOString(),
    userId: userId,
    syncLevel: SyncLevel.LOCAL,
  };
  
  const group = await manager.submitForm(createGroupForm);
  console.log('Created group:', group);
  
  // Example 2: Add members to the household
  console.log('Adding family members...');
  const members = [
    { 
      guid: uuidv4(), 
      name: 'John Smith',
      dateOfBirth: '1980-01-15',
      relationship: 'Head'
    },
    { 
      guid: uuidv4(), 
      name: 'Jane Smith',
      dateOfBirth: '1982-03-20',
      relationship: 'Spouse'
    },
    { 
      guid: uuidv4(), 
      name: 'Alice Smith',
      dateOfBirth: '2010-07-10',
      relationship: 'Child'
    }
  ];
  
  const addMembersForm: FormSubmission = {
    guid: uuidv4(),
    entityGuid: group.guid,
    type: 'add-member',
    data: { members },
    timestamp: new Date().toISOString(),
    userId: userId,
    syncLevel: SyncLevel.LOCAL,
  };
  
  const updatedGroup = await manager.submitForm(addMembersForm);
  console.log('Updated group with members:', updatedGroup);
  
  // Example 3: Create an individual record (not part of a group)
  console.log('Creating individual record...');
  const createIndividualForm: FormSubmission = {
    guid: uuidv4(),
    entityGuid: uuidv4(),
    type: 'create-individual',
    data: { 
      name: 'Bob Johnson',
      dateOfBirth: '1990-05-25',
      phoneNumber: '+1234567890'
    },
    timestamp: new Date().toISOString(),
    userId: userId,
    syncLevel: SyncLevel.LOCAL,
  };
  
  const individual = await manager.submitForm(createIndividualForm);
  console.log('Created individual:', individual);
  
  // Example 4: Update individual data
  console.log('Updating individual data...');
  const updateForm: FormSubmission = {
    guid: uuidv4(),
    entityGuid: individual.guid,
    type: 'update-individual',
    data: { 
      phoneNumber: '+0987654321',
      email: 'bob.johnson@example.com'
    },
    timestamp: new Date().toISOString(),
    userId: userId,
    syncLevel: SyncLevel.LOCAL,
  };
  
  const updatedIndividual = await manager.submitForm(updateForm);
  console.log('Updated individual:', updatedIndividual);
  
  // Example 5: Sync with server (if configured)
  if (internalSyncManager) {
    console.log('Syncing with server...');
    try {
      await internalSyncManager.sync();
      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }
}

// Run the example
main().catch(console.error);