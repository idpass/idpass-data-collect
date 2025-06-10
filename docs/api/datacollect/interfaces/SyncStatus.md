[**ID PASS Data Collect API Documentation v0.0.1**](../README.md)

***

[ID PASS Data Collect API Documentation](../globals.md) / SyncStatus

# Interface: SyncStatus

Defined in: [interfaces/types.ts:593](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L593)

Status information for sync operations.

## Properties

### status

> **status**: `string`

Defined in: [interfaces/types.ts:595](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L595)

Current sync status (e.g., 'idle', 'syncing', 'error')

***

### lastSyncTime

> **lastSyncTime**: `string`

Defined in: [interfaces/types.ts:597](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L597)

ISO timestamp of last successful sync

***

### pendingChanges

> **pendingChanges**: `number`

Defined in: [interfaces/types.ts:599](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L599)

Number of pending changes waiting to be synced
