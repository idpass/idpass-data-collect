# API Design Principles

Guidelines for the DataCollect backend REST API (`packages/backend`).

## Auth

- All endpoints require JWT authentication (except `/auth/login`)
- JWT secret from `JWT_SECRET` env var — never hardcode
- User roles: `admin` (manage users, config), `user` (sync data)
- Basic auth supported for external sync endpoints only

## URL Conventions

- Versioned: `/api/v1/...`
- Plural nouns for collections: `/api/v1/entities`, `/api/v1/events`
- Tenant-scoped: include tenant/config ID in path or header as appropriate

## Request / Response Shape

- Always return JSON
- Successful responses: `{ data: ... }`
- Error responses: `{ error: { code: string, message: string } }`
- Use HTTP status codes correctly: 200/201 for success, 400 for validation, 401/403 for auth, 404 for not found, 409 for conflict, 500 for server error

## Sync API

The internal sync endpoint uses pagination — always accept and return a `page` parameter. Default page size is 10. Do not return unbounded result sets.

## Validation

Use the existing middleware patterns in `packages/backend/src/middlewares/`. Validate request bodies before reaching route handlers — do not validate inside handlers.

## OpenAPI

The backend exposes Swagger UI via `pnpm --filter @idpass/data-collect-backend serve-docs`. Keep the OpenAPI spec in sync when adding or changing endpoints.

## No Business Logic in Routes

Route handlers should:
1. Extract and validate input
2. Call a service/store method
3. Return the result

Business logic belongs in services, not in route handlers.
