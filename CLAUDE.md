# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ID PASS DataCollect is a TypeScript-based offline-first data management system for household and individual beneficiary data. The project consists of three main modules:

1. **DataCollect** (`packages/datacollect`) - Main client library for offline data management using IndexedDB
2. **Backend** (`packages/backend`) - Central sync server using Express.js and PostgreSQL  
3. **Admin** (`packages/admin`) - Vue.js admin interface for the sync server

## Architecture

The system uses event sourcing and CQRS patterns with the following key concepts:

- **Events**: Commands that represent changes to entities (stored in EventStore)
- **Entities**: Current state of Groups and Individuals (stored in EntityStore)
- **FormSubmissions**: Input data that generates events
- **Sync**: Two-level sync system (Internal sync between clients/server, External sync with third-party systems)

## Common Development Commands

### DataCollect Module
```bash
cd packages/datacollect
npm install
npm run build          # Build library (required before using in other modules)
npm run test          # Run tests
npm run format        # Format code
```

### Backend Module
```bash
cd packages/backend
npm install
npm run dev           # Run development server (port 3000)
npm run build         # Build for production
npm run test          # Run tests
npm run format        # Format code
```

### Admin Module
```bash
cd packages/admin
npm install
npm run dev           # Run development server (port 5173)
npm run build         # Build for production
npm run test:unit     # Run unit tests
npm run lint          # Lint code
npm run type-check    # TypeScript type checking
npm run format        # Format code
```

### Root Level
```bash
npm test              # Run all tests across modules
```

## Testing

Each module has its own test suite:
- DataCollect: Uses Jest with fake-indexeddb for IndexedDB testing
- Backend: Uses Jest with supertest for API testing
- Admin: Uses Vitest for Vue component testing

To run a single test file:
```bash
# In any module directory
npm test -- path/to/test.spec.ts
```

## Key Architectural Patterns

### Event Sourcing Implementation
- Events are immutable records of changes stored in EventStore
- EntityStore maintains current state by applying events
- EventApplierService handles event application logic
- Custom events can be registered via `eventApplierService.registerEventApplier()`

### Synchronization Architecture
- **InternalSyncManager**: Handles client ↔ server sync with pagination (10 records/page default)
- **ExternalSyncManager**: Handles server ↔ external system sync via adapters
- Adapters available: OpenSPP, OpenFn, MockSyncServer

### Storage Adapters
- Client-side: IndexedDbEntityStorageAdapter, IndexedDbEventStorageAdapter
- Server-side: PostgresEntityStorageAdapter, PostgresEventStorageAdapter

## Environment Configuration

Copy `.env.example` to `.env` and update with your values.

### Backend (.env)
```env
POSTGRES=postgresql://admin:admin@localhost:5432/postgres
POSTGRES_TEST=postgresql://admin:admin@localhost:5432/test
ADMIN_EMAIL=admin@hdm.example
ADMIN_PASSWORD=123
JWT_SECRET=123
PORT=3000
```

### Admin (.env)
```env
VITE_API_URL=http://localhost:3000
```

## Multi-Tenant Configuration

Backend supports multiple tenants via app config files. See `examples/sample_config.json` and `examples/sample_config_2.json` for complete examples. Config structure:
```json
{
  "id": "tenant-id",
  "name": "Tenant Name",
  "entityForms": [...],
  "entityData": [...],
  "externalSync": {
    "type": "adapter-type",
    "auth": "basic",
    "url": "http://external-system"
  }
}
```

## Authentication

- Initial admin user created on first server start
- JWT-based authentication for all API endpoints
- User roles: admin (manage users), user (sync data)
- Basic auth supported for external sync

## Important Implementation Notes

1. **Event Types**: Standard events include create-group, add-member, update-individual, delete-entity
2. **Sync Levels**: LOCAL (client-only), SYNCED (synchronized with server)
3. **Conflict Resolution**: Handled via version numbers and timestamps
4. **Pagination**: Internal sync processes 10 records per page by default
5. **Error Handling**: AppError class for consistent error management

## Docker Deployment

Docker Compose setup available for full stack deployment including OpenSPP integration. Before running, copy the example environment files:

```bash
cd docker
cp .env.example .env
# For OpenSPP integration (optional):
cp odoo.env.example odoo.env
cp odoo_postgresql.env.example odoo_postgresql.env
# Edit the .env files with your configuration
docker-compose up
```

See `docker/README.md` for detailed configuration options.