[**ID PASS Data Collect API Documentation v0.0.1**](../README.md)

***

[ID PASS Data Collect API Documentation](../globals.md) / AuditLogEntry

# Interface: AuditLogEntry

Defined in: [interfaces/types.ts:242](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L242)

Audit log entry for tracking all system changes with cryptographic signatures.

Provides complete audit trail with tamper-evident logging for compliance
and security requirements.

## Example

```typescript
const auditEntry: AuditLogEntry = {
  guid: "audit-123",
  timestamp: "2024-01-01T12:00:00Z",
  userId: "user-456",
  action: "create-individual",
  eventGuid: "event-789",
  entityGuid: "person-101",
  changes: { name: "John Doe", age: 30 },
  signature: "sha256:abc123..."
};
```

## Properties

### guid

> **guid**: `string`

Defined in: [interfaces/types.ts:244](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L244)

Unique identifier for this audit log entry

***

### timestamp

> **timestamp**: `string`

Defined in: [interfaces/types.ts:246](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L246)

ISO timestamp when the action occurred

***

### userId

> **userId**: `string`

Defined in: [interfaces/types.ts:248](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L248)

User who performed the action

***

### action

> **action**: `string`

Defined in: [interfaces/types.ts:250](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L250)

Type of action performed

***

### eventGuid

> **eventGuid**: `string`

Defined in: [interfaces/types.ts:252](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L252)

GUID of the related event/form submission

***

### entityGuid

> **entityGuid**: `string`

Defined in: [interfaces/types.ts:254](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L254)

GUID of the entity that was affected

***

### changes

> **changes**: `object`

Defined in: [interfaces/types.ts:256](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L256)

Object containing the actual changes made

***

### signature

> **signature**: `string`

Defined in: [interfaces/types.ts:258](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L258)

Cryptographic signature for tamper detection
