# Mock Registry Server

> ⚠️ **Do not expose this server to the public internet.** It ships with
> deliberately weak defaults (`admin`/`admin` UI credentials,
> `mock-client`/`mock-secret` OAuth2 credentials, ephemeral JWT/session
> secrets) that are only safe on `localhost` or trusted dev networks. There is
> no rate limiting, no brute-force protection, and no revocation list. This is
> a **reference implementation for adapter development**, not a production
> service. Always change every default credential and set
> `MOCK_JWT_SECRET` + `MOCK_SESSION_SECRET` + `MOCK_SESSION_COOKIE_SECURE=true`
> before any non-localhost deployment.

A lightweight, PublicSchema-aligned registry used as a reference implementation
for DataCollect external sync adapter development.

- Python 3.12+ / [Litestar](https://litestar.dev/) / SQLAlchemy 2.0 / SQLite
- OAuth2 client-credentials for the REST API
- Session-auth HTML UI (Jinja + [htmx](https://htmx.org/) + [Pico.css](https://picocss.com/))
- Zero-config start: `python -m mock_server` binds `:9999`

The server implements the same contract the DataCollect V2 external sync flow
uses against a real backend (pagination, `updated_since`, `If-Match`
concurrency, `system_id` auto-assignment) so adapter authors have a known-good
target to develop against without deploying OpenSPP.

## Quickstart — local

```bash
cd examples/mock-server
uv sync                             # install deps (creates .venv + uv.lock)
uv run python -m mock_server seed   # load 2 households + 5 individuals
uv run python -m mock_server        # start on http://localhost:9999
```

`uv.lock` is committed for reproducible CI/Docker builds. If you bump a
dependency in `pyproject.toml`, regenerate the lockfile with `uv lock`.

Open:

- <http://localhost:9999/> — landing page (login: `admin` / `admin`)
- <http://localhost:9999/docs> — Swagger UI
- <http://localhost:9999/schema> — OpenAPI JSON

Issue a token:

```bash
curl -X POST http://localhost:9999/oauth/token \
  -d grant_type=client_credentials \
  -d client_id=mock-client \
  -d client_secret=mock-secret
```

Call the API:

```bash
TOKEN=...
curl -H "Authorization: Bearer $TOKEN" http://localhost:9999/v1/persons
```

## Quickstart — Docker

```bash
docker build -t mock-registry examples/mock-server
docker run --rm -p 9999:9999 -v $(pwd)/.mock-data:/data mock-registry

# or via the backend docker-compose profile:
docker compose --profile mock -f packages/backend/docker-compose.yml up mock-registry
```

## Data model

Follows [PublicSchema](https://publicschema.org) concepts with flat JSON
serialization (no JSON-LD machinery):

| Concept            | Notes                                                           |
|--------------------|------------------------------------------------------------------|
| `Person`           | Natural person. `given_name`, `family_name`, `date_of_birth`, `gender` (ISO 5218). |
| `Group`            | Collection of persons. `group_type` defaults to `household`.     |
| `Identifier`       | Pure identifier (no lifecycle). Belongs to a Person *or* a Group. |
| `IdentityDocument` | Passport/ID card etc. Carries one `Identifier` plus lifecycle data. |
| `GroupMembership`  | Person ↔ Group link with optional `role` (`head`, `member`).    |

### The `system_id` convention

On Person/Group creation the server auto-assigns an `Identifier` with
`identifier_type="system_id"` and a UUID value.

- The API **always returns** `system_id` rows in `identifiers[]` — adapters
  can use them as a stable external ID when no real-world identifier is
  available.
- The UI **hides** `system_id` rows from display to avoid confusing operators.
- The API **rejects** (`403 FORBIDDEN`) attempts to create or modify
  `system_id` identifiers manually — they are server-assigned only.

## Authentication

| Surface | Method                                                            |
|---------|-------------------------------------------------------------------|
| REST    | OAuth2 client credentials → `POST /oauth/token` → JWT Bearer      |
| UI      | Session cookie (form login at `/ui/login`)                        |

Default credentials (all overridable via env vars — see `.env.example`):

| Purpose       | Default username / ID | Default secret |
|---------------|----------------------|----------------|
| OAuth2 client | `mock-client`        | `mock-secret`  |
| UI session    | `admin`              | `admin`        |

> `MOCK_OAUTH_CLIENT_ID` / `MOCK_OAUTH_CLIENT_SECRET` are used **only** to
> seed a default client row on first startup. The auth source of truth is
> the `api_client` SQLite table (bcrypt-hashed secrets). Once a client is
> seeded, rotating its secret via the UI persists — a restart will not
> reset it. See [Managing API clients](#managing-api-clients) below.

## Managing API clients

Multiple OAuth2 clients are supported. Each has its own `client_id`, a
bcrypt-hashed secret, and independent lifecycle (rotate / revoke / delete).

### Via the UI

Sign in at <http://localhost:9999/ui/login> and open **Clients** in the top
nav (`/ui/clients`). The flow is:

1. **Create** — optional name, optional `client_id` (auto-generated as
   `mc_<8 chars>` if omitted), optional comma-separated scopes.
2. **Copy the secret** — shown **exactly once** on a highlighted card with a
   copy-to-clipboard button. After you leave the page it cannot be recovered.
3. **Rotate** — issues a new secret; the old secret stops working immediately.
4. **Revoke** — soft-delete. Existing JWTs remain valid until they expire,
   but no new tokens can be issued.
5. **Delete** — hard-delete. Irreversible.

### Via the REST API

All endpoints require a valid Bearer token (any existing client can manage
other clients — this is a mock, not an RBAC demo).

```bash
TOKEN=$(curl -s -X POST http://localhost:9999/oauth/token \
  -d grant_type=client_credentials \
  -d client_id=mock-client \
  -d client_secret=mock-secret | jq -r .access_token)

# List
curl -H "Authorization: Bearer $TOKEN" http://localhost:9999/v1/api-clients

# Create — returns { ..., "client_secret": "<one-time plaintext>" }
curl -X POST -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"name":"CI adapter","scopes":["read","write"]}' \
     http://localhost:9999/v1/api-clients

# Rotate (returns a fresh client_secret once)
curl -X POST -H "Authorization: Bearer $TOKEN" \
     http://localhost:9999/v1/api-clients/<uuid>/rotate

# Revoke (soft-delete)
curl -X POST -H "Authorization: Bearer $TOKEN" \
     http://localhost:9999/v1/api-clients/<uuid>/revoke

# Hard-delete
curl -X DELETE -H "Authorization: Bearer $TOKEN" \
     http://localhost:9999/v1/api-clients/<uuid>
```

List/GET responses never include the secret or its hash. `POST` (create)
and `POST /rotate` are the only endpoints that return the plaintext, and
only once.

## Endpoints summary

See `/docs` for the full OpenAPI description. Headline routes:

```
POST   /oauth/token

GET    /v1/persons?updated_since=&limit=&offset=&search=
GET    /v1/persons/{uuid}
POST   /v1/persons
PATCH  /v1/persons/{uuid}              (honours If-Match)
DELETE /v1/persons/{uuid}
POST   /v1/persons/{uuid}/identifiers
POST   /v1/persons/{uuid}/identity-documents

GET    /v1/groups?updated_since=&limit=&offset=&search=
GET    /v1/groups/{uuid}
POST   /v1/groups
PATCH  /v1/groups/{uuid}                (honours If-Match)
DELETE /v1/groups/{uuid}
POST   /v1/groups/{uuid}/members
DELETE /v1/groups/{uuid}/members/{person_uuid}

GET    /v1/api-clients?active_only=&limit=&offset=
GET    /v1/api-clients/{uuid}
POST   /v1/api-clients                  (returns one-time plaintext secret)
POST   /v1/api-clients/{uuid}/rotate    (returns one-time plaintext secret)
POST   /v1/api-clients/{uuid}/revoke
DELETE /v1/api-clients/{uuid}

GET    /health           (no auth)
GET    /schema           (OpenAPI)
GET    /docs             (Swagger UI)
```

### Error envelope

All error responses are shaped:

```json
{ "error": { "code": "PRECONDITION_FAILED", "message": "..." } }
```

## Adapter contract notes

When implementing a DataCollect V2 external sync adapter against this server
(see `packages/adapter-mock` in the monorepo for the TypeScript reference):

1. **Pull**: `GET /v1/persons?updated_since=<watermark>`, paginate via
   `next_offset`, advance the watermark to the max `updated_at` of the page.
2. **Push**: issue `PATCH` requests with `If-Match: <updated_at>` to detect
   concurrent edits. `412 PRECONDITION_FAILED` → map to a non-retryable
   `ConflictError`.
3. **Identifier resolution**: when no real-world identifier is present, use the
   record's `system_id` as the external key. The adapter can push its own DC
   entity `guid` as a different identifier (e.g. type `dc_guid`) to round-trip.
4. **Health**: poll `GET /health` before kicking off a sync cycle.
5. **Auth**: tokens are JWTs valid for `MOCK_JWT_TTL_SECONDS` (default 1h);
   refresh by re-calling `/oauth/token` when expiry approaches.

## CLI

```bash
python -m mock_server            # serve
python -m mock_server serve      # serve (explicit)
python -m mock_server migrate    # create tables
python -m mock_server seed       # load fixtures (no-op if data exists)
python -m mock_server seed --reset   # drop tables, recreate, reload fixtures
```

## Testing

```bash
uv run pytest                    # all tests against a per-test SQLite file
uv run ruff check .
uv run ruff format --check .
```

The test suite covers:

- OAuth2 happy paths and rejection
- Person/Group CRUD + pagination + `updated_since` filter
- `If-Match` hit and miss (412)
- `system_id` auto-assignment and write-protection
- Full adapter sync-contract simulation (two-pass)

## Configuration

All settings are environment variables prefixed with `MOCK_`. See `.env.example`
for the full list. The most relevant for adapter development:

| Env                       | Default                       | Purpose                             |
|---------------------------|-------------------------------|-------------------------------------|
| `MOCK_PORT`               | `9999`                        | Bind port                           |
| `MOCK_DB_PATH`            | `./mock_registry.db`          | SQLite file                         |
| `MOCK_OAUTH_CLIENT_ID`    | `mock-client`                 | OAuth2 client ID                    |
| `MOCK_OAUTH_CLIENT_SECRET`| `mock-secret`                 | OAuth2 client secret                |
| `MOCK_IDENTIFIER_SCHEME`  | `urn:mock:vocab:id-type`      | Scheme URI for auto-`system_id`     |

## Project layout

```
examples/mock-server/
├── mock_server/
│   ├── app.py            Litestar app factory
│   ├── config.py         pydantic-settings
│   ├── db.py             engine + session factory
│   ├── models/           SQLAlchemy ORM
│   ├── schemas/          Pydantic DTOs (PublicSchema-aligned field names)
│   ├── services/         business logic + invariants
│   ├── controllers/      REST + UI route handlers
│   ├── auth/             OAuth2 tokens + guards
│   ├── templates/        Jinja2 + Pico.css + htmx
│   ├── seed.py           fixture loader
│   └── __main__.py       CLI entrypoint
├── tests/                pytest suites
├── Dockerfile
├── pyproject.toml
└── README.md
```

## Not included

This is a reference example. Production features intentionally omitted:

- Rate limiting / request throttling
- Multi-tenant isolation
- Audit log
- Alembic migrations (uses `Base.metadata.create_all` for SQLite simplicity)
- PublicSchema strict JSON-LD (`@context`, `@type`) — flat JSON is used
- Program / Enrollment / VitalEvent concepts

For a full DataCollect backend see `packages/backend`.
