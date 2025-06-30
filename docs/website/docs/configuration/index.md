---
id: index
title: Configuration Overview
sidebar_position: 1
---


# Configuration Overview

The IDPass Data Collect system uses a comprehensive configuration schema that defines how data collection applications are structured and operate. This configuration is created and managed through the Admin interface and serves as the blueprint for mobile data collection applications.

:::info
Client and server instances will share the same config to handle many logic between them.
:::

## Configuration File Format

Configurations are stored as JSON files with the following structure:

```json
{
  "id": "configuration-id",
  "name": "Configuration Name",
  "description": "Configuration description",
  "version": "1.0.0",
  "entityForms": [
    {
      "name": "form-name",
      "title": "Form Title",
      "dependsOn": "parent-form-name",
      "formio": { /* FormIO schema */ }
    }
  ],
  "externalSync": {
    "type": "sync-adapter-type",
    "url": "https://sync-endpoint.com",
    "auth": "basic",
    "extraFields": {
      "key": "value"
    }
  },
  "authConfigs": [
    {
      "type": "auth0",
      "fields": {
        "domain": "your-domain.auth0.com",
        "clientId": "your-client-id"
      }
    }
  ]
}
```


## Configuration Structure

Each configuration consists of four main components:

### 1. Basic Information
- **Name**: A unique identifier for the configuration
- **Description**: Human-readable description of the configuration's purpose
- **Version**: Version number for tracking configuration changes

### 2. Entity Forms
Entity forms define the data collection forms that users will interact with in the mobile application. Each form includes:

- **Name**: Unique identifier for the form
- **Title**: Display name shown to users
- **Depends On**: Optional dependency on another form (supports hierarchical data collection)
- **FormIO Configuration**: The actual form structure and fields using FormIO schema

**Key Features:**
- Support for multiple forms per configuration
- Hierarchical dependencies between forms (with circular dependency detection)
- Visual form builder integration
- Dynamic form validation

### 3. External Sync Configuration
Defines how the application synchronizes data with external systems:

- **Type**: Sync adapter type (Mock Sync Server, OpenSPP, OpenFn)
- **URL**: Endpoint URL for the sync service
- **Auth**: Authentication method (None, Basic)
- **Extra Fields**: Additional configuration parameters as key-value pairs

**Supported Sync Types:**
- `mock-sync-server`: For testing and development
- `openspp-adapter`: Integration with OpenSPP systems
- `openfn-adapter`: Integration with OpenFn workflows

### 4. Authentication Configuration
Defines authentication methods for the application:

- **Type**: Authentication provider (None, Auth0, Keycloak)
- **Fields**: Provider-specific configuration parameters

**Supported Auth Types:**
- `auth0`: Auth0 identity provider
- `keycloak`: Keycloak identity provider

## Configuration Management

### Creating Configurations
1. Access the Admin interface
2. Navigate to "Create Config"
3. Fill in basic information (name, description, version)
4. Add entity forms with their dependencies and FormIO schemas
5. Configure external sync settings
6. Set up authentication if required
7. Validate and save the configuration

### Editing Configurations
- Existing configurations can be edited, copied, or updated
- All changes are validated before saving
- Version tracking helps manage configuration evolution

### Validation Rules
The system enforces several validation rules:
- All required fields must be completed
- At least one entity form is required
- Circular dependencies between forms are detected and prevented
- External sync configuration must include type and URL
- Authentication configurations must have valid types and fields

## Use Cases

This configuration system supports various data collection scenarios:

- **Simple Surveys**: Single form configurations for basic data collection
- **Multi-step Forms**: Hierarchical forms for complex data entry workflows
- **Offline Data Collection**: Mobile applications that sync when connectivity is available
- **Integration Scenarios**: Seamless integration with existing systems through sync adapters
- **Multi-tenant Deployments**: Different configurations for different organizations or use cases

## Next Steps

- [Entity Forms](./entity-forms.md) - Learn how to create and configure data collection forms
- [External Sync Configuration](./external-sync.md) - Configure integration with external systems

<!-- - [Installation Guide](./installation.md) - Learn how to set up the system
- [Form Builder Guide](./form-builder.md) - Create dynamic forms using FormIO
- [Authentication Setup](./authentication.md) - Set up user authentication -->
