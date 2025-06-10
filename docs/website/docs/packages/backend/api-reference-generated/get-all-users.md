---
id: "get-all-users"
title: "Get all users"
description: "Retrieve all users (Admin only)"
sidebar_position: 1
tags:
  - "User Management"
---

# Get all users

Retrieve all users (Admin only)

## Request

**Method:** `GET`  
**Path:** `/users`

**Authentication:** Required (Bearer JWT)

## Responses

### 200 - List of users

### 403 - Admin access required

## Examples

### cURL
```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3000/users
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/users', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token,
  },
});

const data = await response.json();
console.log(data);
```

---

*This documentation is automatically generated from the OpenAPI specification.*
