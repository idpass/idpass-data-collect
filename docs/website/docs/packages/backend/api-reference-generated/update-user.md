---
id: "update-user"
title: "Update user"
description: "Update an existing user (Admin only)"
sidebar_position: 1
tags:
  - "User Management"
---

# Update user

Update an existing user (Admin only)

## Request

**Method:** `PUT`  
**Path:** `/users/{id}`

**Authentication:** Required (Bearer JWT)

### Parameters

| Name | Type | In | Required | Description |
|------|------|----|---------:|-------------|
| id | integer | path | Yes |  |

### Request Body

**Content Type:** `application/json`

**Schema:** See component schemas below

## Responses

### 200 - User updated successfully

### 404 - User not found

## Examples

### cURL
```bash
curl -X PUT \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3000/users/{id} \
  -d '{"example": "data"}'
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/users/{id}', {
  method: 'PUT',
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
