---
id: "validate-jwt-token"
title: "Validate JWT token"
description: "Check if the provided JWT token is valid"
sidebar_position: 1
tags:
  - "Authentication"
---

# Validate JWT token

Check if the provided JWT token is valid

## Request

**Method:** `GET`  
**Path:** `/users/check-token`

**Authentication:** Not required

## Responses

### 200 - Token is valid

### 401 - Invalid or expired token

## Examples

### cURL
```bash
curl -X GET \
  -H "Content-Type: application/json" \
  http://localhost:3000/users/check-token
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/users/check-token', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
console.log(data);
```

---

*This documentation is automatically generated from the OpenAPI specification.*
