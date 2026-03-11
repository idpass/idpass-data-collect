# Testing Principles

## Coverage Targets

| Package | Target |
|---------|--------|
| `datacollect` core (EventStore, EntityStore, sync) | 85%+ |
| `backend` API routes | 80%+ |
| `admin` Vue components | 60%+ |
| `mobile` | 60%+ |

Run `pnpm pr-check` before submitting a PR — it enforces thresholds.

## Test Types by Package

| Package | Framework | Test files |
|---------|-----------|-----------|
| `datacollect` | Jest + `fake-indexeddb` | `src/**/__tests__/*.test.ts` |
| `backend` | Jest + `supertest` | `src/**/__tests__/*.test.ts` |
| `admin` | Vitest | `src/**/*.spec.ts` |
| `mobile` | Vitest | `src/**/*.spec.ts` |

## IndexedDB Testing

Use `fake-indexeddb` for all `datacollect` tests — never use real IndexedDB in unit tests.

```typescript
import 'fake-indexeddb/auto';
```

Import it at the top of test files that use `IndexedDbEntityStorageAdapter` or similar.

## Adapter Conformance Tests

When implementing a new storage adapter, run the shared conformance suite:

```typescript
import { runAdapterConformanceTests } from '../interfaces/__tests__/adapterConformance';
runAdapterConformanceTests(() => new MyNewAdapter());
```

## Test Style

- Arrange–Act–Assert structure
- One assertion focus per test
- No disabled tests (`it.skip`, `xit`) — delete or fix them
- Mock external HTTP calls; do not mock internal services
- Backend tests use a real Postgres test DB (`POSTGRES_TEST` env)

## Running Tests

```bash
# All packages
pnpm test

# Specific package
pnpm test:backend
pnpm test:datacollect

# Single file
cd packages/datacollect && npm test -- src/components/__tests__/EventStore.test.ts

# With coverage
pnpm --filter @idpass/data-collect-mobile test:coverage
```
