---
id: adapter-registry
title: Adapter Registry
sidebar_position: 1
---

# Adapter Registry

The V2 adapter system uses a centralized registry for dynamic adapter registration and discovery. Adapters are no longer imported directly from `@idpass/data-collect-core` — they live in standalone packages and must be registered at startup.

## Overview

The `AdapterRegistry` provides:

- **Dynamic registration** — register adapters by name at application startup
- **Zod validation** — adapter configurations are validated against schemas before use
- **Type safety** — the V2 adapter interface is fully typed

## Registering an Adapter

```typescript
import { AdapterRegistry } from '@idpass/data-collect-core';
import { OpenSppV2Adapter } from '@idpass/adapter-openspp';
import { OpenFnAdapter } from '@idpass/adapter-openfn';

// Register adapters at application startup
AdapterRegistry.register('openspp', OpenSppV2Adapter);
AdapterRegistry.register('openfn', OpenFnAdapter);
```

## Available Adapter Packages

| Package | Adapter | Description |
|---------|---------|-------------|
| `@idpass/adapter-openspp` | OpenSPP V1 & V2 | Sync with OpenSPP beneficiary registry |
| `@idpass/adapter-openfn` | OpenFn | Sync via OpenFn integration platform |
| `@idpass/adapter-mock` | Mock | Testing adapter with in-memory storage |

## Creating a Custom Adapter

To create a V2-compatible adapter:

### 1. Implement the Adapter Interface

```typescript
import type { ExternalSyncAdapterV2, SyncResult } from '@idpass/data-collect-core';

export class MyAdapter implements ExternalSyncAdapterV2 {
  constructor(private config: MyAdapterConfig) {}

  async initialize(): Promise<void> {
    // Set up connections, validate config
  }

  async push(entities: EntityDoc[]): Promise<SyncResult> {
    const result: SyncResult = { succeeded: [], failed: [] };

    for (const entity of entities) {
      try {
        await this.sendToExternalSystem(entity);
        result.succeeded.push(entity.guid);
      } catch (error) {
        // Never throw for per-entity errors — collect them in result
        result.failed.push({
          guid: entity.guid,
          error: error.message,
        });
      }
    }

    return result;
  }

  async pull(since: string): Promise<PullResult> {
    // Fetch changes from external system
  }
}
```

### 2. Define a Configuration Schema

```typescript
import { z } from 'zod';

export const myAdapterConfigSchema = z.object({
  url: z.string().url(),
  apiKey: z.string().min(1),
  batchSize: z.number().int().positive().default(100),
});

export type MyAdapterConfig = z.infer<typeof myAdapterConfigSchema>;
```

### 3. Register the Adapter

```typescript
AdapterRegistry.register('my-adapter', MyAdapter);
```

### 4. Use in App Configuration

```json
{
  "externalSync": {
    "type": "my-adapter",
    "url": "https://api.example.com",
    "apiKey": "secret",
    "batchSize": 50
  }
}
```

## Error Handling

V2 adapters must never throw for per-entity errors. Instead, collect errors in the `SyncResult`:

```typescript
// Correct: collect per-entity errors
result.failed.push({ guid: entity.guid, error: error.message });

// Incorrect: throwing aborts the entire batch
throw new Error(`Failed to sync ${entity.guid}`);
```

Adapter-level errors (authentication failure, network down) may throw — these indicate the entire sync operation cannot proceed.
