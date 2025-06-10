---
id: "push-events-to-server"
title: "Push events to server"
description: "Send form submission events to the server for processing"
sidebar_position: 1
tags:
  - "Synchronization"
---

# Push events to server

Send form submission events to the server for processing

## Request

**Method:** `POST`  
**Path:** `/sync/push`

**Authentication:** Not required

### Request Body

**Content Type:** `application/json`

**Schema:** See component schemas below

## Responses

### 200 - Events processed successfully

## Examples

### cURL
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  http://localhost:3000/sync/push \
  -d '{"example": "data"}'
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/sync/push', {
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
