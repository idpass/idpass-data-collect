---
id: "get-all-app-configurations"
title: "Get all app configurations"
description: "Retrieve all application configurations"
sidebar_position: 1
tags:
  - "App Configuration"
---

# Get all app configurations

Retrieve all application configurations

## Request

**Method:** `GET`  
**Path:** `/app-configs`

**Authentication:** Not required

## Responses

### 200 - List of app configurations

## Examples

### cURL
```bash
curl -X GET \
  -H "Content-Type: application/json" \
  http://localhost:3000/app-configs
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/app-configs', {
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
