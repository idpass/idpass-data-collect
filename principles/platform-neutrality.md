# Platform Neutrality

The `packages/datacollect` library must run in both browser and Node.js environments. Violations cause mobile and admin builds to break.

## Forbidden in `packages/datacollect/src/`

| Import | Reason |
|--------|--------|
| `fs`, `path`, `os` | Node-only builtins |
| `crypto` (Node) | Use `globalThis.crypto` (Web Crypto API, available in both) |
| `indexeddb` directly | Always go through the adapter interface |
| `express`, `pg`, `axios` with Node-specific features | Node-only libraries |

## Allowed

- Standard Web APIs available in both environments (`fetch`, `crypto` via `globalThis`, `TextEncoder`, etc.)
- Pure TypeScript/JavaScript with no environment-specific I/O
- Libraries explicitly listed as browser+Node compatible in `package.json`

## Entry Points

- `packages/datacollect/src/index.ts` — main entry, environment-neutral
- `packages/datacollect/src/browser.ts` — browser-specific wiring (IndexedDB adapters, etc.)

When adding browser-specific code, put it in `browser.ts` or a file only imported from there.

## Checking Compatibility

After adding a new dependency to `datacollect`, verify it doesn't pull in Node-only modules:

```bash
cd packages/datacollect
pnpm build   # fails if browser bundle can't be built
```

The build uses a bundler configured to target both environments — a failing build means you've introduced a platform-specific dependency.
