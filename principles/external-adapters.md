# External Sync Adapter Principles

Guidelines for implementing `ExternalSyncAdapterV2` (e.g. the OpenSPP adapter).

## Interface Contract

All adapters must implement `ExternalSyncAdapterV2` from `interfaces/adapter.ts`:

```typescript
interface ExternalSyncAdapterV2 {
  descriptor(): AdapterDescriptor;
  initialize(config: Record<string, unknown>): Promise<void>;
  healthCheck(): Promise<HealthCheckResult>;
  push(entities: EntityPushPayload[]): Promise<SyncResult>;
  pull(since?: string): Promise<SyncResult>;
  pushAttachments?(...): Promise<SyncResult>; // optional
  disconnect(): Promise<void>;
}
```

## Configuration Validation

Use Zod in `descriptor().configSchema` to validate config at startup. Fail fast with a clear error if required fields are missing — do not silently fall back to defaults.

## SyncResult

Always return a structured `SyncResult`. Never throw for per-entity errors:

```typescript
// Good: record failure per entity
errors.push({ entityGuid: guid, code: 'NOT_FOUND', message: '...', retryable: true });

// Bad: throw and abort the whole batch
throw new Error(`Entity ${guid} not found`);
```

Set `retryable: true` for transient errors (network, rate limit), `false` for permanent ones (invalid data, auth failure).

## Health Checks

Call `healthCheck()` before bulk operations. The `ExternalSyncManager` does this automatically, but adapters must implement it meaningfully — a real connectivity probe, not just `return { healthy: true }`.

## OpenSPP V2 Adapter

The OpenSPP V2 adapter lives in:
`packages/datacollect/src/components/openspp-v2/`

- Uses the OpenSPP REST API V2 (see `API_V2_GUIDE.md` in the same directory)
- Maps DataCollect `EntityDoc` ↔ OpenSPP Individual/Group
- Handles G2P Connect external identifier namespaces
- Auth: Basic auth configured via adapter config

When working on OpenSPP integration, read `API_V2_GUIDE.md` and `openapi.yaml` in that directory first.

## Placement

External adapters belong in `packages/datacollect/src/components/` (not in `backend`), since the adapter logic itself is platform-neutral. The `ExternalSyncManager` in `backend` wires them up with server-side scheduling.
