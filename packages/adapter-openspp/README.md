# ID PASS DataCollect — OpenSPP Adapter

> OpenSPP sync adapter (V1 Odoo JSON-RPC and V2 REST/OAuth2) for ID PASS DataCollect

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)

## Overview

`@idpass/adapter-openspp` provides synchronization adapters that connect ID PASS DataCollect to an [OpenSPP](https://openspp.org/) instance. Two protocol generations are supported:

- **V1** (`OpenSppOdooSyncAdapter`) — Odoo JSON-RPC API
- **V2** (`OpenSppV2SyncAdapter`) — REST API with OAuth2 authentication

## Installation

This package is published to GitHub Packages:

```bash
pnpm add @idpass/adapter-openspp --registry=https://npm.pkg.github.com
```

## Usage

### V1 — Odoo JSON-RPC

```typescript
import { OpenSppOdooSyncAdapter } from "@idpass/adapter-openspp";

const adapter = new OpenSppOdooSyncAdapter({
  url: "https://openspp.example.com",
  database: "openspp",
  username: "sync_user",
  password: "sync_password",
});
```

### V2 — REST / OAuth2

```typescript
import { OpenSppV2SyncAdapter, OpenSppV2Client } from "@idpass/adapter-openspp";

const client = new OpenSppV2Client({
  baseUrl: "https://openspp.example.com",
  clientId: "your-client-id",
  clientSecret: "your-client-secret",
});

const adapter = new OpenSppV2SyncAdapter(client);
```

### Registering with the Backend

Configure the adapter via the tenant's `externalSync` config block:

```json
{
  "externalSync": {
    "type": "openspp",
    "url": "https://openspp.example.com"
  }
}
```

For configurable field mappings see the `OpenSppAdapterOptions` type and the `opensppAdapterOptions` extra field documented in `packages/datacollect/README.md`.

## Change Request Push Mode

Set `externalSync.adapterConfig.submitVia: "change-request"` (or pass `submitVia: "change-request"` via `OpenSppV2AdapterOptions`) to route DataCollect pushes through OpenSPP's `/ChangeRequest` workflow instead of writing directly to `/Individual` and `/Group`. Required when OpenSPP has CR governance enabled for the registry.

When enabled, every push:

1. Creates a CR via `POST /ChangeRequest` (status `draft`).
2. Submits it via `POST /ChangeRequest/{ref}/$submit` (status `pending`).
3. Persists the reference + status under metadata key `cr:{entityGuid}` for idempotency on re-push.

OpenSPP operator actions (`$approve` / `$reject` / `$apply`) are out of scope for DataCollect.

### Idempotency on re-push

| Stored CR status                           | Behaviour on next push of the same entity                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `draft`                                    | Re-attempt `$submit` only (no second CR is created).                                 |
| `pending` / `approved` / `applied`         | Skip silently. Pull will project status changes back into metadata.                  |
| `rejected` / `revision`                    | Throw `ChangeRequestRevisionNeededError`; push loop records failure, no retry.       |

### Current limitations (v1)

- `requestType.code` defaults are best-guesses (`add_individual`, `edit_individual`, `add_group`, `edit_group`, `archive_individual`, `archive_group`, `add_member`, `remove_member`). Verify against your OpenSPP instance and override per-event-type via `changeRequestTypeMap`.
- `add-member` / `remove-member` events are mapped to `update-individual` / `update-group` (i.e. `edit_*` codes) — granular member-CR mapping is deferred.
- Create CRs use `registrant: { system: "datacollect:guid", value: <entityGuid> }` as a placeholder. OpenSPP assigns the real identifier on `$apply`. If your CR workflow requires a pre-existing identifier, this won't work — file a successor ticket.
- `rejected` / `revision` are terminal from DataCollect's perspective. The operator must `$reset` on OpenSPP before DataCollect can submit a fresh CR for the same entity.

## Contributing

See the main project [Contributing Guide](../../CONTRIBUTING.md) for development setup and guidelines.

## License

Licensed under the Apache License 2.0. See [LICENSE](../../LICENSE) for details.
