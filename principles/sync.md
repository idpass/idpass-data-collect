# Sync Principles

DataCollect has two distinct sync layers. Keep them separate — they have different contracts.

## Internal Sync (Client ↔ Server)

Managed by `InternalSyncManager`. Syncs events and entities between DataCollect clients and the DataCollect backend.

- **Push**: sends `SyncLevel.LOCAL` events to server, marks them `SYNCED`
- **Pull**: fetches new events from server, applies them locally
- **Pagination**: 10 events per page by default
- **Auth**: JWT, with automatic token refresh via `login()`

Typical flow:
```typescript
await syncManager.login(email, password);
await syncManager.sync(); // push then pull
```

Or manually:
```typescript
await syncManager.pushToRemote();
await syncManager.pullFromRemote();
```

## External Sync (Server ↔ Third-Party)

Managed by `ExternalSyncManager` using `ExternalSyncAdapterV2` implementations. Syncs entities from the DataCollect backend to external systems (OpenSPP, OpenFn, etc.).

- Runs server-side only
- Configured per-tenant in the app config (`externalSync` block)
- Adapter is selected by `type` (e.g. `"openspp-v2"`)
- Results are structured `SyncResult` objects — always check `errors[]`

Available adapters: `openspp`, `openspp-v2`, `openfn`, `mock`

## Key Rules

- Never call `ExternalSyncManager` from client-side code
- Never bypass `InternalSyncManager` to write events directly to the server
- External sync failures must not corrupt local state — adapters are push-only from the server's perspective
- Always implement `healthCheck()` in new adapters and call it before bulk sync operations
