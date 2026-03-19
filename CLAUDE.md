# DataCollect Development Guidelines

Offline-first data management system for beneficiary data. TypeScript monorepo (pnpm workspaces) with four packages: `datacollect` (core library), `backend` (Express sync server), `admin` (Vue.js UI), `mobile` (Capacitor app).

## Principles (read before making changes)

All principles are in a `principles/*` directory

## Quick Reference

### Commands

Refer to `package.json` scripts

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

## Testing

### Running All Tests Locally

Refer to test and PR checking scripts.

### Seed Data

Refer to the seed command in `package.json`

Requires the backend to be running (default `http://localhost:3000`). Creates a "Demo Household Registry" config with 4 households, 9 individuals, and a field worker user. Safe to run multiple times (deletes and recreates). Override defaults with env vars: `BACKEND_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.

### Test Suites

Each module has its own test suite:
- DataCollect: Uses Jest with fake-indexeddb for IndexedDB testing
- Backend: Uses Jest with supertest for API testing (requires PostgreSQL)
- Admin: Uses Vitest for Vue component testing

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
- Client-side: IndexedDb
- Server-side: Postgres

## Multi-Tenant Configuration

Backend supports multiple tenants via app config files. Config structure:
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

## Known Pitfalls

- When producing audit or review reports, never force findings into round numbers. Report the actual count of issues found — artificial caps cause findings to be silently dropped or underclassified.

## Commit Checklist

Before committing:

- [ ] `pnpm pr-check` passes
- [ ] No `console.log` in `datacollect` or `backend` (use `createLogger`)
- [ ] No Node-only imports in `packages/datacollect/src/`
- [ ] No PII in log messages
- [ ] New storage adapters pass conformance tests
- [ ] New external adapters return `SyncResult` (never throw for per-entity errors)
- [ ] Conventional commit format: `feat(mobile):`, `fix(backend):`, etc.
- [ ] Single-line commit messages only — no body, description, or co-author trailers
