---
id: import-openspp-fields
title: Import OpenSPP Fields
sidebar_position: 4
---

# Import OpenSPP Fields

This guide explains how to import OpenSPP field metadata when configuring field mappings for OpenSPP synchronization.

## Overview

When configuring an OpenSPP adapter, you need to map form fields from your DataCollect configuration to fields in your OpenSPP/Odoo system. To make this easier, the Admin UI provides tools to import field metadata from OpenSPP.

## Import Methods

The Admin UI supports three methods for importing OpenSPP field metadata:

### 1. Upload JSON File

Upload a JSON file containing a sample OpenSPP payload.

**Steps**:
1. In the External Sync configuration section, click "Import OpenSPP Fields"
2. Select the "Upload File" tab
3. Click "Select JSON file" and choose a file containing sample OpenSPP data
4. Click "Parse Fields"

**File Format**:
The JSON file should contain a single object or array with sample OpenSPP data:

```json
{
  "firstname": "John",
  "lastname": "Doe",
  "birthdate": "1990-01-01",
  "gender_id": {"id": 1, "display_name": "Male"},
  "partner_id": {"id": 5, "display_name": "Household ABC"}
}
```

**Use Case**: When you have a sample export from OpenSPP or a test record.

### 2. Paste JSON

Paste JSON payload directly into the dialog.

**Steps**:
1. In the External Sync configuration section, click "Import OpenSPP Fields"
2. Select the "Paste JSON" tab
3. Paste your JSON payload into the text area
4. Click "Parse Fields"

**Use Case**: When you have JSON data copied from OpenSPP API responses or exports.

### 3. Fetch from API

Connect directly to your OpenSPP/Odoo instance to fetch field metadata.

**Steps**:
1. In the External Sync configuration section, click "Import OpenSPP Fields"
2. Select the "Fetch from API" tab
3. Enter your OpenSPP connection details:
   - **OpenSPP URL**: Base URL of your OpenSPP/Odoo instance (e.g., `https://openspp.example.com`)
   - **Database**: Database name
   - **Username**: Username for authentication
   - **Password**: Password for authentication
   - **Model** (optional): Odoo model name (default: `res.partner`)
4. Click "Fetch Fields"

**Use Case**: When you want complete, up-to-date field metadata directly from your OpenSPP instance.

**Advantages**:
- Fetches complete field definitions including selection options
- Gets field labels, types, and required flags
- Provides most accurate field information
- Similar to how SugarCRM provides field metadata

## Field Type Detection

The import process automatically detects field types:

- **Text**: Standard text fields
- **Date**: Detected from date strings (YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY) or Date objects
- **Relation**: Detected from `{"id": X, "display_name": "..."}` format or `[id, label]` tuples
- **Selection**: Detected from Odoo `fields_get` API when using API fetch method

## After Import

Once fields are imported:

1. **Field List**: The imported fields appear in the field mapping dialog
2. **Field Mapping**: You can now map form fields to OpenSPP fields
3. **Transformer Selection**: The system suggests appropriate transformers based on field types:
   - Date fields → Date transformer
   - Relation fields → ID transformer
   - Selection fields → Text or ID transformer (depending on usage)

## Example Workflow

1. **Configure External Sync**:
   - Set Type to "OpenSPP"
   - Enter OpenSPP URL
   - Add database, username, and password in Extra Fields

2. **Import Fields**:
   - Click "Import OpenSPP Fields"
   - Use "Fetch from API" method
   - Enter credentials and fetch fields

3. **Map Fields**:
   - In the field mapping dialog, select form fields
   - Select corresponding OpenSPP fields
   - Configure transformers as needed

4. **Save Configuration**:
   - Field mappings are saved automatically
   - Configuration is ready for synchronization

## Troubleshooting

### Import Fails

- **Check File Format**: Ensure JSON is valid
- **Verify Credentials**: For API fetch, check username/password
- **Network Access**: Ensure server can reach OpenSPP instance
- **Model Name**: Verify model name is correct (default: `res.partner`)

### Fields Not Detected

- **Sample Data**: Ensure sample JSON contains representative data
- **Field Types**: Some field types may require API fetch for accurate detection
- **Relation Fields**: Use API fetch to get complete relation field information

### API Fetch Errors

- **Connection**: Verify OpenSPP URL is accessible
- **Authentication**: Check username and password
- **Database**: Ensure database name is correct
- **Permissions**: Verify user has `fields_get` API access

## Related Documentation

- [Admin UI Dashboard](./admin-ui-dashboard.md)
- [OpenSPP Adapter](/adapters/openspp-adapter)
- [External Sync Configuration](/configuration/external-sync)

