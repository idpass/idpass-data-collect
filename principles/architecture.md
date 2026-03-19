# Architecture Principles

## Package Layout

```
packages/
  datacollect/   Core library — TypeScript, platform-neutral, consumed by all clients
  backend/       Express sync server — Node only, uses Postgres
  admin/         Vue.js admin UI — browser only, talks to backend
  mobile/        Capacitor/Ionic mobile app — browser+native
```

### Dependency Rules

- `datacollect` has **no dependency** on `backend`, `admin`, or `mobile`
- `backend` and `mobile` depend on `datacollect`
- `admin` talks to `backend` via HTTP only — no direct code dependency

Never import from `backend` inside `datacollect`. The library must remain usable in browser environments.

## Offline-First Design

DataCollect is offline-first: all writes go to local storage first and sync later.

- All entity mutations go through `EventStore` — never write directly to `EntityStore`
- Events are marked `SyncLevel.LOCAL` until confirmed synced
- UI should function fully without a network connection
- Sync is an explicit operation, not a background side effect

## Package Naming

Workspace packages use `@idpass/` scope:

- `@idpass/data-collect-core` — `packages/datacollect`
- `@idpass/data-collect-backend` — `packages/backend`
- `@idpass/data-collect-admin` — `packages/admin`
- `@idpass/data-collect-mobile` — `packages/mobile`

## Key Directories

| Path | Purpose |
|------|---------|
| `packages/datacollect/src/interfaces/` | Core TypeScript types and adapter contracts |
| `packages/datacollect/src/components/` | Stateful managers (EventStore, EntityStore, SyncManagers) |
| `packages/datacollect/src/services/` | Stateless services (EventApplierService, RbacService, etc.) |
| `packages/datacollect/src/storage/` | Storage adapter implementations |
| `packages/backend/src/routes/` | Express route handlers |
| `packages/backend/src/stores/` | Server-side storage wiring |
