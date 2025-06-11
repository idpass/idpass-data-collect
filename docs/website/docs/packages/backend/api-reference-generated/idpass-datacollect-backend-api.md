---
id: "idpass-datacollect-backend-api"
title: "ID PASS Data Collect Backend API"
description: "REST API for ID PASS Data Collect backend server, providing synchronization, user management, and application configuration endpoints.

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Multi-tenant Support

The API supports multiple application configurations identified by `configId`. Each configuration can have its own entity forms, data, and external sync settings.

## Synchronization

The sync endpoints support bidirectional synchronization between clients and server, as well as external system integration. Events are synchronized with pagination for efficient data transfer.
"
sidebar_position: 1
---

# ID PASS Data Collect Backend API

REST API for ID PASS Data Collect backend server, providing synchronization, user management, and application configuration endpoints.

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

## Multi-tenant Support

The API supports multiple application configurations identified by `configId`. Each configuration can have its own entity forms, data, and external sync settings.

## Synchronization

The sync endpoints support bidirectional synchronization between clients and server, as well as external system integration. Events are synchronized with pagination for efficient data transfer.


**Version:** 1.0.0

## API Information

- **Base URL:** `http://localhost:3000`
- **Authentication:** Bearer JWT tokens
- **Content Type:** `application/json`

## Quick Start

### 1. Authentication

Most endpoints require JWT authentication. Get a token by logging in:

```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "your-password"
  }'
```

### 2. Using the Token

Include the token in subsequent requests:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/users/me
```

## API Endpoints

This API provides the following endpoint categories:

- **0** - User authentication endpoints
- **1** - User account management (Admin only)
- **2** - Data synchronization between clients and server
- **3** - Application configuration management
- **4** - Entity data management and duplicate resolution

## Interactive Documentation

For live API testing, start the backend server and visit:
`http://localhost:3000/api-docs`

## OpenAPI Specification

- **Download:** [openapi.yaml](https://raw.githubusercontent.com/idpass/idpass-data-collect/main/packages/backend/openapi.yaml)
- **Interactive:** [Swagger UI](http://localhost:3000/api-docs) (when server is running)

---

*This documentation is automatically generated from the OpenAPI specification.*
