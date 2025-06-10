/*
 * Licensed to the Association pour la cooperation numerique (ACN) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ACN licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * ID PASS Data Collect - Offline-first data management library for household and individual beneficiary data.
 * 
 * This is the main entry point for the ID PASS Data Collect library, providing a comprehensive
 * offline-first data management system with event sourcing, CQRS patterns, and multi-level
 * synchronization capabilities.
 * 
 * ## Core Architecture
 * 
 * The library implements event sourcing and CQRS patterns with the following key concepts:
 * 
 * - **Events**: Commands that represent changes to entities (stored in EventStore)
 * - **Entities**: Current state of Groups and Individuals (stored in EntityStore)
 * - **FormSubmissions**: Input data that generates events
 * - **Sync**: Multi-level sync system (Internal sync between clients/server, External sync with third-party systems)
 * 
 * ## Quick Start
 * 
 * ### Browser Setup (IndexedDB)
 * ```typescript
 * import { 
 *   EntityDataManager, 
 *   EventStoreImpl, 
 *   EntityStore,
 *   EventApplierService,
 *   IndexedDbEntityStorageAdapter,
 *   IndexedDbEventStorageAdapter,
 *   SyncLevel,
 *   EntityType
 * } from 'idpass-datacollect';
 * 
 * // Initialize storage adapters
 * const entityAdapter = new IndexedDbEntityStorageAdapter('tenant-123');
 * const eventAdapter = new IndexedDbEventStorageAdapter('tenant-123');
 * 
 * // Initialize stores
 * const entityStore = new EntityStore(entityAdapter);
 * const eventStore = new EventStoreImpl('user-456', eventAdapter);
 * const eventApplierService = new EventApplierService('user-456', eventStore, entityStore);
 * 
 * // Initialize manager
 * const manager = new EntityDataManager(eventStore, entityStore, eventApplierService);
 * 
 * // Initialize everything
 * await Promise.all([
 *   entityStore.initialize(),
 *   eventStore.initialize()
 * ]);
 * 
 * // Create an individual
 * const individual = await manager.submitForm({
 *   guid: 'form-123',
 *   entityGuid: 'person-456',
 *   type: 'create-individual',
 *   data: { name: 'John Doe', age: 30 },
 *   timestamp: new Date().toISOString(),
 *   userId: 'user-456',
 *   syncLevel: SyncLevel.LOCAL
 * });
 * ```
 * 
 * ### Server Setup (PostgreSQL)
 * ```typescript
 * import { 
 *   EntityDataManager,
 *   EventStoreImpl,
 *   EntityStore,
 *   EventApplierService,
 *   PostgresEntityStorageAdapter,
 *   PostgresEventStorageAdapter,
 *   InternalSyncManager
 * } from 'idpass-datacollect';
 * 
 * // Initialize PostgreSQL adapters
 * const entityAdapter = new PostgresEntityStorageAdapter(
 *   'postgresql://user:pass@localhost:5432/datacollect',
 *   'tenant-123'
 * );
 * const eventAdapter = new PostgresEventStorageAdapter(
 *   'postgresql://user:pass@localhost:5432/datacollect',
 *   'tenant-123'
 * );
 * 
 * // Initialize with sync capability
 * const entityStore = new EntityStore(entityAdapter);
 * const eventStore = new EventStoreImpl('system', eventAdapter);
 * const eventApplierService = new EventApplierService('system', eventStore, entityStore);
 * const syncManager = new InternalSyncManager(
 *   eventStore,
 *   entityStore, 
 *   eventApplierService,
 *   'https://sync.example.com',
 *   'jwt-token'
 * );
 * 
 * const manager = new EntityDataManager(
 *   eventStore, 
 *   entityStore, 
 *   eventApplierService,
 *   undefined, // external sync
 *   syncManager
 * );
 * ```
 * 
 * ### With External Sync (OpenSPP)
 * ```typescript
 * import { 
 *   ExternalSyncManager,
 *   ExternalSyncConfig 
 * } from 'idpass-datacollect';
 * 
 * const opensppConfig: ExternalSyncConfig = {
 *   type: 'openspp',
 *   url: 'http://openspp.example.com',
 *   database: 'openspp_db'
 * };
 * 
 * const externalSync = new ExternalSyncManager(
 *   eventStore,
 *   eventApplierService,
 *   opensppConfig
 * );
 * 
 * await externalSync.initialize();
 * await externalSync.synchronize({
 *   username: 'sync_user',
 *   password: 'sync_password'
 * });
 * ```
 * 
 * ## Key Components
 * 
 * - **EntityDataManager**: Main API interface for all operations
 * - **EventStore/EntityStore**: Core data persistence with pluggable adapters
 * - **EventApplierService**: Event sourcing engine that applies events to entities
 * - **InternalSyncManager**: Bidirectional sync with DataCollect servers
 * - **ExternalSyncManager**: Integration with external systems (OpenSPP, etc.)
 * - **Storage Adapters**: IndexedDB (browser) and PostgreSQL (server) implementations
 * 
 * ## Storage Adapters Available
 * 
 * - **IndexedDbEntityStorageAdapter**: Browser-based entity storage
 * - **IndexedDbEventStorageAdapter**: Browser-based event storage  
 * - **PostgresEntityStorageAdapter**: Server-based entity storage with JSONB
 * - **PostgresEventStorageAdapter**: Server-based event storage with full ACID support
 * 
 * @example
 * Full workflow example:
 * ```typescript
 * // Create a household with members
 * const household = await manager.submitForm({
 *   guid: 'form-001',
 *   entityGuid: 'household-123',
 *   type: 'create-group',
 *   data: {
 *     name: 'Smith Family',
 *     address: '123 Main St, Boston, MA',
 *     members: [
 *       { guid: 'person-001', name: 'John Smith', age: 45, type: 'individual' },
 *       { guid: 'person-002', name: 'Jane Smith', age: 42, type: 'individual' },
 *       { guid: 'person-003', name: 'Bob Smith', age: 16, type: 'individual' }
 *     ]
 *   },
 *   timestamp: new Date().toISOString(),
 *   userId: 'social-worker-456',
 *   syncLevel: SyncLevel.LOCAL
 * });
 * 
 * // Query data
 * const allEntities = await manager.getAllEntities();
 * const searchResults = await manager.searchEntities([
 *   { "data.age": { $gte: 18 } },
 *   { "type": "individual" }
 * ]);
 * 
 * // Sync with server (if configured)
 * if (await manager.hasUnsyncedEvents()) {
 *   await manager.syncWithSyncServer();
 * }
 * 
 * // Get audit trail
 * const auditTrail = await manager.getAuditTrailByEntityGuid('household-123');
 * ```
 */

// Core Management Components
export * from "./components/EntityDataManager";
export * from "./components/EntityStore";
export * from "./components/EventStore";

// Synchronization Components  
export * from "./components/InternalSyncManager";
export * from "./components/ExternalSyncManager";
export * from "./components/SyncAdapter";

// Core Services
export * from "./services/EventApplierService";

// Storage Adapters
export * from "./storage/IndexedDbEntityStorageAdapter";
export * from "./storage/IndexedDbEventStorageAdapter";
export * from "./storage/PostgresEntityStorageAdapter";
export * from "./storage/PostgresEventStorageAdapter";

// Type Definitions and Interfaces
export * from "./interfaces/types";
