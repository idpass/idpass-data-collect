---
id: "count-entities"
title: "Count entities"
description: "Get the total count of entities for a specific app configuration"
sidebar_position: 1
tags:
  - "Synchronization"
---

# Count entities

Get the total count of entities for a specific app configuration

## Request

**Method:** `GET`  
**Path:** `/sync/count-entities`

**Authentication:** Not required

### Parameters

| Name | Type | In | Required | Description |
|------|------|----|---------:|-------------|
| configId | string | query | No | Application configuration ID |

## Responses

### 200 - Entity count

## Examples

### cURL
```bash
curl -X GET \
  -H "Content-Type: application/json" \
  http://localhost:3000/sync/count-entities
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/sync/count-entities', {
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
