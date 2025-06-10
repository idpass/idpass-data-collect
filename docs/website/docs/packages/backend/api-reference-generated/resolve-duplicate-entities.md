---
id: "resolve-duplicate-entities"
title: "Resolve duplicate entities"
description: "Resolve potential duplicate entities by merging or deleting"
sidebar_position: 1
tags:
  - "Data Management"
---

# Resolve duplicate entities

Resolve potential duplicate entities by merging or deleting

## Request

**Method:** `POST`  
**Path:** `/potential-duplicates/resolve`

**Authentication:** Not required

### Request Body

**Content Type:** `application/json`

**Schema:** See component schemas below

## Responses

### 200 - Duplicate resolved successfully

## Examples

### cURL
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  http://localhost:3000/potential-duplicates/resolve \
  -d '{"example": "data"}'
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/potential-duplicates/resolve', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
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
