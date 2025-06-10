---
id: "trigger-external-sync"
title: "Trigger external sync"
description: "Synchronize data with external systems using configured adapters"
sidebar_position: 1
tags:
  - "Synchronization"
---

# Trigger external sync

Synchronize data with external systems using configured adapters

## Request

**Method:** `POST`  
**Path:** `/sync/external`

**Authentication:** Not required

### Request Body

**Content Type:** `application/json`

**Schema:** See component schemas below

## Responses

### 200 - External sync completed

## Examples

### cURL
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  http://localhost:3000/sync/external \
  -d '{"example": "data"}'
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/sync/external', {
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
