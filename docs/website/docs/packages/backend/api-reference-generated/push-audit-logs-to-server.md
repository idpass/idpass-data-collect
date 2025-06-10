---
id: "push-audit-logs-to-server"
title: "Push audit logs to server"
description: "Send audit log entries to the server"
sidebar_position: 1
tags:
  - "Synchronization"
---

# Push audit logs to server

Send audit log entries to the server

## Request

**Method:** `POST`  
**Path:** `/sync/push/audit-logs`

**Authentication:** Not required

### Request Body

**Content Type:** `application/json`

**Schema:** See component schemas below

## Responses

### 200 - Audit logs processed successfully

## Examples

### cURL
```bash
curl -X POST \
  -H "Content-Type: application/json" \
  http://localhost:3000/sync/push/audit-logs \
  -d '{"example": "data"}'
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/sync/push/audit-logs', {
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
