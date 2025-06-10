---
id: "pull-audit-logs-from-server"
title: "Pull audit logs from server"
description: "Retrieve audit log entries since a specific timestamp"
sidebar_position: 1
tags:
  - "Synchronization"
---

# Pull audit logs from server

Retrieve audit log entries since a specific timestamp

## Request

**Method:** `GET`  
**Path:** `/sync/pull/audit-logs`

**Authentication:** Not required

### Parameters

| Name | Type | In | Required | Description |
|------|------|----|---------:|-------------|
| since | string | query | No | Timestamp to pull audit logs since |
| configId | string | query | No | Application configuration ID |

## Responses

### 200 - Audit logs retrieved successfully

## Examples

### cURL
```bash
curl -X GET \
  -H "Content-Type: application/json" \
  http://localhost:3000/sync/pull/audit-logs
```

### JavaScript
```javascript
const response = await fetch('http://localhost:3000/sync/pull/audit-logs', {
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
