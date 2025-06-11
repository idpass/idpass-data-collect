[**ID PASS DataCollect API Documentation v0.0.1**](../README.md)

***

[ID PASS DataCollect API Documentation](../globals.md) / EventApplier

# Interface: EventApplier

Defined in: [interfaces/types.ts:415](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L415)

Event applier interface for transforming events into entity state changes.

Core component of the event sourcing system that knows how to apply
specific event types to entities. Custom event appliers can be registered
for domain-specific operations.

## Example

```typescript
const customApplier: EventApplier = {
  apply: async (entity, form, getEntity, saveEntity) => {
    if (form.type === 'custom-operation') {
      const updatedEntity = { ...entity, data: { ...entity.data, ...form.data } };
      return updatedEntity;
    }
    throw new Error(`Unsupported event type: ${form.type}`);
  }
};
```

## Methods

### apply()

> **apply**(`entity`, `form`, `getEntity`, `saveEntity`): `Promise`\<[`EntityDoc`](EntityDoc.md)\>

Defined in: [interfaces/types.ts:425](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/interfaces/types.ts#L425)

Apply an event (form submission) to an entity to produce the new state.

#### Parameters

##### entity

[`EntityDoc`](EntityDoc.md)

The current entity state

##### form

[`FormSubmission`](FormSubmission.md)

The form submission/event to apply

##### getEntity

(`id`) => `Promise`\<`null` \| [`EntityPair`](EntityPair.md)\>

Function to retrieve related entities

##### saveEntity

(`action`, `existingEntity`, `modifiedEntity`, `changes`) => `Promise`\<`void`\>

Function to save entity changes

#### Returns

`Promise`\<[`EntityDoc`](EntityDoc.md)\>

The updated entity after applying the event
