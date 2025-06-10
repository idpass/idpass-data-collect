---
id: "delete-app-configuration"
title: "Delete app configuration"
description: "Delete an application configuration and associated data"
sidebar_position: 1
tags:
  - "App Configuration"
---

# Delete app configuration

Delete an application configuration and associated data

## Request

**Method:** `DELETE`  
**Path:** `/app-configs/{id}`

**Authentication:** Not required

### Parameters

| Name | Type | In | Required | Description |
|------|------|----|---------:|-------------|
| id | string | path | Yes |  |

## Responses

### 200 - Configuration deleted successfully

## Examples

### cURL
```bash
curl -X DELETE \
  -H "Content-Type: application/json" \
  http://localhost:3000/app-configs/{id}
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/app-configs/{id}', {
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json',
  },
});

const data = await response.json();
console.log(data);
```

---

*This documentation is automatically generated from the OpenAPI specification.*
