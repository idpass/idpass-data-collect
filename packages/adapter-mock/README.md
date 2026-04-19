# ID PASS DataCollect — Mock Registry Adapter

> Reference V2 HTTP sync adapter for the DataCollect mock registry server

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)

## Overview

`@idpass/adapter-mock` implements `ExternalSyncAdapterV2` against the Python mock registry server at [`examples/mock-server`](../../examples/mock-server) in this monorepo.

It exists to:

1. **Exercise the DC V2 external sync contract end to end** without depending on OpenSPP or another third-party system.
2. **Serve as a reference implementation** for teams writing their own adapter — the code walks through the full lifecycle (OAuth2 client credentials, pagination, identifier resolution, optimistic-concurrency PATCH, stale-entity filtering, and push watermark management).
3. **Keep release testing unblocked** when external partners are unavailable.

Previous in-process mock implementations (`MockSyncAdapter`, `MockSyncAdapterV2`) have been removed. Tests that previously exercised those should now either run a real mock server instance or use the lighter-weight in-memory stubs in `@idpass/data-collect-core/testing`.

## Installation

This package is published to GitHub Packages:

```bash
pnpm add @idpass/adapter-mock --registry=https://npm.pkg.github.com
```

## Configuration

The adapter is registered under the type `"mock"`:

```json
{
  "externalSync": {
    "type": "mock",
    "url": "http://localhost:9999",
    "adapterConfig": {
      "clientId": "mock-client",
      "clientSecret": "mock-secret",
      "identifierScheme": "urn:mock:vocab:id-type",
      "identifierType": "system_id"
    }
  }
}
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `url` | yes | — | Base URL of the mock registry server |
| `clientId` | yes | `mock-client` | OAuth2 client ID |
| `clientSecret` | yes | — | OAuth2 client secret |
| `identifierScheme` | no | `urn:mock:vocab:id-type` | Identifier scheme URI used when resolving identifiers |
| `identifierType` | no | `system_id` | Default identifier type used for DC entities without real-world IDs |

## Protocol summary

- **Auth** — `POST /oauth/token` with `{grant_type, client_id, client_secret}`; JWT is cached in memory and refreshed from the `exp` claim.
- **Pull** — `GET /v1/persons?updated_since=&limit=&offset=` and `GET /v1/groups?updated_since=&limit=&offset=` with pagination, transformed to `FormSubmission` and pushed through `EventApplierService.submitForm`.
- **Push** — reads `getModifiedEntitiesSince`, filters out entities whose only change was an external pull (`externalId && initial.version === modified.version`), then POSTs new entities or PATCHes existing ones. `PATCH` uses `If-Match: <updated_at>` for optimistic concurrency; 412 responses are surfaced as non-retryable skips.
- **Watermark** — `lastPushExternalSyncTimestamp` advances only when every entity pushed cleanly, so failed entities remain eligible on the next sync.

## Running against the mock server

```bash
# Terminal 1 — start the reference server
cd examples/mock-server
uv run python -m mock_server

# Terminal 2 — run a DC backend that points at it
cd packages/backend
pnpm dev
```

Create an app config with the external sync block shown above. The backend's sync routes will delegate to this adapter.

## Contributing

See the main project [Contributing Guide](../../CONTRIBUTING.md) for development setup and guidelines.

## License

Licensed under the Apache License 2.0. See [LICENSE](../../LICENSE) for details.
