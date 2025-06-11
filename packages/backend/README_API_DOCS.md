# Backend API Documentation

## Overview

The ID PASS DataCollect backend provides a comprehensive REST API for data synchronization, user management, and application configuration. The API is fully documented using OpenAPI 3.0 specification.

## Quick Start

### 1. View Interactive Documentation

When the server is running, visit:
```
http://localhost:3000/api-docs
```

This provides an interactive Swagger UI where you can:
- Browse all endpoints
- Test API calls directly
- View request/response schemas
- Understand authentication requirements

### 2. Install Dependencies

```bash
cd packages/backend
npm install
```

### 3. Start Development Server

```bash
npm run dev
```

The server will start on port 3000 with API documentation available at `/api-docs`.

## API Documentation Files

- **`openapi.yaml`** - Complete OpenAPI 3.0 specification
- **`API_DOCUMENTATION_MAINTENANCE.md`** - Maintenance strategy and best practices

## Validation and Quality Assurance

### Validate OpenAPI Specification

```bash
npm run validate-api
```

This checks the OpenAPI spec for syntax errors and validates against the OpenAPI 3.0 schema.

### CI/CD Integration

The GitHub Actions workflow automatically:
- Validates the OpenAPI specification on every PR
- Ensures documentation stays in sync with code changes
- Prevents merging code that breaks API contracts

## API Endpoints Overview

### Authentication
- `POST /api/users/login` - User authentication
- `GET /api/users/check-token` - Token validation

### User Management (Admin only)
- `GET /api/users` - List all users
- `POST /api/users` - Create new user
- `PUT /api/users/{id}` - Update user
- `DELETE /api/users/{email}` - Delete user
- `GET /api/users/me` - Get current user

### Data Synchronization
- `GET /api/sync/pull` - Pull events from server
- `POST /api/sync/push` - Push events to server
- `GET /api/sync/count-entities` - Count entities
- `POST /api/sync/external` - External system sync
- Audit log endpoints for tracking changes

### App Configuration
- `GET /api/apps` - List configurations
- `POST /api/apps` - Upload new configuration
- `DELETE /api/apps/{id}` - Delete configuration

### Data Management
- `GET /api/potential-duplicates` - List potential duplicates
- `POST /api/potential-duplicates/resolve` - Resolve duplicates

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

```bash
Authorization: Bearer <your-jwt-token>
```

### Getting a Token

```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@hdm.example",
    "password": "your-password"
  }'
```

## Multi-tenant Support

The API supports multiple application configurations via the `configId` parameter. Each configuration can have:
- Custom entity forms
- Pre-loaded data
- External sync settings

## Development Workflow

### Adding New Endpoints

When adding new API endpoints:

1. **Update the code** - Add routes, handlers, types
2. **Update OpenAPI spec** - Document new endpoints in `openapi.yaml`
3. **Validate changes** - Run `npm run validate-api`
4. **Test in Swagger UI** - Verify documentation accuracy
5. **Add tests** - Include API contract tests

### Maintenance Checklist

- [ ] OpenAPI spec updated for any API changes
- [ ] Validation passes (`npm run validate-api`)
- [ ] Swagger UI displays correctly
- [ ] Tests include API contract validation
- [ ] CI pipeline passes

## Deployment Considerations

### Production Environment

In production:
- API documentation is served at `/api-docs`
- OpenAPI validation helps catch issues early
- Monitoring can track validation failures
- Documentation stays current with implementation

### Security

- JWT tokens for authentication
- Role-based access control (Admin/User)
- Request/response validation against schema
- No sensitive data in documentation examples

## Examples

### Basic Authentication Flow

```bash
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hdm.example","password":"admin1@"}' \
  | jq -r '.token')

# 2. Use token for authenticated requests
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/users/me
```

### Sync Operations

```bash
# Pull events since timestamp
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/api/sync/pull?since=2024-01-01T00:00:00.000Z&configId=default"

# Push events to server
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  http://localhost:3000/api/sync/push \
  -d '{"configId":"default","events":[...]}'
```

## Troubleshooting

### Common Issues

1. **OpenAPI validation fails**
   - Check YAML syntax
   - Verify all references are valid
   - Ensure examples match schemas

2. **Swagger UI not loading**
   - Check server logs for errors
   - Verify `openapi.yaml` exists and is readable
   - Ensure all dependencies are installed

3. **Authentication errors**
   - Verify JWT token format
   - Check token expiration
   - Ensure correct Authorization header format

### Getting Help

- Review the interactive documentation at `/api-docs`
- Check the OpenAPI specification in `openapi.yaml`
- Look at existing tests for usage examples
- Review the maintenance guide for best practices

---

*This documentation is automatically kept in sync with the implementation through CI/CD validation and runtime checks.*