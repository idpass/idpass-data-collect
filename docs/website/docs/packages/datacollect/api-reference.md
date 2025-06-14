---
id: datacollect-api-reference
title: API Reference
sidebar_position: 2
---

# DataCollect API Reference

Complete TypeScript API documentation for the DataCollect package.

## Generated API Documentation

The complete API reference is automatically generated from TypeScript source code and integrated directly into this documentation site. You can browse the full API documentation in the sidebar under **DataCollect > API Reference**.

**Key sections:**
- **Classes** - Main API classes like EntityDataManager, EventStore, EntityStore
- **Interfaces** - TypeScript interfaces for data structures and contracts
- **Types** - Type definitions and enums
- **Functions** - Utility functions and helpers

## Core Classes

### EntityDataManager
The main entry point for all data operations.

```typescript
class EntityDataManager {
  constructor(
    eventStore: EventStore,
    entityStore: EntityStore,
    syncAdapter: SyncAdapter,
    internalSyncManager: InternalSyncManager,
    eventApplierService: EventApplierService
  )

  // Submit form data and apply events
  async submitForm(form: FormSubmission): Promise<EntityDoc>
  
  // Get entity by ID
  async getEntity(id: string): Promise<EntityDoc | null>
  
  // Search entities with criteria
  async searchEntities(criteria: SearchCriteria): Promise<EntityDoc[]>
  
  // Synchronization operations
  async syncToServer(): Promise<void>
  async syncFromServer(): Promise<void>
}
```

[View detailed EntityDataManager documentation →](./api/classes/EntityDataManager)

### EventStore
Manages the immutable event log with cryptographic integrity.

```typescript
interface EventStore {
  // Add new event to the store
  async addEvent(event: FormSubmission): Promise<void>
  
  // Get events with pagination
  async getEvents(offset?: number, limit?: number): Promise<FormSubmission[]>
  
  // Get events for specific entity
  async getEventsForEntity(entityId: string): Promise<FormSubmission[]>
  
  // Merkle tree operations
  async getMerkleRoot(): Promise<string>
  async verifyIntegrity(): Promise<boolean>
}
```

[View detailed EventStore documentation →](./api/interfaces/EventStore)

### EntityStore
Manages current state of all entities.

```typescript
interface EntityStore {
  // Save entity state
  async saveEntity(entity: EntityDoc): Promise<void>
  
  // Get entity by ID or GUID
  async getEntity(id: string): Promise<EntityDoc | null>
  async getEntityByGuid(guid: string): Promise<EntityDoc | null>
  
  // Search operations
  async searchEntities(criteria: SearchCriteria): Promise<EntityDoc[]>
  
  // Bulk operations
  async getAllEntities(): Promise<EntityDoc[]>
  async deleteEntity(id: string): Promise<void>
}
```

[View detailed EntityStore documentation →](./api/interfaces/EntityStore)

## Key Interfaces

### FormSubmission
Represents a form submission that generates events.

```typescript
interface FormSubmission {
  guid: string;           // Unique form identifier
  entityGuid: string;     // Target entity identifier
  type: string;          // Event type (create-group, add-member, etc.)
  data: any;             // Form data payload
  timestamp: string;      // ISO timestamp
  userId: string;        // User who submitted
  syncLevel: SyncLevel;  // LOCAL or SYNCED
}
```

### EntityDoc
Base interface for all entities (Groups and Individuals).

```typescript
interface EntityDoc {
  id: string;            // Internal ID
  guid: string;          // External identifier
  type: EntityType;      // GROUP or INDIVIDUAL
  version: number;       // Version for conflict resolution
  data: any;            // Entity data
  lastUpdated: string;   // ISO timestamp
}
```

### SearchCriteria
Flexible search parameters for entity queries.

```typescript
type SearchCriteria = {
  type?: EntityType;     // Filter by entity type
  name?: string;         // Search by name
  userId?: string;       // Filter by user
  syncLevel?: SyncLevel; // Filter by sync status
  // Custom field searches supported
}
```

## Storage Adapters

### IndexedDB Adapters
Client-side storage for offline operation.

```typescript
class IndexedDbEventStorageAdapter implements EventStorageAdapter {
  async initialize(): Promise<void>
  async addEvent(event: FormSubmission): Promise<void>
  async getEvents(offset?: number, limit?: number): Promise<FormSubmission[]>
  // ... more methods
}

class IndexedDbEntityStorageAdapter implements EntityStorageAdapter {
  async initialize(): Promise<void>
  async saveEntity(entity: EntityDoc): Promise<void>
  async getEntity(id: string): Promise<EntityDoc | null>
  // ... more methods
}
```

### PostgreSQL Adapters
Server-side storage for centralized data.

```typescript
class PostgresEventStorageAdapter implements EventStorageAdapter
class PostgresEntityStorageAdapter implements EntityStorageAdapter
```

## Synchronization

### InternalSyncManager
Handles client-server synchronization.

```typescript
class InternalSyncManager {
  constructor(
    eventStore: EventStore,
    eventApplierService: EventApplierService,
    serverUrl: string,
    authToken: string
  )

  async pushToServer(): Promise<void>
  async pullFromServer(): Promise<void>
  async fullSync(): Promise<void>
}
```

## Examples

### Creating a Group
```typescript
const formData: FormSubmission = {
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: "create-group",
  data: { 
    name: "Smith Family",
    location: "Village A"
  },
  timestamp: new Date().toISOString(),
  userId: "user-123",
  syncLevel: SyncLevel.LOCAL,
};

const group = await manager.submitForm(formData);
```

### Adding Members
```typescript
const members = [
  { guid: uuidv4(), name: "John Smith", relationship: "Head" },
  { guid: uuidv4(), name: "Jane Smith", relationship: "Spouse" }
];

const addMemberForm: FormSubmission = {
  guid: uuidv4(),
  entityGuid: group.guid,
  type: "add-member",
  data: { members },
  timestamp: new Date().toISOString(),
  userId: "user-123",
  syncLevel: SyncLevel.LOCAL,
};

await manager.submitForm(addMemberForm);
```

### Searching Entities
```typescript
const groups = await manager.searchEntities({
  type: EntityType.Group,
  name: "Smith"
});

const individuals = await manager.searchEntities({
  type: EntityType.Individual,
  userId: "user-123"
});
```

## Working Examples

For complete working examples, see:
- 📁 [API Examples](./api/examples/README) - Complete code examples from the API documentation
- 🔧 [Configuration Examples](./configuration.md) - Setup and initialization
- 🎯 [Tutorial Examples](./tutorials/) - Step-by-step implementations

## TypeScript Support

The DataCollect package is written in TypeScript and provides complete type definitions for:
- All public APIs
- Configuration options
- Event and entity interfaces
- Storage adapter contracts

Enable strict TypeScript checking for the best development experience.