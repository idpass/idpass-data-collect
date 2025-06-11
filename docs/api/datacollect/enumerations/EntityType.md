[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / EntityType

# Enumeration: EntityType

Defined in: [interfaces/types.ts:29](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L29)

Entity types supported by the DataCollect system.

## Example

```typescript
const individualType = EntityType.Individual; // "individual"
const groupType = EntityType.Group; // "group"
```

## Enumeration Members

### Individual

> **Individual**: `"individual"`

Defined in: [interfaces/types.ts:31](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L31)

Individual person record

***

### Group

> **Group**: `"group"`

Defined in: [interfaces/types.ts:33](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L33)

Group/household containing multiple individuals
