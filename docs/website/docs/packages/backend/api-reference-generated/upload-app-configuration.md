---
id: "upload-app-configuration"
title: "Upload app configuration"
description: "Upload a new application configuration as JSON file"
sidebar_position: 1
tags:
  - "App Configuration"
---

# Upload app configuration

Upload a new application configuration as JSON file

## Request

**Method:** `POST`  
**Path:** `/app-configs`

**Authentication:** Not required

## Responses

### 200 - Configuration uploaded successfully

### 400 - No JSON file uploaded or invalid file

## Examples

### cURL
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  http://localhost:3000/app-configs \
  -d '{"example": "data"}'
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/app-configs', {
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
