# Error Handling Principles

## AppError

Use `AppError` for all application-level errors. It carries a machine-readable `code` alongside the message:

```typescript
throw new AppError('ENTITY_NOT_FOUND', `Entity ${guid} does not exist`);
```

Never throw plain `Error` objects for expected failure cases.

## No PII in Logs

Never log personally identifiable information:

```typescript
// Bad
log.error(`Sync failed for user ${email}`);

// Good
log.error(`Sync failed for user ID ${userId}`);
```

This applies to names, addresses, ID numbers, phone numbers, and any beneficiary data.

## Logging

Use `createLogger` from `utils/logger`:

```typescript
const log = createLogger('MyService');
log.info('Starting sync');
log.error('Sync failed', error);
```

Do not use `console.log` in production code. Use `console` only in scripts and CLI tooling.

## SyncResult Errors

For sync operations, errors are not thrown — they are collected in `SyncResult.errors[]`. See [external-adapters.md](external-adapters.md) for the pattern.

## Async Error Handling

Always `await` async operations in try/catch when the caller needs to handle the error. Do not silently swallow errors with empty `catch` blocks.

```typescript
// Bad
try {
  await syncManager.sync();
} catch (e) {}

// Good
try {
  await syncManager.sync();
} catch (e) {
  log.error('Sync failed', e);
  throw e; // or handle appropriately
}
```
