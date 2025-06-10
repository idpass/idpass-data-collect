---
id: "user-login"
title: "User login"
description: "Authenticate user with email and password, returns JWT token"
sidebar_position: 1
tags:
  - "Authentication"
---

# User login

Authenticate user with email and password, returns JWT token

## Request

**Method:** `POST`  
**Path:** `/users/login`

**Authentication:** Not required

### Request Body

**Content Type:** `application/json`

**Schema:** See component schemas below

## Responses

### 200 - Login successful

### 401 - Invalid credentials

## Examples

### cURL
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3000/users/login \
  -d '{"example": "data"}'
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/users/login', {
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
