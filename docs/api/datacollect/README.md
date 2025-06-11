**ID PASS DataCollect API Documentation v0.0.1**

***

# ID PASS DataCollect

> Offline-first data management library for household and individual beneficiary data

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)

## Overview

ID PASS DataCollect is a TypeScript library that provides a comprehensive offline-first data management system with event sourcing, CQRS patterns, and multi-level synchronization capabilities. It's designed for household and individual beneficiary data management with support for both browser (IndexedDB) and server (PostgreSQL) environments.

## Key Features

- **Offline-First Architecture**: Full functionality without network connectivity
- **Event Sourcing**: Complete audit trail with tamper-evident Merkle tree verification
- **CQRS Pattern**: Separate command and query responsibilities
- **Multi-Level Sync**: Client ↔ Server ↔ External Systems
- **Pluggable Storage**: IndexedDB for browsers, PostgreSQL for servers
- **Cryptographic Integrity**: SHA256-based Merkle tree for data verification
- **Duplicate Detection**: Automatic detection of potential duplicate entities
- **External Integration**: Built-in adapters for OpenSPP and other systems

## Installation

```bash
npm install idpass-data-collect
```

## Quick Start

### Browser Environment

```typescript
import { 
  EntityDataManager, 
  EventStoreImpl, 
  EntityStoreImpl,
  EventApplierService,
  IndexedDbEntityStorageAdapter,
  IndexedDbEventStorageAdapter,
  SyncLevel
} from 'idpass-data-collect';

// Initialize storage adapters
const entityAdapter = new IndexedDbEntityStorageAdapter('tenant-123');
const eventAdapter = new IndexedDbEventStorageAdapter('tenant-123');

// Initialize stores
const entityStore = new EntityStoreImpl(entityAdapter);
const eventStore = new EventStoreImpl('user-456', eventAdapter);
const eventApplierService = new EventApplierService('user-456', eventStore, entityStore);

// Initialize manager
const manager = new EntityDataManager(eventStore, entityStore, eventApplierService);

// Initialize everything
await Promise.all([
  entityStore.initialize(),
  eventStore.initialize()
]);

// Create an individual
const individual = await manager.submitForm({
  guid: 'form-123',
  entityGuid: 'person-456', 
  type: 'create-individual',
  data: { name: 'John Doe', age: 30 },
  timestamp: new Date().toISOString(),
  userId: 'user-456',
  syncLevel: SyncLevel.LOCAL
});
```

### Server Environment

```typescript
import { 
  EntityDataManager,
  EventStoreImpl,
  EntityStoreImpl,
  EventApplierService,
  PostgresEntityStorageAdapter,
  PostgresEventStorageAdapter
} from 'idpass-data-collect';

// Initialize PostgreSQL adapters
const entityAdapter = new PostgresEntityStorageAdapter(
  'postgresql://user:pass@localhost:5432/datacollect',
  'tenant-123'
);
const eventAdapter = new PostgresEventStorageAdapter(
  'postgresql://user:pass@localhost:5432/datacollect', 
  'tenant-123'
);

// Initialize stores and manager
const entityStore = new EntityStoreImpl(entityAdapter);
const eventStore = new EventStoreImpl('system', eventAdapter);
const eventApplierService = new EventApplierService('system', eventStore, entityStore);
const manager = new EntityDataManager(eventStore, entityStore, eventApplierService);
```

## Core Concepts

### Event Sourcing
All changes to entities are stored as immutable events with cryptographic integrity verification:

```typescript
// Events create the audit trail
const createEvent = {
  guid: 'event-123',
  entityGuid: 'person-456',
  type: 'create-individual',
  data: { name: 'John Doe', age: 30 },
  timestamp: new Date().toISOString(),
  userId: 'user-123',
  syncLevel: SyncLevel.LOCAL
};

// Submit the event
const entity = await manager.submitForm(createEvent);
```

### Entity State Management
Entities maintain both initial state (from last sync) and current state (after applying events):

```typescript
const entityPair = await manager.getEntity('person-456');
console.log('Initial state:', entityPair.initial);   // State when loaded/synced
console.log('Current state:', entityPair.modified);  // Current state after events
console.log('Has changes:', entityPair.initial.version !== entityPair.modified.version);
```

### Synchronization
Multi-level sync supports offline operations with eventual consistency:

```typescript
// Check for local changes
if (await manager.hasUnsyncedEvents()) {
  console.log(`${await manager.getUnsyncedEventsCount()} events to sync`);
  
  // Sync with server
  await manager.syncWithSyncServer();
}

// Sync with external systems
await manager.syncWithExternalSystem({
  username: 'sync_user',
  password: 'sync_password'
});
```

## API Documentation

For complete API documentation, see the generated TypeDoc documentation.

## Architecture

The library follows Domain-Driven Design principles with clear separation of concerns:

- **EntityDataManager**: Main API facade
- **EventStore**: Immutable event storage with Merkle tree integrity
- **EntityStore**: Current entity state with change tracking
- **EventApplierService**: Event sourcing engine
- **SyncManagers**: Internal and external synchronization
- **Storage Adapters**: Pluggable persistence layer

## Contributing

See the main project [Contributing Guide](_media/CONTRIBUTING.md) for development setup and guidelines.

## License

Licensed under the Apache License 2.0. See [LICENSE](_media/LICENSE) for details.
