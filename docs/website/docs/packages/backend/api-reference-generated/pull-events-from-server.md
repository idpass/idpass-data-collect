---
id: "pull-events-from-server"
title: "Pull events from server"
description: "Retrieve events from server since a specific timestamp with pagination"
sidebar_position: 1
tags:
  - "Synchronization"
---

# Pull events from server

Retrieve events from server since a specific timestamp with pagination

## Request

**Method:** `GET`  
**Path:** `/sync/pull`

**Authentication:** Not required

### Parameters

| Name | Type | In | Required | Description |
|------|------|----|---------:|-------------|
| since | string | query | No | Timestamp to pull events since |
| configId | string | query | No | Application configuration ID |

## Responses

### 200 - Events retrieved successfully

## Examples

### cURL
```bash
curl -X GET \
  -H "Content-Type: application/json" \
  http://localhost:3000/sync/pull
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/sync/pull', {
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
