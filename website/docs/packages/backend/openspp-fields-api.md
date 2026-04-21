---
id: openspp-fields-api
title: OpenSPP Fields API
sidebar_position: 6
---

# OpenSPP Fields API

The OpenSPP Fields API provides endpoints for parsing and fetching field metadata from OpenSPP/Odoo instances. These endpoints are used by the Admin UI to help configure field mappings for OpenSPP synchronization.

## Endpoints

### Parse Fields from File

**POST** `/api/openspp-fields/parse-file`

Upload a JSON file containing a sample OpenSPP payload to extract field definitions.

**Authentication**: Required (JWT)

**Request**:
- Content-Type: `multipart/form-data`
- Body: Form data with `payload` field containing the JSON file

**Example Request**:
```bash
curl -X POST http://localhost:3000/api/openspp-fields/parse-file \
  -H "Authorization: Bearer <your-jwt-token>" \
  -F "payload=@sample-openspp-payload.json"
```

**Response**:
```json
{
  "fields": [
    {
      "name": "firstname",
      "type": "text",
      "label": "Firstname",
      "required": false
    },
    {
      "name": "lastname",
      "type": "text",
      "label": "Lastname",
      "required": false
    },
    {
      "name": "birthdate",
      "type": "date",
      "label": "Birthdate",
      "required": false
    },
    {
      "name": "gender_id",
      "type": "relation",
      "label": "Gender Id",
      "required": false,
      "options": [
        {
          "id": 1,
          "label": "Male"
        },
        {
          "id": 2,
          "label": "Female"
        }
      ]
    }
  ]
}
```

**Field Types**:
- `text`: Standard text fields
- `date`: Date fields (detected from date strings or Date objects)
- `relation`: Relation fields (many2one, many2many, one2many) - detected from `{"id": 0, "display_name": ""}` format or `[id, label]` tuples
- `selection`: Selection fields with predefined options

### Parse Fields from JSON

**POST** `/api/openspp-fields/parse`

Parse field definitions from a JSON payload in the request body.

**Authentication**: Required (JWT)

**Request**:
- Content-Type: `application/json`
- Body: JSON object or array containing sample OpenSPP data

**Example Request**:
```bash
curl -X POST http://localhost:3000/api/openspp-fields/parse \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "firstname": "John",
    "lastname": "Doe",
    "birthdate": "1990-01-01",
    "gender_id": {"id": 1, "display_name": "Male"}
  }'
```

**Response**: Same as parse-file endpoint

**Notes**:
- If payload is an array, the first item is used for parsing
- Field types are inferred from the data structure
- Relation fields are detected from `{"id": X, "display_name": "..."}` format
- Legacy `[id, label]` tuple format is also supported but deprecated

### Fetch Fields from API

**POST** `/api/openspp-fields/fetch`

Fetch field metadata directly from an OpenSPP/Odoo instance using the `fields_get` API method.

**Authentication**: Required (JWT)

**Request**:
- Content-Type: `application/json`
- Body: JSON object with connection details

**Example Request**:
```bash
curl -X POST http://localhost:3000/api/openspp-fields/fetch \
  -H "Authorization: Bearer <your-jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://openspp.example.com",
    "database": "openspp",
    "username": "admin",
    "password": "password",
    "model": "res.partner",
    "fields": ["firstname", "lastname", "birthdate"],
    "attributes": ["type", "string", "required", "selection"]
  }'
```

**Request Parameters**:

| Parameter   | Type     | Required | Description                                    |
| ----------- | -------- | -------- | ---------------------------------------------- |
| `url`       | string   | Yes      | Base URL of the OpenSPP/Odoo instance         |
| `database`  | string   | Yes      | Database name                                  |
| `username`  | string   | Yes      | Username for authentication                    |
| `password`  | string   | Yes      | Password for authentication                    |
| `model`     | string   | No       | Odoo model name (default: `"res.partner"`)   |
| `fields`    | string[] | No       | Specific fields to fetch (all if omitted)     |
| `attributes`| string[] | No       | Field attributes to fetch (default includes type, string, required, selection) |

**Response**:
```json
{
  "fields": [
    {
      "name": "firstname",
      "type": "text",
      "label": "First Name",
      "required": true
    },
    {
      "name": "lastname",
      "type": "text",
      "label": "Last Name",
      "required": true
    },
    {
      "name": "birthdate",
      "type": "date",
      "label": "Date of Birth",
      "required": false
    },
    {
      "name": "gender",
      "type": "selection",
      "label": "Gender",
      "required": false,
      "options": [
        {
          "id": "male",
          "label": "Male"
        },
        {
          "id": "female",
          "label": "Female"
        }
      ]
    },
    {
      "name": "partner_id",
      "type": "relation",
      "label": "Partner",
      "required": false
    }
  ]
}
```

**Field Type Mapping**:

Odoo field types are mapped to ParsedOpenSppField types as follows:

| Odoo Type    | Parsed Type | Notes                                    |
| ------------ | ---------- | ---------------------------------------- |
| `date`       | `date`     | Date fields                              |
| `datetime`   | `date`     | Datetime fields (treated as date)        |
| `many2one`   | `relation` | Many-to-one relations                    |
| `many2many`  | `relation` | Many-to-many relations                   |
| `one2many`   | `relation` | One-to-many relations                    |
| `selection` | `selection`| Selection fields with predefined options |
| Others       | `text`     | Default for all other types              |

**Error Responses**:

**400 Bad Request**:
```json
{
  "error": "URL, database, username, and password are required"
}
```

**500 Internal Server Error**:
```json
{
  "error": "Failed to fetch fields from Odoo API: <error message>"
}
```

## Use Cases

### Admin UI Integration

These endpoints are primarily used by the Admin UI's field mapping interface:

1. **Import Fields**: Users can upload a sample JSON file or paste JSON payload to extract field definitions
2. **Fetch from API**: Users can directly connect to their OpenSPP instance to fetch complete field metadata
3. **Field Mapping**: The parsed fields are used to populate the field mapping dialog

### Field Mapping Configuration

The parsed fields help configure field mappings in the app configuration:

```json
{
  "name": "fieldMappings",
  "value": "[{\"formField\":\"first_name\",\"opensppField\":\"firstname\",\"transformer\":{\"type\":\"text\"}},{\"formField\":\"birth_date\",\"opensppField\":\"birthdate\",\"transformer\":{\"type\":\"date\",\"options\":{\"inputFormat\":\"auto\",\"outputFormat\":\"YYYY-MM-DD\"}}}]"
}
```

## Postman Collection

A Postman collection for testing OpenSPP JSON-RPC API endpoints is available at:

`packages/backend/api/openspp-jsonrpc.postman_collection.json`

This collection includes examples for:
- Authentication with OpenSPP/Odoo
- Field metadata fetching using `fields_get`
- Data synchronization operations

## Related Documentation

- [OpenSPP Adapter Guide](../../adapters/openspp-adapter.md)
- [External Sync Configuration](../../configuration/external-sync.md)
- [Admin UI Guide](../../user-guide/admin-ui-dashboard.md)



