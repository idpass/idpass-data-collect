---
id: entity-retrieval-and-search
title: Entity Retrieval and Search
sidebar_position: 4
---

# Entity Retrieval and Search

Master the art of finding and retrieving your data efficiently. This tutorial covers various search patterns and data access methods.

### Getting Individual Entities

```typescript
// Get a specific entity by GUID
const entity = await manager.getEntity(individual.guid);
if (entity) {
  console.log("Retrieved entity:", entity.modified);
  console.log("Entity type:", entity.modified.type);
  console.log("Entity name:", entity.modified.name);
}
```

### Getting All Entities

```typescript
// Get all entities
const allEntities = await manager.getAllEntities();
console.log("Total entities:", allEntities.length);

// Filter by type
const individuals = allEntities.filter(e => e.modified.type === EntityType.Individual);
const groups = allEntities.filter(e => e.modified.type === EntityType.Group);

console.log("Individuals:", individuals.length);
console.log("Groups:", groups.length);
```

### Searching Entities

```typescript
// Search by name
const nameResults = await manager.searchEntities([{ name: "John Doe" }]);
console.log("Name search results:", nameResults);

// Search by age range
const ageResults = await manager.searchEntities([{ age: { $gt: 25 } }]);
console.log("Age search results:", ageResults);

// Search by type
const groupResults = await manager.searchEntities([{ type: "group" }]);
console.log("Group search results:", groupResults);

// Search by email pattern
const emailResults = await manager.searchEntities([{ email: { $regex: "@example.com$" } }]);
console.log("Email search results:", emailResults);
```
