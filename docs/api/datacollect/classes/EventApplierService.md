[**ID PASS Data Collect API Documentation v0.0.1**](../README.md)

***

[ID PASS Data Collect API Documentation](../globals.md) / EventApplierService

# Class: EventApplierService

Defined in: [services/EventApplierService.ts:142](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/services/EventApplierService.ts#L142)

Service responsible for applying events (FormSubmissions) to entities in the event sourcing system.

The EventApplierService is the core component that transforms events into entity state changes.
It handles all standard entity operations (create, update, delete, add/remove members) and supports
custom event appliers for domain-specific operations.

Key features:
- **Event Processing**: Applies form submissions to create or modify entities
- **Custom Event Support**: Allows registration of custom event appliers
- **Audit Trail**: Maintains complete audit logs for all changes
- **Duplicate Detection**: Automatically flags potential duplicates during entity creation
- **Cascading Operations**: Handles complex operations like group member management
- **Data Validation**: Validates all form submissions before processing

Architecture:
- Uses the Strategy pattern for pluggable event appliers
- Maintains referential integrity for group-member relationships
- Generates audit entries for all state changes
- Integrates with duplicate detection algorithms

## Examples

Basic usage:
```typescript
const service = new EventApplierService(
  'user-123',
  eventStore,
  entityStore
);

// Submit a form to create an individual
const individual = await service.submitForm({
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: 'create-individual',
  data: { name: 'John Doe', age: 30 },
  timestamp: new Date().toISOString(),
  userId: 'user-123',
  syncLevel: SyncLevel.LOCAL
});
```

Custom event applier:
```typescript
// Register a custom event applier
const customApplier: EventApplier = {
  apply: async (entity, form, getEntity, saveEntity) => {
    if (form.type === 'custom-verification') {
      const updated = { 
        ...entity, 
        data: { ...entity.data, verified: true, verifiedAt: form.timestamp }
      };
      return updated;
    }
    throw new Error(`Unsupported event type: ${form.type}`);
  }
};

service.registerEventApplier('custom-verification', customApplier);

// Now can process custom events
await service.submitForm({
  type: 'custom-verification',
  // ... other form properties
});
```

Group operations:
```typescript
// Create a group with members
const group = await service.submitForm({
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: 'create-group',
  data: { 
    name: 'Smith Family',
    members: [
      { guid: 'person-1', name: 'John Smith', type: 'individual' },
      { guid: 'person-2', name: 'Jane Smith', type: 'individual' }
    ]
  },
  timestamp: new Date().toISOString(),
  userId: 'user-123',
  syncLevel: SyncLevel.LOCAL
});

// Add a member to existing group
await service.submitForm({
  guid: uuidv4(),
  entityGuid: group.guid,
  type: 'add-member',
  data: { 
    members: [{ guid: 'person-3', name: 'Bob Smith', type: 'individual' }]
  },
  timestamp: new Date().toISOString(),
  userId: 'user-123',
  syncLevel: SyncLevel.LOCAL
});
```

## Constructors

### Constructor

> **new EventApplierService**(`userId`, `eventStore`, `entityStore`): `EventApplierService`

Defined in: [services/EventApplierService.ts:155](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/services/EventApplierService.ts#L155)

Creates a new EventApplierService instance.

#### Parameters

##### userId

`string`

Default user ID for system-generated events

##### eventStore

[`EventStore`](../interfaces/EventStore.md)

Store for managing events and audit logs

##### entityStore

[`EntityStore`](../interfaces/EntityStore.md)

Store for managing current entity state

#### Returns

`EventApplierService`

## Methods

### registerEventApplier()

> **registerEventApplier**(`eventType`, `applier`): `void`

Defined in: [services/EventApplierService.ts:186](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/services/EventApplierService.ts#L186)

Registers a custom event applier for a specific event type.

Allows extending the system with domain-specific event processing logic.
Custom appliers take precedence over built-in event handling.

#### Parameters

##### eventType

`string`

The event type to handle (e.g., 'custom-verification')

##### applier

[`EventApplier`](../interfaces/EventApplier.md)

The event applier implementation

#### Returns

`void`

#### Example

```typescript
const verificationApplier: EventApplier = {
  apply: async (entity, form, getEntity, saveEntity) => {
    const updated = {
      ...entity,
      data: { ...entity.data, verified: true, verifiedAt: form.timestamp }
    };
    await saveEntity('verify-entity', entity, updated, form.data);
    return updated;
  }
};

service.registerEventApplier('custom-verification', verificationApplier);
```

***

### getEventApplier()

> **getEventApplier**(`eventType`): `undefined` \| [`EventApplier`](../interfaces/EventApplier.md)

Defined in: [services/EventApplierService.ts:204](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/services/EventApplierService.ts#L204)

Retrieves a registered event applier for a specific event type.

#### Parameters

##### eventType

`string`

The event type to look up

#### Returns

`undefined` \| [`EventApplier`](../interfaces/EventApplier.md)

The event applier if registered, undefined otherwise

#### Example

```typescript
const applier = service.getEventApplier('custom-verification');
if (applier) {
  // Custom applier is available
}
```

***

### submitForm()

> **submitForm**(`formDataParam`): `Promise`\<`null` \| [`EntityDoc`](../interfaces/EntityDoc.md)\>

Defined in: [services/EventApplierService.ts:281](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/services/EventApplierService.ts#L281)

Processes a form submission to create or modify entities through the event sourcing system.

This is the main entry point for all entity operations. The method:
1. Validates the form submission data
2. Saves the event to the event store  
3. Applies the event to create/update entities
4. Logs audit entries for all changes
5. Flags potential duplicates automatically

Supported event types:
- `create-group` / `update-group`: Create or modify group entities
- `create-individual` / `update-individual`: Create or modify individual entities
- `add-member`: Add a member to a group (supports both individuals and nested groups)
- `remove-member`: Remove a member from a group (cascades delete for subgroups)
- `delete-entity`: Delete an entity and all its descendants
- `resolve-duplicate`: Resolve potential duplicate entities
- Custom events: Handled by registered event appliers

#### Parameters

##### formDataParam

[`FormSubmission`](../interfaces/FormSubmission.md)

The form submission containing the event data

#### Returns

`Promise`\<`null` \| [`EntityDoc`](../interfaces/EntityDoc.md)\>

The resulting entity after applying the event, or null if deletion occurred

#### Throws

When validation fails or required data is missing

#### Examples

Create an individual:
```typescript
const individual = await service.submitForm({
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: 'create-individual',
  data: { name: 'John Doe', age: 30, email: 'john@example.com' },
  timestamp: new Date().toISOString(),
  userId: 'user-123',
  syncLevel: SyncLevel.LOCAL
});
```

Create a group with members:
```typescript
const group = await service.submitForm({
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: 'create-group',
  data: {
    name: 'Smith Family',
    members: [
      { guid: uuidv4(), name: 'John Smith', type: 'individual' },
      { guid: uuidv4(), name: 'Jane Smith', type: 'individual' }
    ]
  },
  timestamp: new Date().toISOString(),
  userId: 'user-123',
  syncLevel: SyncLevel.LOCAL
});
```

Add member to existing group:
```typescript
await service.submitForm({
  guid: uuidv4(),
  entityGuid: existingGroupId,
  type: 'add-member',
  data: {
    members: [{ guid: uuidv4(), name: 'Bob Smith', type: 'individual' }]
  },
  timestamp: new Date().toISOString(),
  userId: 'user-123',
  syncLevel: SyncLevel.LOCAL
});
```

***

### searchEntities()

> **searchEntities**(`criteria`): `Promise`\<`object`[]\>

Defined in: [services/EventApplierService.ts:870](https://github.com/idpass/idpass-data-collect/blob/main/packages/datacollect/src/services/EventApplierService.ts#L870)

Searches entities using the provided criteria.

Delegates to the EntityStore's search functionality to find entities
matching the specified criteria.

#### Parameters

##### criteria

[`SearchCriteria`](../type-aliases/SearchCriteria.md)

Search criteria array with query conditions

#### Returns

`Promise`\<`object`[]\>

Array of entity pairs matching the criteria

#### Example

```typescript
// Search for adults
const adults = await service.searchEntities([
  { "data.age": { $gte: 18 } },
  { "type": "individual" }
]);

// Search for groups with specific name
const smithFamilies = await service.searchEntities([
  { "data.name": { $regex: /smith/i } },
  { "type": "group" }
]);
```
