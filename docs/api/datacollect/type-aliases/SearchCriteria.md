[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / SearchCriteria

# Type Alias: SearchCriteria

> **SearchCriteria** = `Record`\<`string`, `any`\>[]

Defined in: [interfaces/types.ts:486](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L486)

Search criteria for entity queries.
Array of key-value pairs for filtering entities.

## Example

```typescript
const criteria: SearchCriteria = [
  { "data.age": { $gte: 18 } },
  { "type": "individual" }
];
```
