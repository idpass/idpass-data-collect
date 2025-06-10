---
id: "get-potential-duplicates"
title: "Get potential duplicates"
description: "Retrieve list of potential duplicate entities that need resolution"
sidebar_position: 1
tags:
  - "Data Management"
---

# Get potential duplicates

Retrieve list of potential duplicate entities that need resolution

## Request

**Method:** `GET`  
**Path:** `/potential-duplicates`

**Authentication:** Not required

### Parameters

| Name | Type | In | Required | Description |
|------|------|----|---------:|-------------|
| configId | string | query | No | Application configuration ID |

## Responses

### 200 - List of potential duplicates

## Examples

### cURL
```bash
curl -X GET \
  -H "Content-Type: application/json" \
  http://localhost:3000/potential-duplicates
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/potential-duplicates', {
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
