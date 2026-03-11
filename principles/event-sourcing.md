# Event Sourcing Principles

DataCollect uses event sourcing with CQRS. Current entity state is derived entirely from replaying events.

## Core Concepts

| Concept | Description |
|---------|-------------|
| `EventDoc` | Immutable record of a change (`FormSubmission` → `EventDoc`) |
| `EventStore` | Append-only log of events |
| `EntityDoc` | Current state of a Group or Individual |
| `EntityStore` | Derived read model — never written to directly |
| `EventApplierService` | Applies events to produce entity state |

## The Write Path

```
FormSubmission → EventApplierService.apply() → EventDoc → EventStore
                                                         → EntityStore (updated)
```

Never mutate `EntityStore` directly. All changes must be expressed as events.

## Standard Event Types

| Event | Description |
|-------|-------------|
| `create-group` | Create a new group/household |
| `add-member` | Add an individual to a group |
| `update-individual` | Update an individual's data |
| `delete-entity` | Mark an entity as deleted |

## Custom Events

Register custom event appliers before processing submissions:

```typescript
eventApplierService.registerEventApplier('my-custom-event', async (event, entityStore) => {
  // apply event to entity store
});
```

Custom events must be registered on both client and server before syncing.

## Event Upcasting

When the event schema changes, use `EventUpcasterService` to migrate old events — never mutate stored events.

## SyncLevel

Every event carries a `SyncLevel`:

- `LOCAL` — written locally, not yet sent to server
- `SYNCED` — confirmed received by server

Query `EventStore` for `LOCAL` events to determine what needs to be pushed.

## Conflict Resolution

Conflicts are resolved via `version` and `lastUpdated` timestamps on `EntityDoc`. The `ConflictService` handles merge logic — do not implement ad-hoc conflict resolution in appliers.
