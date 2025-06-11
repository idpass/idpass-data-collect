[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / FormSubmission

# Interface: FormSubmission

Defined in: [interfaces/types.ts:204](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L204)

Form submission representing a command/event in the event sourcing system.

Every change to entities is captured as a FormSubmission, enabling complete
audit trails and data synchronization.

## Example

```typescript
const createForm: FormSubmission = {
  guid: "form-123",
  entityGuid: "person-456",
  type: "create-individual",
  data: { name: "John Doe", age: 30 },
  timestamp: "2024-01-01T12:00:00Z",
  userId: "user-789",
  syncLevel: SyncLevel.LOCAL
};
```

## Properties

### guid

> **guid**: `string`

Defined in: [interfaces/types.ts:206](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L206)

Unique identifier for this form submission/event

***

### entityGuid

> **entityGuid**: `string`

Defined in: [interfaces/types.ts:208](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L208)

GUID of the entity this form submission targets

***

### type

> **type**: `string`

Defined in: [interfaces/types.ts:210](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L210)

Event type (e.g., 'create-individual', 'add-member')

***

### data

> **data**: `Record`\<`string`, `any`\>

Defined in: [interfaces/types.ts:213](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L213)

Event payload containing the actual data changes

***

### timestamp

> **timestamp**: `string`

Defined in: [interfaces/types.ts:215](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L215)

ISO timestamp when this event was created

***

### userId

> **userId**: `string`

Defined in: [interfaces/types.ts:217](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L217)

User who created this event

***

### syncLevel

> **syncLevel**: [`SyncLevel`](../enumerations/SyncLevel.md)

Defined in: [interfaces/types.ts:219](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L219)

Current synchronization level of this event
