---
id: forms-and-entities-authenticated
title: Working with Forms and Entities (Authenticated)
sidebar_position: 3
---

# Working with Forms and Entities (Authenticated)

This tutorial demonstrates how to submit forms and work with entities in an authenticated environment.

### Authenticated Entity Operations

```typescript
// Ensure authentication before operations
if (!await manager.isAuthenticated()) {
  await manager.login({
    username: "admin@example.com",
    password: "password123"
  });
}

// Create a new individual
const individualForm: FormSubmission = {
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: "create-individual",
  data: { 
    name: "John Doe",
    age: 30,
    email: "john.doe@example.com"
  },
  timestamp: new Date().toISOString(),
  userId: "user-id",
  syncLevel: SyncLevel.LOCAL,
};

const individual = await manager.submitForm(individualForm);
console.log("Created individual:", individual);
```

### Creating Groups with Authentication

```typescript
// Create a new group (requires authentication)
const groupForm: FormSubmission = {
  guid: uuidv4(),
  entityGuid: uuidv4(),
  type: "create-group",
  data: { 
    name: "Family Group",
    headOfGroup: "John Doe",
    address: "123 Main St",
    phoneNumber: "555-1234"
  },
  timestamp: new Date().toISOString(),
  userId: "user-id",
  syncLevel: SyncLevel.LOCAL,
};

const group = await manager.submitForm(groupForm);
console.log("Created group:", group);
```

### Creating Groups with Initial Members

```typescript
// Create a group with initial members
const familyForm: FormSubmission = {
  guid: uuidv4(),
  type: "create-group",
  entityGuid: uuidv4(),
  data: {
    name: "Doe Family",
    headOfGroup: "John Doe",
    address: "123 Main St",
    phoneNumber: "555-1234",
    email: "john@doe.com",
    income: 50000,
    members: [
      { 
        guid: uuidv4(), 
        name: "Jane Doe", 
        dateOfBirth: "1985-05-15", 
        relationship: "Spouse" 
      },
      { 
        guid: uuidv4(), 
        name: "Jimmy Doe", 
        dateOfBirth: "2010-03-20", 
        relationship: "Child" 
      },
    ],
  },
  timestamp: new Date().toISOString(),
  userId: "user-1",
  syncLevel: SyncLevel.LOCAL,
};

const family = await manager.submitForm(familyForm);
console.log("Created family with members:", family);
```

### Adding Members to Existing Groups

```typescript
// Add a member to an existing group
const addMemberForm: FormSubmission = {
  guid: uuidv4(),
  type: "add-member",
  entityGuid: group.guid, // Use the group's GUID
  data: {
    members: [
      { 
        guid: uuidv4(), 
        name: "New Member", 
        dateOfBirth: "1990-01-01", 
        relationship: "Friend" 
      }
    ],
  },
  timestamp: new Date().toISOString(),
  userId: "user-1",
  syncLevel: SyncLevel.LOCAL,
};

const updatedGroup = await manager.submitForm(addMemberForm);
console.log("Updated group:", updatedGroup);
```

### Updating Entities

```typescript
// Update an existing individual
const updateForm: FormSubmission = {
  guid: uuidv4(),
  entityGuid: individual.guid, // Use the individual's GUID
  type: "update-individual",
  data: { 
    name: "John Doe Updated",
    age: 31,
    email: "john.updated@example.com"
  },
  timestamp: new Date().toISOString(),
  userId: "user-id",
  syncLevel: SyncLevel.LOCAL,
};

const updatedIndividual = await manager.submitForm(updateForm);
console.log("Updated individual:", updatedIndividual);
```

### Using Custom Event Appliers

```typescript
// Use the custom add-elderly applier
const addElderlyForm: FormSubmission = {
  guid: uuidv4(),
  type: "add-elderly",
  entityGuid: group.guid,
  data: {
    members: [
      { 
        name: "Grandpa Joe", 
        dateOfBirth: "1940-02-20", 
        relationship: "Parent" 
      }
    ],
  },
  timestamp: new Date().toISOString(),
  userId: "user-1",
  syncLevel: SyncLevel.LOCAL,
};

const groupWithElderly = await manager.submitForm(addElderlyForm);
console.log("Group with elderly member:", groupWithElderly);
```
