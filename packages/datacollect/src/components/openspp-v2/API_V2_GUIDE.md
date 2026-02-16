# OpenSPP API V2 and Studio Integration Guide

This guide explains how to use the V2 APIs (`spp_api_v2`) for external integrations, including how Studio custom fields are exposed via the API.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Core API Endpoints](#core-api-endpoints)
4. [External Identifiers](#external-identifiers)
5. [Consent-Based Access Control](#consent-based-access-control)
6. [Consent Management API](#consent-management-api)
7. [Group Membership Operations](#group-membership-operations)
8. [Batch and Transaction Bundles](#batch-and-transaction-bundles)
9. [Bulk Export](#bulk-export)
10. [Extension System](#extension-system)
11. [Studio Integration](#studio-integration)
12. [Example API Workflows](#example-api-workflows)
13. [Audit Logging](#audit-logging)
14. [Extension Module Endpoints](#extension-module-endpoints)

---

## Overview

OpenSPP API V2 is a modern, standards-aligned REST API designed for:

- **G2P Connect / DCI compliance** - International social protection interoperability standards
- **Consent-based access** - All data access respects explicit registrant consent
- **External identifiers only** - Never exposes internal database IDs
- **Namespace URIs** - Globally unique identifiers for all ID types and vocabularies
- **Source tracking** - Tracks data provenance for audit purposes
- **Extensibility** - Module-specific fields exposed via extensions
- **Unified audit logging** - All API operations logged per ADR-020

### Key Modules

| Module | Purpose |
|--------|---------|
| `spp_api_v2` | Core V2 API (Individual, Group, Program, ProgramMembership, Consent, Batch, Bulk, Filter endpoints) |
| `spp_studio_api_v2` | Exposes Studio custom fields and variables via API |
| `spp_api_v2_vocabulary` | Vocabulary/code list endpoints |
| `spp_api_v2_cycles` | Program cycle endpoints |
| `spp_api_v2_entitlements` | Entitlement endpoints |
| `spp_api_v2_service_points` | Service point endpoints |
| `spp_api_v2_products` | Product/category/UoM endpoints |
| `spp_api_v2_change_request` | Change request workflow endpoints |
| `spp_api_v2_verifiable_credentials` | Verifiable credential issuance/verification |
| `spp_api_v2_data` | Data push/pull/invalidate endpoints |
| `spp_api_v2_drims` | DRIMS dispatch/incident/request GeoJSON endpoints |
| `spp_vc_openid4vci` | OpenID4VCI credential issuance |

### Key Design Decisions (ADRs)

| ADR | Summary |
|-----|---------|
| ADR-019 | Modernized response format: `SearchResult` replaces FHIR `Bundle`, `type` replaces `resourceType`, RFC 9457 `ProblemDetail` for errors |
| ADR-020 | Unified API audit log (`spp.api.audit.log`) replaces per-consent access logs |

---

## Authentication

### OAuth 2.0 Client Credentials Flow

1. **Create an API Client** (Admin):
   - Go to `Configuration > API V2 > API Clients`
   - Create new client, copy `client_id` and `client_secret`
   - Add scopes (e.g., `individual:read`, `individual:create`)

2. **Get Access Token**:

```bash
curl -X POST http://localhost:8069/api/v2/spp/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "your-client-id",
    "client_secret": "your-client-secret"
  }'
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "individual:read individual:create group:read"
}
```

3. **Use Token in Requests**:

```bash
curl http://localhost:8069/api/v2/spp/Individual \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Security Features

- **Scrypt-hashed secrets** - Client secrets are stored securely using memory-hard hashing
- **Organization type verification** - Prevents spoofing for category-based consent
- **Rate limiting** - Authentication endpoint rate-limited to 5 req/min per IP
- **Anti-enumeration** - Timing jitter on not-found/denied responses

---

## Core API Endpoints

### Metadata

```
GET /api/v2/spp/metadata
```

Returns API capability information (public, no auth required). Includes supported resources, operations, search parameters, available extensions, and authentication configuration.

### Individual Endpoints

| Method | Endpoint | Scope Required | Description |
|--------|----------|----------------|-------------|
| GET | `/Individual/{identifier}` | `individual:read` | Read by external ID |
| GET | `/Individual` | `individual:read` | Search individuals |
| POST | `/Individual` | `individual:create` | Create individual |
| PUT | `/Individual/{identifier}` | `individual:update` | Full update (replace) |
| PATCH | `/Individual/{identifier}` | `individual:update` | Partial update (RFC 7396) |
| GET | `/Individual/{identifier}/groups` | `individual:read` | Get group memberships |

### Group Endpoints

| Method | Endpoint | Scope Required | Description |
|--------|----------|----------------|-------------|
| GET | `/Group/{identifier}` | `group:read` | Read by external ID |
| GET | `/Group` | `group:read` | Search groups |
| POST | `/Group` | `group:create` | Create group |
| PUT | `/Group/{identifier}` | `group:update` | Full update (replace) |
| PATCH | `/Group/{identifier}` | `group:update` | Partial update (RFC 7396) |
| POST | `/Group/{identifier}/$add-member` | `group:update` | Add member to group |
| POST | `/Group/{identifier}/$remove-member` | `group:update` | Remove member from group |
| PATCH | `/Group/{identifier}/member/{individual}` | `group:update` | Update member role |
| POST | `/Group/$merge` | `group:update` | Merge two groups |
| POST | `/Group/{identifier}/$split` | `group:create,update` | Split group |
| GET | `/Group/{identifier}/membership-history` | `group:read` | Get membership history |

### Program Endpoints

| Method | Endpoint | Scope Required | Description |
|--------|----------|----------------|-------------|
| GET | `/Program` | `program:read` | List programs (cursor-based pagination) |
| GET | `/Program/{identifier}` | `program:read` | Read program |

### ProgramMembership Endpoints

| Method | Endpoint | Scope Required | Description |
|--------|----------|----------------|-------------|
| GET | `/ProgramMembership` | `program_membership:read` | Search memberships |
| GET | `/ProgramMembership/{identifier}` | `program_membership:read` | Read membership |
| POST | `/ProgramMembership` | `program_membership:create` | Create enrollment |
| PUT | `/ProgramMembership/{identifier}` | `program_membership:update` | Update membership |

### Consent Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/Consent/{consent_id}` | Get consent status |
| POST | `/Consent/{consent_id}/$revoke` | Revoke consent (GDPR Art 7.3) |
| DELETE | `/Consent/{consent_id}` | Revoke consent (alternative) |
| GET | `/Consent/{consent_id}/$receipt` | Get consent receipt (ISO 29184) |
| GET | `/Consent/{consent_id}/$history` | Get consent version history |
| GET | `/Consent/{consent_id}/$access-summary` | Get data access summary |

### Batch Endpoint

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/$batch` | Process transaction or batch bundle |

### Bulk Export Endpoint

| Method | Endpoint | Scope Required | Description |
|--------|----------|----------------|-------------|
| POST | `/$bulk/export` | `{type}:read` | Bulk export up to 100 resources |

### Filter Discovery and Advanced Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/{Resource}/_filters` | Get available filters and presets for a resource |
| POST | `/{Resource}/_search` | Advanced search with compound AND/OR filters |

Supported resources: `Individual`, `Group`, `Program`, `ProgramMembership`.

The `_filters` endpoint returns metadata about filterable fields, allowed operators, and saved presets. The `_search` endpoint accepts a JSON request body with complex filter conditions, compound logic, presets, sorting, and cursor-based pagination. The response uses the legacy Bundle format (`searchset` type).

### Partial Updates (PATCH)

PATCH endpoints use **JSON Merge Patch (RFC 7396)**:
- Only specified fields are updated
- Omitted fields remain unchanged
- Set a field to `null` to clear it
- Supports `If-Match` header for optimistic locking

```bash
PATCH /api/v2/spp/Individual/urn:gov:ph:psa:national-id|PH-123
Content-Type: application/json
If-Match: "1705312456123456"

{
  "name": {
    "family": "SANTOS",
    "given": "Maria Elena"
  },
  "telecom": [
    {
      "system": "phone",
      "value": "+639171234567",
      "use": "mobile",
      "rank": 1
    }
  ]
}
```

### Sparse Fieldsets (`_elements`)

Use `_elements` to request only specific fields, reducing response size:

```bash
# Only return name and birthDate fields
GET /Individual/urn:gov:ph:psa:national-id|PH-123?_elements=name,birthDate

# Combined with extensions
GET /Individual/urn:gov:ph:psa:national-id|PH-123?_elements=name,birthDate&_extensions=farmer
```

### Search Parameters

The search endpoints support FHIR-inspired query parameters:

```bash
# Search individuals by name
GET /Individual?name=Juan

# Search with date prefix (ge = greater or equal)
GET /Individual?birthdate=ge1990-01-01

# Search by identifier (namespace|value format)
GET /Individual?identifier=urn:gov:ph:psa:national-id|PH-123

# Search individuals in a specific group
GET /Individual?group=urn:openspp:group|HH-001

# Search orphan individuals (not in any group)
GET /Individual?group=none

# Search by membership role
GET /Individual?membership-role=head

# Pagination (offset-based for Individual/Group endpoints)
GET /Individual?_count=20&_offset=0

# Sorting (- prefix for descending)
GET /Individual?_sort=-birthDate

# Sparse fieldsets
GET /Individual?_elements=name,birthDate,gender
```

**Pagination Note:** Individual/Group/ProgramMembership endpoints use offset-based pagination (`_offset`). Program and Studio endpoints use cursor-based pagination (`_lastId`). Advanced search (`_search`) endpoints also use cursor-based pagination.

---

## Response Format (ADR-019)

### Resource Responses

All resources use `type` (not `resourceType`) as the discriminator field:

```json
{
  "type": "Individual",
  "identifier": [
    {
      "system": "urn:gov:ph:psa:national-id",
      "value": "PH-123456789"
    }
  ],
  "name": {
    "family": "SANTOS",
    "given": "Maria",
    "text": "SANTOS, Maria"
  },
  "birthDate": "1985-03-15",
  "gender": {
    "coding": [
      {
        "system": "urn:iso:std:iso:5218",
        "code": "2",
        "display": "Female"
      }
    ]
  }
}
```

**Note:** Group resources use `groupType` (not `type`) for the group classification to avoid collision with the resource discriminator:

```json
{
  "type": "Group",
  "groupType": "household",
  "identifier": [{"system": "urn:openspp:group", "value": "HH-001"}],
  "name": "Santos Household"
}
```

### Search Responses (`SearchResult`)

Search endpoints return a `SearchResult` envelope (replaces FHIR `Bundle`):

```json
{
  "data": [
    {
      "type": "Individual",
      "identifier": [{"system": "urn:gov:ph:psa:national-id", "value": "PH-123"}],
      "name": {"family": "SANTOS", "given": "Maria"}
    },
    {
      "type": "Individual",
      "identifier": [{"system": "urn:gov:ph:psa:national-id", "value": "PH-456"}],
      "name": {"family": "REYES", "given": "Ana"}
    }
  ],
  "meta": {
    "total": 100,
    "count": 2,
    "offset": 0
  },
  "links": {
    "self": "/api/v2/spp/Individual?name=Santos&_count=2",
    "next": "/api/v2/spp/Individual?name=Santos&_count=2&_offset=2",
    "prev": null
  }
}
```

Key differences from the old Bundle format:
- Resources are directly in `data[]` (no `entry` wrapper)
- Pagination in `meta` object (`total`, `count`, `offset`)
- Navigation links in `links` object (`self`, `next`, `prev`)

### Error Responses (`ProblemDetail` - RFC 9457)

**Implementation Note:** The `ProblemDetail` schema is defined in `spp_api_v2/schemas/problem_detail.py`, but most endpoints currently return plain `{"detail": "..."}` JSON via FastAPI `HTTPException`. Full RFC 9457 error responses are a planned migration target. The schema below describes the target format:

Errors use RFC 9457 Problem Details format (replaces FHIR `OperationOutcome`):

```json
{
  "type": "urn:openspp:error:not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "Individual not found with identifier national-id|PH-123",
  "instance": "/api/v2/spp/Individual/national-id|PH-123",
  "errors": [
    {
      "field": "identifier",
      "code": "not_found",
      "message": "No individual exists with this identifier"
    }
  ]
}
```

**Error type URNs:** `urn:openspp:error:{category}` where category is one of:
- `not-found` - Resource not found
- `validation` - Request validation errors
- `authentication` - Invalid/expired token
- `authorization` - Missing scope or consent
- `conflict` - Version mismatch, duplicate
- `server-error` - Internal error

---

## External Identifiers

### The Critical Rule

**NEVER expose internal database IDs** - All resources use external identifiers with namespace URIs.

### Identifier Format

Identifiers use the `{system}|{value}` format:

```
urn:gov:ph:psa:national-id|PH-123456789
```

- `system`: Namespace URI (e.g., `urn:gov:ph:psa:national-id`)
- `value`: The actual ID value (e.g., `PH-123456789`)

### Why External IDs Matter

1. **Federated systems** - Social Registry can share data with multiple SP-MIS systems
2. **Stable references** - IDs don't change when data is synced between systems
3. **Security** - Prevents enumeration attacks on internal IDs
4. **Standards compliance** - Aligns with G2P Connect and DCI protocols

---

## Consent-Based Access Control

### How Consent Works

1. **Registrant gives consent** to share data with specific organizations or organization types
2. **API Client** represents an organization with verified `organization_type`
3. **Consent Service** filters responses based on active consent

### Organization Types

Organization types are managed via the `spp.consent.org.type` model. Each type has:
- `name`: Display name (e.g., "Government Agency")
- `code`: Code used for consent matching (e.g., "government", "ngo", "private")

API Clients reference organization types via `organization_type_id` (Many2one). The `organization_type` field on API Client is computed from `organization_type_id.code`.

### Consent Scopes

Consent can be granular:
- **Resource type**: `individual`, `group`, `all`
- **Field-level**: Specific fields (e.g., `name`, `birthDate`, but not `address`)
- **Extension-level**: Specific extensions (e.g., `farmer` data but not `health` data)

### Response Headers

```
X-Consent-Status: active         # Consent given
X-Consent-Status: no_consent     # No consent exists
X-Consent-Status: scope_mismatch # Consent exists but doesn't cover this resource
X-Consent-Scope: individual:all  # Scope of granted consent
```

### Legal Basis (GDPR Article 6)

Clients can be configured with legal basis that bypasses individual consent:

| Legal Basis | Description | Requires Consent |
|-------------|-------------|------------------|
| `consent` | Explicit consent (default) | Yes |
| `contract` | Contractual necessity | No |
| `legal_obligation` | Required by law | No |
| `vital_interest` | Life-threatening emergencies | No |
| `public_interest` | Public interest tasks | No |
| `public_task` | Official authority | No |
| `legitimate_interest` | Legitimate interest | No |

### Example: Government Interagency Exchange

```python
# API Client configuration for DSWD
# Note: organization_type_id is a Many2one to spp.consent.org.type
# The organization_type field (code) is computed from organization_type_id
{
    "name": "DSWD Data Exchange",
    "organization_type_id": government_org_type.id,  # Reference to spp.consent.org.type record
    "legal_basis": "legal_obligation",
    "legal_basis_reference": "Data Privacy Act 2012, Section 12(e)",
    "is_require_consent": False
}
```

---

## Consent Management API

The Consent API provides GDPR-compliant consent management.

### Get Consent Status

```bash
GET /api/v2/spp/Consent/{consent_id}
```

**Response:**
```json
{
  "consent_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "given",
  "grantee": "DSWD",
  "effective_date": "2024-01-01",
  "expiry_date": "2025-01-01",
  "scopes": [
    {
      "resource_type": "individual",
      "field_access": "all",
      "purpose": "service_delivery",
      "include_extensions": true
    }
  ],
  "legal_basis": "consent"
}
```

**Status Values (DPV-aligned):**
- `requested` - Consent requested but not yet given
- `given` - Consent given
- `renewed` - Consent renewed
- `refused` - Consent refused
- `withdrawn` - Consent withdrawn
- `expired` - Consent expired
- `invalidated` - Consent invalidated
- `not_found` - Consent doesn't exist

### Revoke Consent

Per GDPR Article 7(3), withdrawal must be as easy as giving consent:

```bash
POST /api/v2/spp/Consent/{consent_id}/$revoke
Content-Type: application/json

{
  "reason": "No longer want to share data"
}
```

Or use DELETE:

```bash
DELETE /api/v2/spp/Consent/{consent_id}?reason=No%20longer%20needed
```

### Get Consent Receipt (ISO 29184)

```bash
GET /api/v2/spp/Consent/{consent_id}/$receipt
```

Returns a standardized consent receipt with:
- Data subject identifier
- Data controller information
- Purposes consented to
- Data categories covered
- Withdrawal URI
- Data subject rights

### Get Consent History

```bash
GET /api/v2/spp/Consent/{consent_id}/$history
```

Returns version history of all consent changes for audit purposes.

### Get Access Summary

For GDPR Article 15 (right of access) requests:

```bash
GET /api/v2/spp/Consent/{consent_id}/$access-summary?date_from=2024-01-01&date_to=2024-12-31
```

Returns summary of all data accesses made under this consent.

---

## Group Membership Operations

### Add Member to Group

```bash
POST /api/v2/spp/Group/urn:openspp:group|HH-001/$add-member
Content-Type: application/json

{
  "entity": {
    "reference": "Individual/urn:gov:ph:psa:national-id|PH-123456789",
    "display": "Maria Santos"
  },
  "role": {
    "coding": [{
      "system": "urn:openspp:vocab:relationship",
      "code": "head",
      "display": "Head of Household"
    }]
  },
  "startDate": "2024-01-15"
}
```

### Remove Member from Group

```bash
POST /api/v2/spp/Group/urn:openspp:group|HH-001/$remove-member
Content-Type: application/json

{
  "entity": {
    "reference": "Individual/urn:gov:ph:psa:national-id|PH-123456789"
  },
  "endedDate": "2024-12-31",
  "reason": "Moved to another household"
}
```

### Update Member Role

```bash
PATCH /api/v2/spp/Group/urn:openspp:group|HH-001/member/urn:gov:ph:psa:national-id|PH-123
Content-Type: application/json

{
  "role": {
    "coding": [{
      "system": "urn:openspp:vocab:relationship",
      "code": "head",
      "display": "Head of Household"
    }]
  }
}
```

### Merge Groups

Move all members from source group to target group, then deactivate source:

```bash
POST /api/v2/spp/Group/$merge
Content-Type: application/json

{
  "sourceGroup": {
    "reference": "Group/urn:openspp:group|HH-OLD"
  },
  "targetGroup": {
    "reference": "Group/urn:openspp:group|HH-NEW"
  },
  "roleMapping": {
    "head": "member",
    "spouse": "spouse"
  }
}
```

### Split Group

Create a new group with some members from existing group:

```bash
POST /api/v2/spp/Group/urn:openspp:group|HH-001/$split
Content-Type: application/json

{
  "newGroupIdentifier": [{
    "system": "urn:openspp:group",
    "value": "HH-002"
  }],
  "membersToMove": [
    {"reference": "Individual/urn:gov:ph:psa:national-id|PH-111"},
    {"reference": "Individual/urn:gov:ph:psa:national-id|PH-222"}
  ],
  "newHead": {
    "reference": "Individual/urn:gov:ph:psa:national-id|PH-111"
  }
}
```

### Get Membership History

```bash
GET /api/v2/spp/Group/urn:openspp:group|HH-001/membership-history?_count=100&_offset=0&_since=2024-01-01T00:00:00Z
```

Returns a `SearchResult` with timeline of all membership additions, removals, and role changes. Supports `_count`, `_offset`, and `_since` parameters.

---

## Batch and Transaction Bundles

The `/$batch` endpoint allows processing multiple operations in a single request.

### Transaction Bundle (All-or-Nothing)

All operations succeed or all fail (atomic rollback):

```bash
POST /api/v2/spp/$batch
Content-Type: application/json

{
  "resourceType": "Bundle",
  "type": "transaction",
  "entry": [
    {
      "fullUrl": "urn:uuid:individual-1",
      "request": {
        "method": "POST",
        "url": "Individual"
      },
      "resource": {
        "type": "Individual",
        "identifier": [{
          "system": "urn:gov:ph:psa:national-id",
          "value": "PH-NEW-001"
        }],
        "name": {"family": "SANTOS", "given": "Maria"}
      }
    },
    {
      "fullUrl": "urn:uuid:group-1",
      "request": {
        "method": "POST",
        "url": "Group"
      },
      "resource": {
        "type": "Group",
        "identifier": [{
          "system": "urn:openspp:group",
          "value": "HH-NEW-001"
        }],
        "member": [{
          "entity": {"reference": "urn:uuid:individual-1"}
        }]
      }
    }
  ]
}
```

**Key Features:**
- Use `urn:uuid:*` placeholders for references to entries created in the same bundle
- Placeholders are resolved after creation to actual identifiers
- If any entry fails, all changes are rolled back
- The batch endpoint uses the legacy FHIR Bundle format (`resourceType`/`entry`), not the ADR-019 `SearchResult` format

### Batch Bundle (Independent Operations)

Each operation processed independently; partial success allowed:

```bash
POST /api/v2/spp/$batch
Content-Type: application/json

{
  "resourceType": "Bundle",
  "type": "batch",
  "entry": [
    {
      "request": {"method": "GET", "url": "Individual/urn:gov:ph:psa:national-id|PH-001"}
    },
    {
      "request": {"method": "GET", "url": "Individual/urn:gov:ph:psa:national-id|PH-002"}
    },
    {
      "request": {"method": "PUT", "url": "Individual/urn:gov:ph:psa:national-id|PH-003"},
      "resource": {...}
    }
  ]
}
```

### Supported Operations

| Method | URL Format | Description |
|--------|------------|-------------|
| POST | `{ResourceType}` | Create resource |
| PUT | `{ResourceType}/{system}\|{value}` | Update resource |
| GET | `{ResourceType}/{system}\|{value}` | Read resource |
| DELETE | `{ResourceType}/{system}\|{value}` | Soft delete resource |

---

## Bulk Export

The `/$bulk/export` endpoint retrieves multiple resources efficiently in a single request.

### Request

```bash
POST /api/v2/spp/$bulk/export
Content-Type: application/json

{
  "type": "Individual",
  "identifiers": [
    "urn:gov:ph:psa:national-id|PH-123456789",
    "urn:gov:ph:psa:national-id|PH-987654321",
    "urn:gov:ph:psa:national-id|PH-INVALID"
  ],
  "_elements": "name,birthDate,gender",
  "_extensions": "farmer"
}
```

- `type`: `"Individual"` or `"Group"`
- `identifiers`: Up to 100 identifiers per request
- `_elements`: Optional sparse fieldset filter
- `_extensions`: Optional extension filter

### Response

```json
{
  "total": 3,
  "successful": 2,
  "failed": 1,
  "items": [
    {
      "identifier": "urn:gov:ph:psa:national-id|PH-123456789",
      "status": "success",
      "resource": {
        "type": "Individual",
        "identifier": [{"system": "urn:gov:ph:psa:national-id", "value": "PH-123456789"}],
        "name": {"family": "SANTOS", "given": "Maria"}
      }
    },
    {
      "identifier": "urn:gov:ph:psa:national-id|PH-987654321",
      "status": "success",
      "resource": {...}
    },
    {
      "identifier": "urn:gov:ph:psa:national-id|PH-INVALID",
      "status": "not_found",
      "error": "Individual not found"
    }
  ]
}
```

Status values per item: `success`, `not_found`, `access_denied`, `error`.

---

## Extension System

Extensions allow modules to expose additional fields via the API without modifying core schemas.

### How Extensions Work

1. **Module registers extension** with `spp.api.extension` record
2. **Extension defines fields** it exposes (Many2many to `ir.model.fields`)
3. **API includes extensions** in response under `extension` key

### Example: Farmer Registry Extension

```json
{
  "type": "Individual",
  "identifier": [...],
  "name": {...},
  "extension": {
    "urn:openspp:extension:farmer": {
      "url": "urn:openspp:extension:farmer",
      "farmSize": 2.5,
      "primaryCrop": {
        "coding": [{
          "system": "urn:openspp:crop-type",
          "code": "rice",
          "display": "Rice"
        }]
      },
      "irrigationType": "drip"
    }
  }
}
```

### Requesting Extensions

```bash
# Request specific extensions
GET /Individual/urn:gov:ph:psa:national-id|PH-123?_extensions=farmer,health

# Request all available extensions
GET /Individual/urn:gov:ph:psa:national-id|PH-123?_extensions=*
```

---

## Studio Integration

### What Studio Provides

`spp_studio` enables no-code customization:

1. **Custom Fields** - Add fields to Individual/Group via UI
2. **Logic Variables** - Define computed variables for eligibility/scoring
3. **Logic Expressions** - CEL-based rules for targeting
4. **Logic Packs** - Pre-built sets of variables and rules

### How Studio Fields Appear in API

When `spp_studio_api_v2` is installed (auto-installs when both `spp_api_v2` and `spp_studio` are present):

1. **Studio fields registered as extension** (`urn:openspp:extension:studio-individual` or `studio-group`)
2. **Fields automatically exposed** if `api_exposed=True` on the Studio field
3. **Field names converted** from `x_snake_case` to `camelCase`

### Example: Studio Field in API Response

Studio field `x_household_income` becomes:

```json
{
  "extension": {
    "urn:openspp:extension:studio-individual": {
      "url": "urn:openspp:extension:studio-individual",
      "householdIncome": 25000.00,
      "employmentStatus": {
        "coding": [{
          "system": "urn:openspp:employment-status",
          "code": "employed",
          "display": "Employed"
        }]
      }
    }
  }
}
```

### Studio API Endpoints

```
GET /api/v2/spp/Studio/fields
```
List all active Studio custom fields with their configuration.

```
GET /api/v2/spp/Studio/fields/{technical_name}/schema
```
Get JSON Schema for a specific field (useful for client validation).

```
GET /api/v2/spp/Studio/variables
```
List available CEL variables that can be queried.

```
GET /api/v2/spp/Studio/variables/{resource_type}/{identifier}
```
Get cached variable values for a specific Individual or Group.

### Studio API Pagination

**Note:** Studio endpoints use cursor-based pagination (unlike Individual/Group endpoints which use offset-based).

Query parameters:
- `_count`: Page size (default: 100, max: 500)
- `_lastId`: ID of last record from previous page (for cursor pagination)

### Studio Fields Response

```json
{
  "total": 5,
  "items": [
    {
      "technicalName": "x_household_income",
      "label": "Household Monthly Income",
      "fieldType": "decimal",
      "targetType": "individual",
      "helpText": "Total monthly income in PHP",
      "isRequired": false,
      "placementZone": "demographics",
      "apiExposed": true,
      "isSearchable": true
    },
    {
      "technicalName": "x_employment_status",
      "label": "Employment Status",
      "fieldType": "selection",
      "targetType": "individual",
      "selectionOptions": [
        {"value": "employed", "label": "Employed"},
        {"value": "unemployed", "label": "Unemployed"},
        {"value": "self_employed", "label": "Self-Employed"}
      ],
      "apiExposed": true
    }
  ],
  "nextPageId": 123
}
```

### Variables Response

```json
{
  "total": 10,
  "items": [
    {
      "name": "pmt_score",
      "label": "PMT Score",
      "description": "Proxy Means Test score",
      "valueType": "number",
      "sourceType": "computed",
      "appliesTo": "group",
      "supportsHistorical": true,
      "category": "Targeting"
    }
  ]
}
```

### Writing Studio Fields via API

When creating/updating individuals, include Studio fields in the extension:

```bash
POST /api/v2/spp/Individual
Content-Type: application/json

{
  "identifier": [{
    "system": "urn:gov:ph:psa:national-id",
    "value": "PH-NEW-123"
  }],
  "name": {
    "family": "CRUZ",
    "given": "Jose"
  },
  "extension": {
    "studio-individual": {
      "householdIncome": 15000.00,
      "employmentStatus": {
        "coding": [{
          "system": "urn:openspp:employment-status",
          "code": "employed"
        }]
      }
    }
  }
}
```

---

## Example API Workflows

### Workflow 1: Basic Individual Lookup

```bash
# 1. Authenticate
TOKEN=$(curl -s -X POST http://localhost:8069/api/v2/spp/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"client_credentials","client_id":"my-client","client_secret":"secret"}' \
  | jq -r '.access_token')

# 2. Search by name (returns SearchResult)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8069/api/v2/spp/Individual?name=Santos"

# 3. Get specific individual with extensions and sparse fieldset
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8069/api/v2/spp/Individual/urn:gov:ph:psa:national-id|PH-123?_extensions=*&_elements=name,birthDate"
```

### Workflow 2: Create Individual with Custom Fields

```bash
curl -X POST http://localhost:8069/api/v2/spp/Individual \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": [{
      "system": "urn:gov:ph:psa:national-id",
      "value": "PH-NEW-456"
    }],
    "active": true,
    "name": {
      "family": "REYES",
      "given": "Ana",
      "middle": "Cruz"
    },
    "birthDate": "1990-05-20",
    "gender": {
      "coding": [{
        "system": "urn:iso:std:iso:5218",
        "code": "2"
      }]
    },
    "telecom": [{
      "system": "phone",
      "value": "+639171234567",
      "use": "mobile"
    }],
    "extension": {
      "studio-individual": {
        "householdIncome": 20000,
        "employmentStatus": {
          "coding": [{
            "system": "urn:openspp:employment-status",
            "code": "employed"
          }]
        }
      }
    }
  }'
```

### Workflow 3: Partial Update (PATCH)

```bash
# Update only the name and phone number, leave everything else unchanged
curl -X PATCH http://localhost:8069/api/v2/spp/Individual/urn:gov:ph:psa:national-id|PH-123 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "If-Match: \"1705312456123456\"" \
  -d '{
    "name": {
      "given": "Maria Elena"
    },
    "telecom": [{
      "system": "phone",
      "value": "+639179999999",
      "use": "mobile"
    }]
  }'
```

### Workflow 4: Create Household with Members (Transaction)

```bash
curl -X POST http://localhost:8069/api/v2/spp/$batch \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceType": "Bundle",
    "type": "transaction",
    "entry": [
      {
        "fullUrl": "urn:uuid:head",
        "request": {"method": "POST", "url": "Individual"},
        "resource": {
          "type": "Individual",
          "identifier": [{"system": "urn:gov:ph:psa:national-id", "value": "PH-HEAD-001"}],
          "name": {"family": "SANTOS", "given": "Juan"}
        }
      },
      {
        "fullUrl": "urn:uuid:spouse",
        "request": {"method": "POST", "url": "Individual"},
        "resource": {
          "type": "Individual",
          "identifier": [{"system": "urn:gov:ph:psa:national-id", "value": "PH-SPOUSE-001"}],
          "name": {"family": "SANTOS", "given": "Maria"}
        }
      },
      {
        "fullUrl": "urn:uuid:household",
        "request": {"method": "POST", "url": "Group"},
        "resource": {
          "type": "Group",
          "identifier": [{"system": "urn:openspp:group", "value": "HH-2024-001"}],
          "name": "Santos Household",
          "member": [
            {
              "entity": {"reference": "urn:uuid:head"},
              "role": {"coding": [{"system": "urn:openspp:vocab:relationship", "code": "head"}]}
            },
            {
              "entity": {"reference": "urn:uuid:spouse"},
              "role": {"coding": [{"system": "urn:openspp:vocab:relationship", "code": "spouse"}]}
            }
          ]
        }
      }
    ]
  }'
```

### Workflow 5: Bulk Export

```bash
curl -X POST http://localhost:8069/api/v2/spp/\$bulk/export \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Individual",
    "identifiers": [
      "urn:gov:ph:psa:national-id|PH-123",
      "urn:gov:ph:psa:national-id|PH-456",
      "urn:gov:ph:psa:national-id|PH-789"
    ],
    "_elements": "name,birthDate"
  }'
```

### Workflow 6: Get Variable Values

```bash
# Get all variable values for an individual
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8069/api/v2/spp/Studio/variables/Individual/urn:gov:ph:psa:national-id|PH-123?variables=*"

# Get specific variables
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8069/api/v2/spp/Studio/variables/Group/urn:openspp:group|HH-001?variables=pmt_score,household_size"
```

### Workflow 7: Program Membership Query

```bash
# Get all program memberships for an individual
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8069/api/v2/spp/ProgramMembership?beneficiary=Individual/urn:gov:ph:psa:national-id|PH-123"

# Get all beneficiaries in a program
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8069/api/v2/spp/ProgramMembership?program=Program/urn:openspp:program|4PS-2024"
```

### Workflow 8: Manage Consent

```bash
# Check consent status
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8069/api/v2/spp/Consent/550e8400-e29b-41d4-a716-446655440000"

# Revoke consent
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  "http://localhost:8069/api/v2/spp/Consent/550e8400-e29b-41d4-a716-446655440000/$revoke" \
  -d '{"reason": "No longer want to share data"}'

# Get consent receipt
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8069/api/v2/spp/Consent/550e8400-e29b-41d4-a716-446655440000/$receipt"
```

---

## Audit Logging

### Unified API Audit Log (ADR-020)

All API operations are logged to `spp.api.audit.log` via the `ApiAuditService`. The old per-consent `spp.consent.access.log` model has been removed.

### What Gets Logged

Every API operation records:
- **Operation type**: read, search, export, create, update, patch, delete
- **Resource type**: individual, group, program, program_membership
- **Resource identifier**: External identifier (system|value)
- **API client**: Which client made the request
- **Request metadata**: IP address, user agent, request ID
- **Consent context**: Consent record, purpose, legal basis
- **Status**: success, access_denied, not_found, validation_error, error
- **Error details**: Sanitized error info (no PII)

### Write Operations

Create, update, and patch operations are linked to `spp.audit.log` records for field-level change tracking.

### Design Principles

- Audit logging never blocks API requests (failures are logged and swallowed)
- No PII is stored in error details
- Request IDs enable correlation of related log entries

---

## Quick Reference: Scopes

| Scope | Description |
|-------|-------------|
| `individual:read` | Read individual records |
| `individual:create` | Create individuals |
| `individual:update` | Update individuals (PUT and PATCH) |
| `individual:delete` | Delete (soft) individuals |
| `group:read` | Read group records |
| `group:create` | Create groups |
| `group:update` | Update groups, manage members (PUT and PATCH) |
| `group:delete` | Delete (soft) groups |
| `program:read` | Read programs |
| `program_membership:read` | Read program memberships |
| `program_membership:create` | Create program memberships |
| `program_membership:update` | Update program memberships |
| `studio:read` | Read Studio fields and variables |

---

## Error Handling

### Common HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 204 | No Content (successful delete) |
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (invalid/expired token) |
| 403 | Forbidden (missing scope or consent) |
| 404 | Not found |
| 409 | Conflict (version mismatch, duplicate member) |
| 422 | Unprocessable entity (validation error) |
| 500 | Internal server error |

### Error Response Format (RFC 9457)

```json
{
  "type": "urn:openspp:error:validation",
  "title": "Validation Error",
  "status": 422,
  "detail": "Request data contains validation errors",
  "instance": "/api/v2/spp/Individual",
  "errors": [
    {
      "field": "birthDate",
      "code": "invalid_value",
      "message": "Birth date cannot be in the future"
    },
    {
      "field": "identifier",
      "code": "required",
      "message": "At least one identifier is required"
    }
  ]
}
```

---

## Best Practices

1. **Always use external identifiers** - Never rely on internal IDs
2. **Use PATCH for partial updates** - Prefer PATCH over PUT when changing few fields
3. **Use `_elements` for sparse fieldsets** - Request only needed fields
4. **Request only needed extensions** - Reduces response size
5. **Handle consent gracefully** - Check `X-Consent-Status` header
6. **Use pagination** - Always paginate large result sets
7. **Include If-Match header** - For updates, use optimistic locking
8. **Cache tokens** - Tokens are valid for 1 hour by default
9. **Use transactions** - For related operations that must succeed together
10. **Use bulk export** - For retrieving multiple known resources efficiently
11. **Log access patterns** - The API logs all access for audit (ADR-020)

---

## Extension Module Endpoints

The following endpoints are provided by auto-install bridge modules that activate
when both `spp_api_v2` and the corresponding domain module are installed.

### Vocabulary (`spp_api_v2_vocabulary`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/Vocabulary` | List vocabularies |
| GET | `/Vocabulary/{namespace_uri}` | Get vocabulary details |
| GET | `/Vocabulary/{namespace_uri}/codes` | List codes in a vocabulary |

### Cycles (`spp_api_v2_cycles`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/Cycle` | Search cycles |
| GET | `/Cycle/{identifier}` | Read cycle |

### Entitlements (`spp_api_v2_entitlements`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/Entitlement` | Search entitlements |
| GET | `/Entitlement/{code}` | Read entitlement |

### Service Points (`spp_api_v2_service_points`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ServicePoint` | Search service points |
| GET | `/ServicePoint/{identifier}` | Read service point |

### Products (`spp_api_v2_products`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/Product` | Search products |
| GET | `/ProductCategory` | Search product categories |
| GET | `/UnitOfMeasure` | Search units of measure |

### Change Requests (`spp_api_v2_change_request`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ChangeRequest` | Search change requests |
| POST | `/ChangeRequest` | Create change request |
| GET | `/ChangeRequest/{reference}` | Read change request by reference |
| PUT | `/ChangeRequest/{reference}` | Update change request detail |
| POST | `/ChangeRequest/{reference}/$submit` | Submit for approval |
| POST | `/ChangeRequest/{reference}/$approve` | Approve request |
| POST | `/ChangeRequest/{reference}/$reject` | Reject request |
| POST | `/ChangeRequest/{reference}/$request-revision` | Request revision |
| POST | `/ChangeRequest/{reference}/$apply` | Apply approved changes |
| POST | `/ChangeRequest/{reference}/$reset` | Reset rejected/revision CR to draft |

### Verifiable Credentials (`spp_api_v2_verifiable_credentials`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/Credential/$issue` | Issue verifiable credential |
| POST | `/Credential/$verify` | Verify credential |
| GET | `/Credential/StatusList/{list_id}` | Get status list |
| GET | `/Credential/Subject/{spp_id}` | Get credentials for subject |

### Data Operations (`spp_api_v2_data`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/Data/push` | Push variable values from external systems |
| GET | `/Data/pull` | Pull cached variable values |
| POST | `/Data/invalidate` | Invalidate cached data |
| GET | `/Data/variables` | List available variables |

### DRIMS (`spp_api_v2_drims`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/DRIMS/dispatches/geojson` | Dispatches GeoJSON |
| GET | `/DRIMS/incidents/geojson` | Incidents GeoJSON |
| GET | `/DRIMS/requests/geojson` | Requests GeoJSON |

### OpenID4VCI (`spp_vc_openid4vci`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/VCI/token` | Issue VCI token |
| POST | `/VCI/credential` | Issue credential via OpenID4VCI |

---

## Additional Resources

- [V2 Architecture Documentation](../docs/architecture/V2_ARCHITECTURE.md)
- [API Design Principles](../docs/principles/api-design.md)
- [Module Architecture](../docs/principles/module-architecture.md)
- ADR-007: Namespace URIs for Identifiers
- ADR-008: Source Tracking and Provenance
- ADR-009: Terminology System (Vocabulary)
- ADR-019: API Response Format Modernization
- ADR-020: Unified API Audit Log