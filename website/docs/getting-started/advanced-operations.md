---
id: advanced-operations
title: Advanced Operations
sidebar_position: 6
---

# Advanced Operations

Take your DataCollect implementation to the next level with advanced features like duplicate detection, complex operations, and performance optimization.

### Duplicate Detection and Resolution

```typescript
// Create potential duplicates
const duplicate1 = await manager.submitForm({
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: "create-individual",
  data: { name: "John Doe" },
  timestamp: new Date().toISOString(),
  userId: "user-id",
  syncLevel: SyncLevel.LOCAL,
});

const duplicate2 = await manager.submitForm({
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: "create-individual",
  data: { name: "John Doe" },
  timestamp: new Date().toISOString(),
  userId: "user-id",
  syncLevel: SyncLevel.LOCAL,
});

// Check for potential duplicates
const potentialDuplicates = await manager.getPotentialDuplicates();
console.log("Potential duplicates:", potentialDuplicates);

// Resolve duplicates
if (potentialDuplicates.length > 0) {
  await manager.submitForm({
    guid: uuidv4(),
    type: "resolve-duplicate",
    entityGuid: duplicate2.guid,
    data: { 
      duplicates: [{ 
        entityGuid: duplicate2.guid, 
        duplicateGuid: duplicate1.guid 
      }], 
      shouldDelete: true 
    },
    timestamp: new Date().toISOString(),
    userId: "user-id",
    syncLevel: SyncLevel.LOCAL,
  });
  
  // Verify resolution
  const duplicatesAfter = await manager.getPotentialDuplicates();
  console.log("Duplicates after resolution:", duplicatesAfter);
}
```

### Entity Deletion

```typescript
// Delete an entity
const deleteForm: FormSubmission = {
  guid: uuidv4(),
  entityGuid: individual.guid,
  type: "delete-entity",
  data: { reason: "Data cleanup" },
  timestamp: new Date().toISOString(),
  userId: "user-id",
  syncLevel: SyncLevel.LOCAL,
};

await manager.submitForm(deleteForm);

// Verify deletion
const entitiesAfterDelete = await manager.getAllEntities();
console.log("Entities after deletion:", entitiesAfterDelete.length);
```

### Complex Group Operations

```typescript
// Create a complex group structure
const createComplexGroup = async (groupName: string, members: any[]): Promise<GroupDoc> => {
  const formData: FormSubmission = {
    guid: uuidv4(),
    type: "create-group",
    entityGuid: uuidv4(),
    data: {
      name: groupName,
      headOfGroup: members[0].name,
      members: members,
    },
    timestamp: new Date().toISOString(),
    userId: "test-user",
    syncLevel: SyncLevel.LOCAL,
  };

  return await manager.submitForm(formData) as GroupDoc;
};

// Create multiple groups
const groups = await Promise.all([
  createComplexGroup("Group 1", [
    { guid: uuidv4(), name: "John Doe", dateOfBirth: "1980-01-01", relationship: "Head" },
    { guid: uuidv4(), name: "Jane Doe", dateOfBirth: "1982-02-02", relationship: "Spouse" },
    { guid: uuidv4(), name: "Jimmy Doe", dateOfBirth: "2010-03-03", relationship: "Child" },
  ]),
  createComplexGroup("Group 2", [
    { guid: uuidv4(), name: "Bob Smith", dateOfBirth: "1975-05-05", relationship: "Head" },
    { guid: uuidv4(), name: "Alice Smith", dateOfBirth: "1977-06-06", relationship: "Spouse" },
  ]),
]);

console.log("Created groups:", groups.length);

// Modify groups
const removeMember = async (groupId: string, memberId: string): Promise<GroupDoc> => {
  const formData: FormSubmission = {
    guid: uuidv4(),
    type: "remove-member",
    entityGuid: groupId,
    data: { memberId },
    timestamp: new Date().toISOString(),
    userId: "test-user",
    syncLevel: SyncLevel.LOCAL,
  };
  return await manager.submitForm(formData) as GroupDoc;
};

// Remove a member from the first group
const updatedGroup = await removeMember(groups[0].guid, groups[0].memberIds[0]);
console.log("Updated group member count:", updatedGroup.memberIds.length);
```
