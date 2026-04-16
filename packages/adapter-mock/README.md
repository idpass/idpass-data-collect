# ID PASS DataCollect — Mock Adapter

> Mock sync adapter for testing ID PASS DataCollect external sync integrations

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)

## Overview

`@idpass/adapter-mock` provides in-memory mock implementations of the DataCollect external sync adapter interfaces. It is intended for **testing and development purposes** — use it to write tests without a real external system, or to exercise the sync pipeline locally.

Two interface generations are provided:

- **V1** (`MockSyncAdapter`) — implements `ExternalSyncAdapter`
- **V2** (`MockSyncAdapterV2`) — implements `ExternalSyncAdapterV2`

## Installation

This package is published to GitHub Packages:

```bash
pnpm add @idpass/adapter-mock --registry=https://npm.pkg.github.com
```

## Usage

```typescript
import { MockSyncAdapterV2 } from "@idpass/adapter-mock";

const adapter = new MockSyncAdapterV2();

// Use in tests or with EntityDataManager
await manager.syncWithExternalSystem(adapter);

// Inspect what was pushed
console.log(adapter.pushedEntities);
```

### Registering with the Backend (development only)

```json
{
  "externalSync": {
    "type": "mock",
    "url": "http://localhost:9999"
  }
}
```

## Contributing

See the main project [Contributing Guide](../../CONTRIBUTING.md) for development setup and guidelines.

## License

Licensed under the Apache License 2.0. See [LICENSE](../../LICENSE) for details.
