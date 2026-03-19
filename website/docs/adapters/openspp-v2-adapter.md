---
id: openspp-v2-adapter
title: OpenSPP V2 Adapter (Beta)
sidebar_position: 2
---

# OpenSPP V2 Adapter (Beta)

:::warning Beta Feature
The OpenSPP V2 adapter is currently in **beta**. The API and configuration options may change in future releases. Use in production environments at your own discretion and report any issues to the project repository.
:::

The OpenSPP V2 adapter enables bidirectional synchronization with [OpenSPP](https://openspp.org/) using the modern `spp_api_v2` REST API. Unlike the original OpenSPP adapter (which uses JSON-RPC), this adapter uses OAuth2 client credentials and a standards-aligned REST API that is G2P Connect / DCI compliant.

## Overview

The OpenSPP V2 adapter supports:

- **OAuth2 Authentication**: Client credentials flow with automatic token refresh
- **Standards-Aligned API**: G2P Connect / DCI compliant REST API
- **Studio Custom Fields**: Automatic discovery and mapping of OpenSPP Studio custom fields
- **Bidirectional Sync**: Push data to OpenSPP and pull updates back
- **External Identifiers**: Uses namespace URIs instead of internal database IDs
- **Consent-Based Access**: Respects OpenSPP consent model for data access

## Differences from the Original OpenSPP Adapter

| Feature | OpenSPP Adapter | OpenSPP V2 Adapter (Beta) |
|---|---|---|
| Authentication | Basic auth (Odoo JSON-RPC) | OAuth2 client credentials |
| API Protocol | JSON-RPC (`/web/dataset/call_kw`) | REST (`/api/v2/spp/`) |
| Field Discovery | `fields_get` API | Studio fields endpoint |
| Identifiers | Internal Odoo IDs | External namespace URIs |
| Data Format | Odoo record format | G2P Connect / DCI format |
| Consent | Not applicable | Consent-based access control |

## Prerequisites

- OpenSPP instance with `spp_api_v2` module installed
- An API Client configured in OpenSPP (`Configuration > API V2 > API Clients`)
- Appropriate scopes granted to the API Client (e.g., `individual:read`, `individual:create`, `group:read`, `group:create`)

## Configuration

The OpenSPP V2 adapter requires the following configuration in your app config file:

```json
{
  "externalSync": {
    "type": "openspp-v2-adapter",
    "url": "https://openspp.example.com",
    "auth": "oauth2",
    "extraFields": [
      {
        "name": "clientId",
        "value": "your-client-id"
      },
      {
        "name": "clientSecret",
        "value": "your-client-secret"
      },
      {
        "name": "identifierSystem",
        "value": "urn:gov:ph:psa:national-id"
      },
      {
        "name": "groupIdentifierSystem",
        "value": "urn:openspp:group"
      },
      {
        "name": "fieldMappings",
        "value": "[{\"formField\":\"first_name\",\"opensppField\":\"name.given\",\"transformer\":{\"type\":\"text\"}}]"
      }
    ]
  }
}
```

## Configuration Parameters

### Required Fields

- `type`: Must be set to `"openspp-v2-adapter"` (required)
- `url`: The base URL of your OpenSPP instance (required)
- `auth`: Authentication method, must be `"oauth2"` (required)

### Extra Fields Array

| Field Name | Description | Required | Default |
|---|---|---|---|
| `clientId` | OAuth2 client ID from OpenSPP API Client | Yes | - |
| `clientSecret` | OAuth2 client secret from OpenSPP API Client | Yes | - |
| `identifierSystem` | Namespace URI for individual identifiers | No | `urn:openspp:individual` |
| `groupIdentifierSystem` | Namespace URI for group identifiers | No | `urn:openspp:group` |
| `fieldMappings` | JSON array of field mappings | No | `[]` |
| `batchSize` | Number of entities to process per batch | No | 50 |
| `batchDelayMs` | Delay between batches in milliseconds | No | 1000 |

## Authentication Setup

The V2 adapter uses OAuth2 client credentials flow. To set up authentication:

1. In your OpenSPP instance, go to **Configuration > API V2 > API Clients**
2. Create a new API Client
3. Copy the `client_id` and `client_secret`
4. Add the required scopes:
   - `individual:read` and `individual:create` for individual sync
   - `group:read` and `group:create` for group sync
   - `studio:read` for Studio field discovery

The adapter automatically handles token acquisition and refresh. Tokens are valid for 1 hour by default and are refreshed 60 seconds before expiry.

## Field Mapping

Field mapping connects form fields from your DataCollect configuration to fields in the OpenSPP V2 API. The V2 API uses a structured format with nested fields.

### Core Individual Fields

These fields are available on all Individual resources:

| Field Name | Description | Type |
|---|---|---|
| `name.given` | Given (first) name | string |
| `name.family` | Family (last) name | string |
| `name.middle` | Middle name | string |
| `name.text` | Full name text | string |
| `birthDate` | Date of birth (ISO 8601) | date |
| `birthDateEstimated` | Whether birth date is estimated | boolean |
| `gender` | Gender (codeable concept) | codeable-concept |
| `active` | Whether the individual is active | boolean |
| `photo` | Photo (base64 encoded) | base64 |
| `telecom.phone` | Phone number | string |
| `telecom.email` | Email address | string |
| `address.line` | Address line | string |
| `address.city` | City | string |
| `address.district` | District | string |
| `address.state` | State or province | string |
| `address.postalCode` | Postal code | string |
| `address.country` | Country | string |

### Core Group Fields

These fields are available on all Group resources:

| Field Name | Description | Type |
|---|---|---|
| `name` | Group name | string |
| `groupType` | Type of group (e.g., `household`) | string |
| `active` | Whether the group is active | boolean |
| `quantity` | Number of members | integer |
| `address.line` | Address line | string |
| `address.city` | City | string |
| `address.district` | District | string |
| `address.state` | State or province | string |
| `address.postalCode` | Postal code | string |
| `address.country` | Country | string |

### Studio Custom Fields

When `spp_studio_api_v2` is installed in OpenSPP, Studio custom fields are automatically discoverable. These fields are exposed under the `extension` prefix in the API response and are referenced using the `extension.{technicalName}` naming convention in field mappings.

The Admin UI can fetch available Studio fields directly from your OpenSPP instance when configuring field mappings. See [Configuring Field Mappings via Admin UI](#configuring-field-mappings-via-admin-ui) below.

### Field Mapping Structure

Each field mapping consists of:

```json
{
  "formField": "first_name",
  "opensppField": "name.given",
  "transformer": {
    "type": "text",
    "options": {}
  }
}
```

### Transformer Types

The V2 adapter supports the same transformer types as the original adapter:

#### Text Transformer

Default transformer that passes values through as-is or converts to string.

```json
{
  "type": "text",
  "options": {}
}
```

#### Date Transformer

Converts dates between different formats. The V2 API expects ISO 8601 (`YYYY-MM-DD`).

```json
{
  "type": "date",
  "options": {
    "inputFormat": "auto",
    "outputFormat": "YYYY-MM-DD"
  }
}
```

#### Boolean Transformer

Normalizes checkbox/dropdown values to boolean.

```json
{
  "type": "boolean",
  "options": {
    "truthyValue": "true",
    "falsyValue": "false"
  }
}
```

## Configuring Field Mappings via Admin UI

The Admin UI provides a visual interface for configuring V2 field mappings:

1. In the External Sync configuration section, select **OpenSPP V2** as the adapter type
2. Enter your OpenSPP URL, Client ID, and Client Secret
3. Click **Test Connection** to verify credentials
4. Click **Import Fields** to fetch available fields from your OpenSPP instance. This retrieves:
   - Core Individual and Group fields
   - Studio custom fields (if `spp_studio_api_v2` is installed)
5. In the field mapping dialog:
   - Select form fields from your configuration
   - Select the corresponding OpenSPP V2 field
   - Choose an appropriate transformer type
6. Save the configuration

## External Identifiers

The V2 API never exposes internal database IDs. All resources use external identifiers with namespace URIs in the format `{system}|{value}`:

```
urn:gov:ph:psa:national-id|PH-123456789
```

When configuring the adapter, set `identifierSystem` to the namespace URI used by your deployment. This system URI is used when creating or looking up individuals and groups.

## Sync Process

### Push Sync (DataCollect to OpenSPP)

1. Retrieve entities that need to be synced (new or modified)
2. Apply field mappings and transformers to convert to V2 API format
3. Construct the resource payload using the configured identifier system
4. Send batches to the V2 API (`POST /api/v2/spp/Individual` or `/Group`)
5. Update sync status and store external identifiers

### Pull Sync (OpenSPP to DataCollect)

1. Fetch updates from OpenSPP V2 API since last pull
2. Convert V2 resource format to form submissions
3. Apply reverse transformers
4. Store events in EventStore
5. Update entities via EventApplierService

## Example Configuration

A complete example for syncing household and individual data:

```json
{
  "id": "beneficiary-registry",
  "name": "Beneficiary Registry",
  "version": "1.3.0",
  "entityForms": [
    {
      "name": "individual",
      "title": "Individual Beneficiary",
      "formio": {
        "display": "form",
        "components": [
          { "key": "first_name", "type": "textfield", "label": "First Name" },
          { "key": "last_name", "type": "textfield", "label": "Last Name" },
          { "key": "birth_date", "type": "datetime", "label": "Date of Birth" }
        ]
      }
    }
  ],
  "externalSync": {
    "type": "openspp-v2-adapter",
    "url": "https://openspp.example.com",
    "auth": "oauth2",
    "extraFields": [
      { "name": "clientId", "value": "datacollect-client" },
      { "name": "clientSecret", "value": "your-secret" },
      { "name": "identifierSystem", "value": "urn:gov:ph:psa:national-id" },
      { "name": "groupIdentifierSystem", "value": "urn:openspp:group" },
      {
        "name": "fieldMappings",
        "value": "[{\"formField\":\"first_name\",\"opensppField\":\"name.given\",\"transformer\":{\"type\":\"text\"}},{\"formField\":\"last_name\",\"opensppField\":\"name.family\",\"transformer\":{\"type\":\"text\"}},{\"formField\":\"birth_date\",\"opensppField\":\"birthDate\",\"transformer\":{\"type\":\"date\",\"options\":{\"inputFormat\":\"auto\",\"outputFormat\":\"YYYY-MM-DD\"}}}]"
      }
    ]
  }
}
```

## Troubleshooting

### Authentication Failures

- Verify `clientId` and `clientSecret` are correct
- Check that the API Client has the required scopes in OpenSPP
- Ensure the OpenSPP instance is accessible from your server
- Check that the `spp_api_v2` module is installed and active

### Field Mapping Errors

- Verify field names match the V2 API schema (case-sensitive)
- Use `name.given` and `name.family` instead of `firstname`/`lastname`
- Studio field names use `extension.{technicalName}` format
- Check transformer types are appropriate for field types

### Connection Issues

- Verify the base URL does not have a trailing slash
- Check that the OAuth2 token endpoint is accessible at `/api/v2/spp/oauth/token`
- Review network firewall rules if the server cannot reach OpenSPP

### Studio Fields Not Appearing

- Confirm `spp_studio_api_v2` is installed in your OpenSPP instance
- Verify the API Client has the `studio:read` scope
- Check that Studio fields have `api_exposed` enabled in OpenSPP

## Known Limitations (Beta)

- Pull sync support is under active development
- Consent-based access control behavior depends on the OpenSPP instance configuration
- Studio field write operations require the field to have `api_exposed` enabled in OpenSPP

## Related Documentation

- [OpenSPP Adapter (V1)](./openspp-adapter.md) - Original adapter using JSON-RPC
- [External Sync Configuration](../configuration/external-sync.md)
- [Admin UI Guide](../user-guide/admin-ui-dashboard.md)
- [OpenSPP API V2 Guide](https://docs.openspp.org) - Official OpenSPP documentation
