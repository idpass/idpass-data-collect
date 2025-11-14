---
id: openspp-adapter
title: OpenSPP Adapter
sidebar_position: 1
---

# OpenSPP Adapter

The OpenSPP adapter enables bidirectional synchronization with [OpenSPP](https://openspp.org/), an open-source social protection platform built on Odoo. This adapter provides field mapping capabilities, data transformation, and batch processing for efficient data exchange between ID PASS DataCollect and OpenSPP systems.

## Overview

The OpenSPP adapter supports:

- **Field Mapping**: Visual mapping interface to connect form fields with OpenSPP fields
- **Data Transformers**: Automatic data format conversion (dates, IDs, multi-select, boolean)
- **Batch Processing**: Configurable batch sizes and delays for large datasets
- **Bidirectional Sync**: Push data to OpenSPP and pull updates back
- **Field Metadata Import**: Fetch field definitions directly from OpenSPP/Odoo API

## Configuration Requirements

The OpenSPP adapter requires the following configuration in your app config file:

```json
{
  "externalSync": {
    "type": "openspp-adapter",
    "url": "https://openspp.example.com",
    "auth": "basic",
    "extraFields": [
      {
        "name": "database",
        "value": "openspp"
      },
      {
        "name": "username",
        "value": "admin"
      },
      {
        "name": "password",
        "value": "your-password"
      },
      {
        "name": "batchSize",
        "value": "50"
      },
      {
        "name": "batchDelayMs",
        "value": "1000"
      },
      {
        "name": "maxRetries",
        "value": "2"
      },
      {
        "name": "fieldMappings",
        "value": "[{\"formField\":\"first_name\",\"opensppField\":\"firstname\",\"transformer\":{\"type\":\"text\"}}]"
      }
    ]
  }
}
```

## Configuration Parameters

### Required Fields

- `type`: Must be set to `"openspp-adapter"` (required)
- `url`: The base URL of your OpenSPP/Odoo instance (required)
- `auth`: Authentication method, typically `"basic"` (required)

### Extra Fields Array

The `extraFields` array allows you to configure additional parameters:

| Field Name      | Description                                    | Required | Default | Notes                                                      |
| --------------- | ---------------------------------------------- | -------- | ------- | ---------------------------------------------------------- |
| `database`      | OpenSPP/Odoo database name                     | Yes      | -       | The database name in your Odoo instance                    |
| `username`      | Username for authentication                    | Yes      | -       | Odoo user account with appropriate permissions             |
| `password`      | Password for authentication                    | Yes      | -       | Password for the Odoo user account                         |
| `batchSize`     | Number of entities to process per batch        | No       | 50      | Controls how many records are sent in each batch          |
| `batchDelayMs`  | Delay between batches in milliseconds          | No       | 1000    | Prevents overwhelming the API with rapid requests          |
| `maxRetries`    | Maximum retry attempts for failed entities     | No       | 2       | Number of times to retry failed sync operations            |
| `fieldMappings` | JSON array of field mappings                   | No       | []      | Field mappings with transformers (see Field Mapping below) |

## Field Mapping

Field mapping allows you to connect form fields from your DataCollect configuration to OpenSPP fields, with automatic data transformation.

### Field Mapping Structure

Each field mapping consists of:

```json
{
  "formField": "first_name",
  "opensppField": "firstname",
  "transformer": {
    "type": "text",
    "options": {}
  }
}
```

### Transformer Types

The adapter supports several transformer types for data format conversion:

#### Text Transformer

Default transformer that passes values through as-is or converts to string.

```json
{
  "type": "text",
  "options": {}
}
```

#### Date Transformer

Converts dates between different formats. Supports auto-detection of input format.

```json
{
  "type": "date",
  "options": {
    "inputFormat": "auto",
    "outputFormat": "YYYY-MM-DD"
  }
}
```

**Supported Formats:**
- `YYYY-MM-DD` (ISO format)
- `MM/DD/YYYY` (US format)
- `DD/MM/YYYY` (European format)
- `auto` (automatic detection)

#### ID Transformer

Handles ID values between form and OpenSPP formats. Converts form values to integers and extracts IDs from OpenSPP relation objects.

```json
{
  "type": "id",
  "options": {}
}
```

**Behavior:**
- **Transform (Form → OpenSPP)**: Converts form values (ID number/string) to integer
- **Reverse Transform (OpenSPP → Form)**: Extracts ID from `{"id": 0, "display_name": ""}` format

#### Multi-Select Transformer

Joins selected values into a delimited string for OpenSPP, and splits them back for forms.

```json
{
  "type": "multiselect",
  "options": {
    "delimiter": ","
  }
}
```

**Behavior:**
- **Transform (Form → OpenSPP)**: Joins array values with delimiter (default: comma)
- **Reverse Transform (OpenSPP → Form)**: Splits delimited string back to array

#### Boolean Transformer

Normalizes checkbox/dropdown values to boolean with configurable truthy/falsy values.

```json
{
  "type": "boolean",
  "options": {
    "truthyValue": "true",
    "falsyValue": "false"
  }
}
```

**Behavior:**
- **Transform (Form → OpenSPP)**: Converts form values to boolean based on configured values
- **Reverse Transform (OpenSPP → Form)**: Converts boolean back to configured string values

### Configuring Field Mappings via Admin UI

The Admin UI provides a visual interface for configuring field mappings:

1. **Import OpenSPP Fields**: Use the "Import OpenSPP Fields" button to fetch field metadata from:
   - Uploaded JSON file (sample OpenSPP payload)
   - Pasted JSON payload
   - Direct API fetch from OpenSPP/Odoo instance

2. **Map Fields**: In the field mapping dialog:
   - Select form fields from your configuration
   - Select corresponding OpenSPP fields
   - Choose appropriate transformer type
   - Configure transformer options if needed

3. **Save Mappings**: Mappings are saved as JSON in the `fieldMappings` extraField

## Backend API Endpoints

The backend provides endpoints for parsing and fetching OpenSPP field metadata:

### Parse Fields from File

**POST** `/api/openspp-fields/parse-file`

Upload a JSON file containing a sample OpenSPP payload to extract field definitions.

**Request:**
- Content-Type: `multipart/form-data`
- Body: Form data with `payload` field containing the JSON file

**Response:**
```json
{
  "fields": [
    {
      "name": "firstname",
      "type": "text",
      "label": "Firstname",
      "required": false
    }
  ]
}
```

### Parse Fields from JSON

**POST** `/api/openspp-fields/parse`

Parse field definitions from a JSON payload in the request body.

**Request:**
```json
{
  "firstname": "John",
  "lastname": "Doe",
  "birthdate": "1990-01-01",
  "gender_id": {"id": 1, "display_name": "Male"}
}
```

**Response:**
```json
{
  "fields": [
    {
      "name": "firstname",
      "type": "text",
      "label": "Firstname"
    },
    {
      "name": "lastname",
      "type": "text",
      "label": "Lastname"
    },
    {
      "name": "birthdate",
      "type": "date",
      "label": "Birthdate"
    },
    {
      "name": "gender_id",
      "type": "relation",
      "label": "Gender Id",
      "options": [{"id": 1, "label": "Male"}]
    }
  ]
}
```

### Fetch Fields from API

**POST** `/api/openspp-fields/fetch`

Fetch field metadata directly from an OpenSPP/Odoo instance using the `fields_get` API.

**Request:**
```json
{
  "url": "https://openspp.example.com",
  "database": "openspp",
  "username": "admin",
  "password": "password",
  "model": "res.partner",
  "fields": ["firstname", "lastname", "birthdate"],
  "attributes": ["type", "string", "required", "selection"]
}
```

**Response:**
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
      "name": "gender",
      "type": "selection",
      "label": "Gender",
      "options": [
        {"id": "male", "label": "Male"},
        {"id": "female", "label": "Female"}
      ]
    }
  ]
}
```

## Postman Collection

A Postman collection for testing OpenSPP JSON-RPC API endpoints is available at:

`packages/backend/api/openspp-jsonrpc.postman_collection.json`

This collection includes examples for:
- Authentication
- Field metadata fetching
- Data synchronization operations

## Batch Processing

The adapter processes entities in batches to avoid overwhelming the OpenSPP API:

- **Batch Size**: Configurable number of entities per batch (default: 50)
- **Batch Delay**: Configurable delay between batches in milliseconds (default: 1000ms)
- **Retry Logic**: Failed entities are retried up to `maxRetries` times (default: 2)

### Batch Processing Flow

1. Entities are grouped into batches based on `batchSize`
2. Each batch is processed sequentially
3. A delay (`batchDelayMs`) is applied between batches
4. Failed entities are tracked and retried
5. Success/failure statistics are logged

## Sync Process

### Push Sync (DataCollect → OpenSPP)

1. Retrieve entities that need to be synced (new or modified)
2. Apply field mappings and transformers
3. Convert entities to OpenSPP format
4. Send batches to OpenSPP API
5. Update sync status and external IDs

### Pull Sync (OpenSPP → DataCollect)

1. Fetch updates from OpenSPP since last pull
2. Convert OpenSPP data to form submissions
3. Apply reverse transformers
4. Store events in EventStore
5. Update entities via EventApplierService

## Example Configuration

Here's a complete example configuration for syncing individual beneficiary data:

```json
{
  "id": "beneficiary-tracking",
  "name": "Beneficiary Tracking",
  "version": "1.0.0",
  "entityForms": [
    {
      "name": "individual",
      "title": "Individual Beneficiary",
      "formio": {
        "display": "form",
        "components": [
          {
            "key": "first_name",
            "type": "textfield",
            "label": "First Name"
          },
          {
            "key": "last_name",
            "type": "textfield",
            "label": "Last Name"
          },
          {
            "key": "birth_date",
            "type": "datetime",
            "label": "Date of Birth"
          },
          {
            "key": "gender",
            "type": "select",
            "label": "Gender",
            "data": {
              "values": [
                {"label": "Male", "value": "1"},
                {"label": "Female", "value": "2"}
              ]
            }
          }
        ]
      }
    }
  ],
  "externalSync": {
    "type": "openspp-adapter",
    "url": "https://openspp.example.com",
    "auth": "basic",
    "extraFields": [
      {
        "name": "database",
        "value": "openspp"
      },
      {
        "name": "username",
        "value": "admin"
      },
      {
        "name": "password",
        "value": "secure-password"
      },
      {
        "name": "batchSize",
        "value": "50"
      },
      {
        "name": "fieldMappings",
        "value": "[{\"formField\":\"first_name\",\"opensppField\":\"firstname\",\"transformer\":{\"type\":\"text\"}},{\"formField\":\"last_name\",\"opensppField\":\"lastname\",\"transformer\":{\"type\":\"text\"}},{\"formField\":\"birth_date\",\"opensppField\":\"birthdate\",\"transformer\":{\"type\":\"date\",\"options\":{\"inputFormat\":\"auto\",\"outputFormat\":\"YYYY-MM-DD\"}}},{\"formField\":\"gender\",\"opensppField\":\"gender_id\",\"transformer\":{\"type\":\"id\"}}]"
      }
    ]
  }
}
```

## Troubleshooting

### Common Issues

**Authentication Failures**
- Verify `url`, `database`, `username`, and `password` are correct
- Check that the user has appropriate permissions in OpenSPP
- Ensure the OpenSPP instance is accessible from your server

**Field Mapping Errors**
- Verify field names match exactly (case-sensitive)
- Check transformer types are appropriate for field types
- Review transformer options for date formats and delimiters

**Batch Processing Issues**
- Adjust `batchSize` if API rate limits are hit
- Increase `batchDelayMs` to slow down processing
- Check `maxRetries` for failed entity handling

**Data Format Issues**
- Verify date formats match between form and OpenSPP
- Check ID transformers for relation fields
- Review multi-select delimiter configuration

## Related Documentation

- [External Sync Configuration](../configuration/external-sync.md)
- [Field Transformers](../packages/datacollect/api/classes/IdTransformer.md)
- [Backend API Reference](../packages/backend/api-reference-overview.md)
- [Admin UI Guide](../user-guide/admin-ui-dashboard.md)

