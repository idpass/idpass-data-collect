---
id: "create-new-user"
title: "Create new user"
description: "Create a new user account (Admin only)"
sidebar_position: 1
tags:
  - "User Management"
---

# Create new user

Create a new user account (Admin only)

## Request

**Method:** `POST`  
**Path:** `/users`

**Authentication:** Required (Bearer JWT)

### Request Body

**Content Type:** `application/json`

**Schema:** See component schemas below

## Responses

### 201 - User created successfully

### 403 - Admin access required

## Examples

### cURL
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3000/users \
  -d '{"example": "data"}'
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/users', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token,
  },
  body: JSON.stringify({
    // Request data
  }),
});

const data = await response.json();
console.log(data);
```

---

*This documentation is automatically generated from the OpenAPI specification.*
