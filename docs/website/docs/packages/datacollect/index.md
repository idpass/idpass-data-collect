---
id: datacollect-overview
title: DataCollect Package
sidebar_position: 1
---

# DataCollect Package

The DataCollect package is the core client library for ID PASS DataCollect, providing offline-first data management capabilities for household and individual beneficiary data.

## Overview

DataCollect implements event sourcing and CQRS patterns to create a robust, auditable system for managing complex data structures while supporting offline operation.

### Key Features

- 🗄️ **Offline-First**: Full functionality without internet connectivity using IndexedDB
- 📝 **Event Sourcing**: Complete audit trail with ability to replay state changes
- 🔄 **Synchronization**: Bi-directional sync with central server
- 🔐 **Encryption**: Client-side data encryption support
- 📱 **Cross-Platform**: Works in browsers, React Native, and Electron apps

## Core Components

### EntityDataManager
Central orchestrator for all data operations, providing a clean API for:
- Form submission processing
- Entity state management
- Synchronization coordination

### EventStore & EntityStore
- **EventStore**: Immutable event log with Merkle tree integrity
- **EntityStore**: Current state of all entities (Groups and Individuals)

### Sync Managers
- **InternalSyncManager**: Client ↔ Server synchronization
- **ExternalSyncManager**: Server ↔ External system integration

## Quick Start

### Installation

```bash
cd dataCollect
npm install
npm run build
```

### Basic Usage

```typescript
import {
  EntityDataManager,
  IndexedDbEntityStorageAdapter,
  IndexedDbEventStorageAdapter,
  EventStoreImpl,
  EntityStoreImpl,
  EventApplierService,
  InternalSyncManager,
  SyncAdapterImpl
} from 'datacollect';

// Initialize stores
const eventStore = new EventStoreImpl(userId, new IndexedDbEventStorageAdapter());
const entityStore = new EntityStoreImpl(new IndexedDbEntityStorageAdapter());
await eventStore.initialize();
await entityStore.initialize();

// Set up services
const eventApplierService = new EventApplierService(userId, eventStore, entityStore);
const internalSyncManager = new InternalSyncManager(
  eventStore,
  eventApplierService,
  'http://your-sync-server.com',
  'your-auth-token'
);

// Create the main manager
const manager = new EntityDataManager(
  eventStore,
  entityStore,
  new SyncAdapterImpl(''),
  internalSyncManager,
  eventApplierService
);
```

<!-- ## Documentation Sections

### [API Reference](./api-reference.md)
Complete TypeScript API documentation with examples

### [Tutorials](./tutorials/)
Step-by-step guides for common use cases:
- Creating your first DataCollection app
- Implementing custom event types
- Setting up offline-online synchronization

### [Configuration](./configuration.md)
Configuration options and environment setup

### [Examples](./examples/)
Working code examples for different scenarios -->

## Architecture Integration

DataCollect works as part of the larger ID PASS ecosystem:

```mermaid
graph LR
    A[DataCollect Client] -->|Sync Events| B[Backend Server]
    B -->|Return Events| A
    B -->|External Sync| C[OpenSPP/OpenFn]
    D[Admin Interface] -->|Manage Users| B
```

## Performance Characteristics

- **Storage**: Efficient IndexedDB usage with pagination
- **Memory**: Event streaming with configurable batch sizes
- **Sync**: Incremental synchronization with conflict resolution
- **Scalability**: Tested with 10,000+ entities per client

## Browser Support

- Chrome 60+
- Firefox 60+
- Safari 12+
- Edge 79+

## Next Steps

- 📖 [Tutorials](./datacollect-tutorials/) - Learn by building
- 🚀 [Backend Package](../backend/) - Add server synchronization
- 👥 [Admin Package](../admin/) - Complete management solution