# Storage Adapter Principles

Storage adapters implement the interfaces defined in `packages/datacollect/src/interfaces/types.ts`. They are the only place where actual I/O happens.

## Adapter Pairs

Each storage type has two implementations:

| Interface | Client (Browser) | Server (Node) |
|-----------|-----------------|---------------|
| `EventStorageAdapter` | `IndexedDbEventStorageAdapter` | `PostgresEventStorageAdapter` |
| `EntityStorageAdapter` | `IndexedDbEntityStorageAdapter` | `PostgresEntityStorageAdapter` |
| `AttachmentStorageAdapter` | `IndexedDbAttachmentStorageAdapter` | `PostgresAttachmentStorageAdapter` |
| `AuthStorageAdapter` | `IndexedDbAuthStorageAdapter` | (server uses JWT) |

## Platform Neutrality

The `datacollect` library must work in both browser and Node environments.

- Never import `fs`, `path`, `crypto` (Node builtins) in `packages/datacollect/src/`
- Never import `indexeddb` directly — always go through the adapter interface
- Use `packages/datacollect/src/browser.ts` for browser-specific entry points

## Adapter Contract

All adapters must pass the conformance test suite in:
`packages/datacollect/src/interfaces/__tests__/adapterConformance.ts`

Run conformance tests when implementing a new adapter.

## AdapterRegistry

`AdapterRegistry` wires together the concrete adapters at startup. Do not pass adapters around as constructor arguments beyond the top-level composition root — use the registry.

## Adding a New Adapter

1. Implement the relevant interface from `interfaces/types.ts`
2. Add conformance tests using the shared suite
3. Register in `AdapterRegistry`
4. Keep I/O concerns strictly inside the adapter — no business logic
