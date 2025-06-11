[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / SyncLevel

# Enumeration: SyncLevel

Defined in: [interfaces/types.ts:111](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L111)

Synchronization levels indicating how far data has propagated through the system.

## Example

```typescript
const localForm: FormSubmission = {
  syncLevel: SyncLevel.LOCAL, // Only on local device
  // ... other properties
};
```

## Enumeration Members

### LOCAL

> **LOCAL**: `0`

Defined in: [interfaces/types.ts:113](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L113)

Local only - not synced anywhere

***

### REMOTE

> **REMOTE**: `1`

Defined in: [interfaces/types.ts:115](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L115)

Synced with remote DataCollect server

***

### EXTERNAL

> **EXTERNAL**: `2`

Defined in: [interfaces/types.ts:117](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L117)

Synced with external system (e.g. OpenSPP, SCOPE)
