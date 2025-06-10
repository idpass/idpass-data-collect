[**ID PASS Data Collect API Documentation v0.0.1**](../README.md)

***

[ID PASS Data Collect API Documentation](../globals.md) / EntityPair

# Interface: EntityPair

Defined in: [interfaces/types.ts:91](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L91)

Represents an entity's initial and current state for change tracking.

Used throughout the system to track modifications and handle sync conflicts.

## Example

```typescript
const entityPair: EntityPair = {
  guid: "550e8400-e29b-41d4-a716-446655440000",
  initial: originalEntity,
  modified: updatedEntity
};

// Check if entity has been modified
const hasChanges = entityPair.initial.version !== entityPair.modified.version;
```

## Properties

### guid

> **guid**: `string`

Defined in: [interfaces/types.ts:93](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L93)

Global unique identifier for the entity

***

### initial

> **initial**: [`EntityDoc`](EntityDoc.md)

Defined in: [interfaces/types.ts:95](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L95)

Entity state when first loaded or last synced

***

### modified

> **modified**: [`EntityDoc`](EntityDoc.md)

Defined in: [interfaces/types.ts:97](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L97)

Current entity state with any local modifications
