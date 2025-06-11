---
id: backend-api-overview
title: Backend API Overview
sidebar_position: 1
---

# Backend REST API Overview

The ID PASS Data Collect Backend provides a comprehensive REST API automatically documented from the OpenAPI 3.0 specification.

## 🔄 **Auto-Generated Documentation**

The API documentation below is **automatically generated** from the backend's `openapi.yaml` specification file. This ensures:

- **Always Up-to-Date**: Documentation reflects the current implementation
- **Consistent**: No manual synchronization needed
- **Interactive**: Test endpoints directly from the documentation
- **Complete**: All endpoints, schemas, and examples included

## 📚 **API Documentation Structure**

The generated documentation is organized by **API tags**:

- **Authentication** - User login and token management
- **User Management** - CRUD operations for users (Admin only)
- **Synchronization** - Data sync between clients and server
- **App Configuration** - Multi-tenant configuration management
- **Data Management** - Entity management and duplicate resolution

## 🌐 **Interactive Testing**

For live API testing with Swagger UI, start the backend server and visit:

```
http://localhost:3000/api-docs
```

## 🔧 **Authentication**

Most endpoints require JWT authentication. Include the token in requests:

```bash
Authorization: Bearer <your-jwt-token>
```

### Getting a Token

```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "your-password"}'
```

## 📖 **OpenAPI Specification**

The complete specification is available at:
- **Source File**: [`packages/backend/openapi.yaml`](https://github.com/idpass/idpass-data-collect/blob/main/packages/backend/openapi.yaml)
- **Interactive Docs**: `http://localhost:3000/api-docs` (when server is running)

## 🔄 **Documentation Generation**

This documentation is regenerated automatically during the build process from the OpenAPI specification. To manually regenerate:

```bash
cd docs/website
npm run generate-api-docs
```

## 🛡️ **Validation & Quality**

The API documentation is validated through:
- **CI/CD Pipeline**: Automatic validation on every commit
- **Runtime Validation**: Server validates requests/responses against the spec
- **Developer Tools**: Local validation during development

---

*The following sections contain the auto-generated API documentation from the OpenAPI specification.*