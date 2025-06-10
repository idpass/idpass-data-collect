---
id: "get-current-user"
title: "Get current user"
description: "Get the current authenticated user's information"
sidebar_position: 1
tags:
  - "User Management"
---

# Get current user

Get the current authenticated user's information

## Request

**Method:** `GET`  
**Path:** `/users/me`

**Authentication:** Required (Bearer JWT)

## Responses

### 200 - Current user information

### 404 - User not found

## Examples

### cURL
```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3000/users/me
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/users/me', {
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
