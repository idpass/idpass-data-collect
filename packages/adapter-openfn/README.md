# ID PASS DataCollect — OpenFn Adapter

> OpenFn sync adapter for ID PASS DataCollect

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)

## Overview

`@idpass/adapter-openfn` provides a synchronization adapter that connects ID PASS DataCollect to an [OpenFn](https://www.openfn.org/) workflow automation platform. Two interface generations are supported:

- **V1** (`OpenFnSyncAdapter`) — legacy `ExternalSyncAdapter` interface
- **V2** (`OpenFnSyncAdapterV2`) — current `ExternalSyncAdapterV2` interface

## Installation

This package is published to GitHub Packages:

```bash
pnpm add @idpass/adapter-openfn --registry=https://npm.pkg.github.com
```

## Usage

```typescript
import { OpenFnSyncAdapterV2 } from "@idpass/adapter-openfn";

const adapter = new OpenFnSyncAdapterV2({
  url: "https://app.openfn.org/inbox/your-webhook-key",
});
```

### Registering with the Backend

Configure the adapter via the tenant's `externalSync` config block:

```json
{
  "externalSync": {
    "type": "openfn",
    "url": "https://app.openfn.org/inbox/your-webhook-key"
  }
}
```

## Contributing

See the main project [Contributing Guide](../../CONTRIBUTING.md) for development setup and guidelines.

## License

Licensed under the Apache License 2.0. See [LICENSE](../../LICENSE) for details.
