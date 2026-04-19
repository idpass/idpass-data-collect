---
id: building-an-adapter
title: Building an External Sync Adapter
sidebar_label: Building an Adapter
description: Step-by-step guide to writing a DataCollect V2 external sync adapter, using the mock registry server as the reference.
---

# Building an External Sync Adapter

This guide walks through building a V2 external sync adapter for ID PASS DataCollect. We use the [mock registry server](https://github.com/idpass/idpass-datacollect/tree/main/examples/mock-server) as the target registry and [`@idpass/adapter-mock`](https://github.com/idpass/idpass-datacollect/tree/main/packages/adapter-mock) as the reference implementation.

## What an adapter does

An external sync adapter bridges DataCollect with a third-party registry (beneficiary management system, HR system, civil registry). It implements two directions:

- **Pull**: fetch records from the remote registry, transform them into DataCollect events, and submit them via `EventApplierService`
- **Push**: read DataCollect entities that changed locally, transform them into the remote registry's shape, and call the registry's API

The V2 adapter interface (`ExternalSyncAdapterV2`) is the canonical contract. It defines `descriptor()`, `initialize()`, `healthCheck()`, `pull()`, `push()`, and `disconnect()`.

## Prerequisites

- TypeScript 5+, Node.js 22+
- A running mock registry server — see [examples/mock-server](https://github.com/idpass/idpass-datacollect/tree/main/examples/mock-server) quickstart
- DataCollect monorepo checked out

## The reference stack

| Piece | Where | Purpose |
|---|---|---|
| Python mock registry | `examples/mock-server/` | OAuth2 REST API over SQLite — the "remote" system |
| `@idpass/adapter-mock` | `packages/adapter-mock/` | V2 adapter implementing the sync contract against the mock registry |
| Backend registration | `packages/backend/src/syncServer.ts` | Wires the adapter into the V2 adapter registry |
| Admin UI config | `packages/admin/src/views/wizard/IntegrationStep.vue` | Lets users configure the adapter via the admin UI |

Start the mock server locally, then every step below is exercised end-to-end.

## Step 1 — Define your config schema with Zod

Create `src/config.ts`. Every V2 adapter declares its config as a Zod schema so ExternalSyncManager can validate before calling `initialize()`.

```typescript
import { z } from "zod";

export const myConfigSchema = z.object({
  type: z.literal("my-registry").optional(),
  url: z.string().url(),
  clientId: z.string(),
  clientSecret: z.string(),
  identifierScheme: z.string().default("urn:my-registry:vocab:id-type"),
});

export type MyConfig = z.infer<typeof myConfigSchema>;
```

`type` is optional because `ExternalSyncManager` strips it from the `adapterConfig` object before validating — it lives at the top of `ExternalSyncConfig`.

Reference: `packages/adapter-mock/src/config.ts`.

## Step 2 — Build the HTTP client

Put all HTTP concerns in a dedicated client class. This keeps the adapter focused on transformation + sync logic.

Key responsibilities:

- OAuth2 (or whatever auth the registry uses) with token caching + refresh
- Typed methods per endpoint (no stringly-typed `get("/v1/persons")` calls scattered through the adapter)
- Consistent timeout (default 30s)
- Error mapping: auth failures, 409/412 conflicts, 4xx non-retryable, 5xx retryable

Reference: `packages/adapter-mock/src/MockRegistryClient.ts`. It exports a typed error hierarchy (`AuthError`, `ConflictError`, `PreconditionFailedError`, `NotFoundError`, `RetryableError`, `NonRetryableError`) that the adapter maps to DataCollect `SyncError` objects.

```typescript
class MyRegistryClient {
  async getToken(): Promise<string> { /* cache + refresh via exp claim */ }

  async listPersons(params: { updated_since?: string; limit?: number; offset?: number }): Promise<PaginatedResponse<Person>> { ... }

  async getPerson(uuid: string): Promise<Person> { ... }

  async createPerson(data: PersonCreate): Promise<Person> { ... }

  async updatePerson(uuid: string, data: PersonUpdate, ifMatch: string): Promise<Person> { ... }

  // ... and so on
}
```

## Step 3 — Implement the V2 adapter

Create `src/MyRegistrySyncAdapter.ts`:

```typescript
import type {
  ExternalSyncAdapterV2,
  AdapterDescriptor,
  HealthCheckResult,
  SyncResult,
  EntityPushPayload,
  EventStore,
  EventApplierService,
} from "@idpass/data-collect-core";

export class MyRegistrySyncAdapter implements ExternalSyncAdapterV2 {
  private client: MyRegistryClient | null = null;

  constructor(
    private eventStore: EventStore,
    private eventApplierService: EventApplierService,
  ) {}

  descriptor(): AdapterDescriptor {
    return {
      type: "my-registry",
      version: "1.0.0",
      capabilities: ["push", "pull"],
      configSchema: myConfigSchema,
    };
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    const validated = myConfigSchema.parse(config);
    this.client = new MyRegistryClient({
      baseUrl: validated.url,
      clientId: validated.clientId,
      clientSecret: validated.clientSecret,
    });
  }

  async healthCheck(): Promise<HealthCheckResult> { ... }
  async pull(since?: string): Promise<SyncResult> { ... }
  async push(_entities: EntityPushPayload[]): Promise<SyncResult> { ... }
  async disconnect(): Promise<void> { ... }
}
```

Reference: `packages/adapter-mock/src/MockRegistrySyncAdapter.ts`.

### Pull pattern

```typescript
async pull(since?: string): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: SyncError[] = [];
  let pulled = 0;
  let skipped = 0;
  let failed = 0;

  let offset = 0;
  while (true) {
    const page = await this.client.listPersons({ updated_since: since, offset, limit: 50 });
    for (const person of page.items) {
      try {
        const submission = personToFormSubmission(person, this.config);
        await this.eventApplierService.submitForm(submission);
        pulled++;
      } catch (e) {
        failed++;
        errors.push({ code: "PULL_TRANSFORM_FAILED", message: ..., retryable: false });
      }
    }
    if (page.next_offset === null) break;
    offset = page.next_offset;
  }

  // same for groups

  return { success: failed === 0, pushed: 0, pulled, failed, skipped, errors, duration: Date.now() - startTime };
}
```

`ExternalSyncManager` owns the pull watermark via `getLastPullExternalSyncTimestamp` / `setLastPullExternalSyncTimestamp` on `EventStore`. The `since` argument is the stored watermark; the manager advances it on successful pull.

### Push pattern — the critical details

Push is where most adapter bugs hide. The mock adapter follows this sequence:

1. Read push watermark from `EventStore.getLastPushExternalSyncTimestamp()`
2. `entityStore.getModifiedEntitiesSince(watermark)` — get candidates
3. **Filter stale pulled entities**: if `entity.externalId` is set and `initial.version === modified.version`, the entity was just pulled and hasn't been modified locally — skip it. Without this filter, every pull turns into a re-push that overwrites the remote with its own data.
4. Route each entity: new (no externalId) → `POST`, existing → `PATCH` with `If-Match`
5. On 412 Precondition Failed: increment `skipped`, not `failed` — concurrent edit, retry later
6. On 404 on PATCH target: fall back to create — remote record was deleted out-of-band
7. On successful create: store the remote UUID back via `entityStore.setExternalId(entity.guid, remoteUuid)`
8. Advance push watermark **only if `failed === 0`** — otherwise the next sync would skip over the failed entities

This is the OpenSPP V2 pattern, battle-tested through the April 2026 sync hardening sprint. See the post-mortem at `.claude/post-mortems/2026-04-16_sync-production-hardening.md` for why each of those rules exists.

## Step 4 — Transformers

Keep transformers pure — no I/O, no side effects, just shape mapping. One file per direction per entity type:

```
src/pullTransformers/personToFormSubmission.ts
src/pullTransformers/groupToFormSubmission.ts
src/pushTransformers/individualToPerson.ts
src/pushTransformers/groupToGroup.ts
```

### Identifier resolution in transformers

DataCollect events use `externalId` as the stable key. Your transformer must pick the right identifier from the remote entity's `identifiers[]` array:

1. Prefer a real-world identifier matching the configured `identifierScheme` (e.g. `national_id_number`)
2. Fall back to the registry-assigned `system_id`
3. If neither exists — last resort: any available identifier

```typescript
function resolveExternalId(person: Person, config: MyConfig): string | null {
  const configured = person.identifiers.find(
    i => i.identifier_scheme_id === config.identifierScheme && i.identifier_type !== "system_id",
  );
  if (configured) return configured.identifier_value;

  const system = person.identifiers.find(i => i.identifier_type === "system_id");
  if (system) return system.identifier_value;

  return person.identifiers[0]?.identifier_value ?? null;
}
```

The [PublicSchema Alignment](./publicschema-alignment) page explains why registries expose a `system_id` in addition to real-world identity documents.

## Step 5 — Write tests

The reference uses Jest's built-in `jest.mock("axios")` — no `nock` needed. Cover:

- Token caching (first call fetches, second call reuses)
- Token refresh on expiry (decode `exp`, refresh when close)
- Pull pagination (multi-page response)
- Pull identifier priority (real ID preferred over system_id)
- Push: stale entity filter, 412 → skipped, 404 → create fallback
- Push watermark only advances on zero failures
- `saveExternalIdToEntity` called after successful create
- Second-sync idempotency (run the same sync twice, no duplicates)

Reference: `packages/adapter-mock/src/__tests__/MockRegistrySyncAdapter.test.ts`.

## Step 6 — Register with the backend

Edit `packages/backend/src/syncServer.ts`:

```typescript
import { MyRegistrySyncAdapter } from "@idpass/adapter-my-registry";
import { adapterRegistry } from "@idpass/data-collect-core";

adapterRegistry.register("my-registry", MyRegistrySyncAdapter);
```

Users configure the adapter via app config:

```json
{
  "externalSync": {
    "type": "my-registry",
    "url": "https://registry.example.com",
    "adapterConfig": {
      "clientId": "...",
      "clientSecret": "...",
      "identifierScheme": "urn:my-registry:vocab:id-type"
    }
  }
}
```

## Step 7 — Admin UI integration

If users should be able to configure your adapter from the admin UI, update:

- `packages/datacollect/src/interfaces/adapter-configs.ts` — add a new `MyRegistryAdapterConfig` with field metadata
- `packages/admin/src/views/wizard/IntegrationStep.vue` — add your type to the adapter dropdown + default `adapterConfig` values
- `packages/admin/src/views/wizard/ReviewStep.vue` — add the label for display
- `packages/admin/src/views/AppDetailsView.vue` — add the label for the details page

Reference changes made for the mock adapter: look at the git history of any of these files — search for `"mock"` to find the pattern.

## Step 8 — Run end-to-end

```bash
# Terminal 1 — mock registry
cd examples/mock-server && uv run python -m mock_server

# Terminal 2 — DataCollect backend
docker compose --profile mock -f docker/docker-compose.dev.yaml up
```

In the admin UI, create an app config with `externalSync.type = "mock"` and the mock server's URL. Trigger a sync from the admin and verify entities flow between the two systems.

## Checklist

Before declaring your adapter done:

- [ ] Config schema validated by Zod
- [ ] HTTP client has typed methods + 30s timeout + typed error hierarchy
- [ ] Pull paginates; respects `since` parameter; advances watermark cleanly
- [ ] Push filters stale pulled entities (externalId + equal versions)
- [ ] Push uses optimistic concurrency (`If-Match` or equivalent)
- [ ] Push watermark only advances when `failed === 0`
- [ ] `saveExternalIdToEntity` called for new creates
- [ ] 412 counted as `skipped`, not `failed`
- [ ] Tests cover second-sync idempotency
- [ ] No PII in logs — hash or redact identifier values
- [ ] Registered in `packages/backend/src/syncServer.ts`
- [ ] Config schema exposed in admin UI adapter wizard

## References

- [Adapter Registry](./adapter-registry) — how V2 adapters are registered and resolved
- [PublicSchema Alignment](./publicschema-alignment) — entity model and the `system_id` convention
- [OpenSPP V2 Adapter](./openspp-v2-adapter) — production-grade V2 adapter for OpenSPP
- [Mock Registry Server README](https://github.com/idpass/idpass-datacollect/tree/main/examples/mock-server)
- [`packages/adapter-mock` source](https://github.com/idpass/idpass-datacollect/tree/main/packages/adapter-mock)
