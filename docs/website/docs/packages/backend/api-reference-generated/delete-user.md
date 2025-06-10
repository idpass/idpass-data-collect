---
id: "delete-user"
title: "Delete user"
description: "Delete a user by email (Admin only)"
sidebar_position: 1
tags:
  - "User Management"
---

# Delete user

Delete a user by email (Admin only)

## Request

**Method:** `DELETE`  
**Path:** `/users/{email}`

**Authentication:** Required (Bearer JWT)

### Parameters

| Name | Type | In | Required | Description |
|------|------|----|---------:|-------------|
| email | string | path | Yes |  |

## Responses

### 200 - User deleted successfully

## Examples

### cURL
```bash
curl -X DELETE \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3000/users/{email}
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/users/{email}', {
  method: 'DELETE',
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
