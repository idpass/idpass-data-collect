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
npm install @idpass/adapter-openspp --registry=https://npm.pkg.github.com
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

## Contributing

See the main project [Contributing Guide](../../CONTRIBUTING.md) for development setup and guidelines.

## License

Licensed under the Apache License 2.0. See [LICENSE](../../LICENSE) for details.
