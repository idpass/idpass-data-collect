---
id: entity-forms
title: Entity Forms
sidebar_position: 2
---

# Entity Forms

Entity Forms are the core building blocks of the IDPass Data Collect system. They define the structure and behavior of data collection forms that can be used to create and manage entities (individuals and groups) in the system.

## Overview

Entity Forms are dynamic, configurable forms built using Form.io that allow you to:
- Define data collection schemas for different entity types
- Create hierarchical relationships between entities
- Implement conditional form logic and dependencies
- Support complex data validation and business rules

## Sample Entity Form

Here's a simple example of an entity form with explanations for each field:

```json
{
  "entityForms": [
    {
      "name": "individual",
      "title": "Individual Registration",
      "formio": {
        "components": [
          {
            "label": "Full Name",
            "key": "fullName",
            "type": "textfield",
            "input": true,
            "required": true
          }
        ]
      }
    }
  ]
}
```

### Field Explanations

- **`name`**: The unique identifier for this form. Used internally by the system to reference this specific form configuration. Should be lowercase and use hyphens for spaces (e.g., "individual", "household-member").

- **`title`**: The human-readable display name that appears in the user interface. This is what users will see when selecting or working with this form (e.g., "Individual Registration", "Household Information").

- **`formio`**: Contains the Form.io configuration object that defines the actual form structure, fields, and behavior.

## Entity Form Structure

Each Entity Form consists of the following properties:

```typescript
interface EntityForm {
  name: string;           // Unique identifier for the form
  title: string;          // Display name for the form
  dependsOn?: string;     // Parent entity form (for hierarchical relationships)
  formio: object;         // Form.io configuration object
}
```

### Properties

- **`name`**: A unique identifier used internally to reference this form. This should be a lowercase, hyphenated string (e.g., "household", "individual-member").

- **`title`**: The human-readable display name that appears in the UI (e.g., "Household Information", "Individual Member").

- **`dependsOn`**: Optional field that establishes a parent-child relationship with another entity form. This enables hierarchical data structures.

- **`formio`**: The complete Form.io configuration object that defines the form's fields, validation rules, and behavior.

## Hierarchical Data Relationships

Entity Forms support hierarchical relationships through the `dependsOn` property, enabling complex data structures like household-member relationships.

### Example: Household-Member Hierarchy

Consider a social protection system where households contain multiple individual members:

```json
{
  "entityForms": [
    {
      "name": "household",
      "title": "Household Information",
      "formio": {
        "components": [
          {
            "label": "Household Name",
            "key": "householdName",
            "type": "textfield",
            "input": true,
            "required": true
          },
          {
            "label": "Address",
            "key": "address",
            "type": "textarea",
            "input": true
          },
          {
            "label": "Household Size",
            "key": "householdSize",
            "type": "number",
            "input": true
          }
        ]
      }
    },
    {
      "name": "individual-member",
      "title": "Individual Member",
      "dependsOn": "household",
      "formio": {
        "components": [
          {
            "label": "First Name",
            "key": "firstName",
            "type": "textfield",
            "input": true,
            "required": true
          },
          {
            "label": "Last Name",
            "key": "lastName",
            "type": "textfield",
            "input": true,
            "required": true
          },
          {
            "label": "Date of Birth",
            "key": "dateOfBirth",
            "type": "datetime",
            "input": true
          },
          {
            "label": "Relationship to Head",
            "key": "relationship",
            "type": "select",
            "input": true,
            "data": {
              "values": [
                { "label": "Head", "value": "head" },
                { "label": "Spouse", "value": "spouse" },
                { "label": "Child", "value": "child" },
                { "label": "Parent", "value": "parent" },
                { "label": "Other", "value": "other" }
              ]
            }
          }
        ]
      }
    }
  ]
}
```

### Circular Dependency Prevention

The system automatically detects and prevents circular dependencies between entity forms. For example, if Form A depends on Form B, Form B cannot depend on Form A.

## Form.io Integration

Entity Forms use Form.io for form rendering and data collection. The `formio` property contains the complete Form.io configuration that defines:

### Field Types
- **Text Fields**: `textfield`, `textarea`
- **Numeric Fields**: `number`, `currency`
- **Date/Time Fields**: `datetime`, `date`
- **Selection Fields**: `select`, `radio`, `checkbox`
- **File Upload**: `file`
- **Custom Components**: Any Form.io compatible component

### Conditional Logic
Forms can include conditional logic to show/hide fields based on other field values:

```json
{
  "label": "Spouse Information",
  "key": "spouseInfo",
  "type": "panel",
  "conditional": {
    "show": true,
    "when": "maritalStatus",
    "eq": "married"
  },
  "components": [
    {
      "label": "Spouse Name",
      "key": "spouseName",
      "type": "textfield",
      "input": true
    }
  ]
}
```

## Creating Entity Forms

### Using the Admin Interface

1. Navigate to the Config Create/Edit page
2. In the "Entity Forms" section, click "Add Entity Form"
3. Fill in the basic information:
   - **Name**: Unique identifier (e.g., "household")
   - **Title**: Display name (e.g., "Household Information")
   - **Depends On**: Select parent form if creating a child entity
4. Click "Build Form" to open the Form.io builder
5. Design your form using the visual builder
6. Save the form configuration


## Best Practices

### Naming Conventions
- Use descriptive, lowercase names with hyphens (e.g., "household-info", "individual-member")
- Keep names consistent across related forms
- Avoid special characters and spaces

### Form Design
- **Logical Grouping**: Group related fields into panels or sections
- **Progressive Disclosure**: Use conditional logic to show relevant fields
- **Validation**: Implement appropriate validation rules for data quality
- **User Experience**: Design forms that are intuitive and efficient to complete

### Hierarchical Design
- **Clear Relationships**: Ensure parent-child relationships are logical and necessary
- **Data Consistency**: Maintain referential integrity between related entities
- **Performance**: Consider the impact of complex hierarchies on data retrieval

### Data Validation
- **Required Fields**: Mark essential fields as required
- **Format Validation**: Use appropriate input types and patterns
- **Business Rules**: Implement custom validation for domain-specific rules
- **Error Messages**: Provide clear, helpful error messages

## Example Configurations

### Simple Individual Registration

```json
{
  "name": "individual",
  "title": "Individual Registration",
  "formio": {
    "components": [
      {
        "label": "Personal Information",
        "type": "panel",
        "components": [
          {
            "label": "First Name",
            "key": "firstName",
            "type": "textfield",
            "input": true,
            "required": true
          },
          {
            "label": "Last Name",
            "key": "lastName",
            "type": "textfield",
            "input": true,
            "required": true
          },
          {
            "label": "Date of Birth",
            "key": "dateOfBirth",
            "type": "datetime",
            "input": true,
            "required": true
          }
        ]
      }
    ]
  }
}
```

### Complex Household Structure

```json
{
  "name": "household",
  "title": "Household Registration",
  "formio": {
    "components": [
      {
        "label": "Household Details",
        "type": "panel",
        "components": [
          {
            "label": "Household ID",
            "key": "householdId",
            "type": "textfield",
            "input": true,
            "required": true
          },
          {
            "label": "Address",
            "key": "address",
            "type": "textarea",
            "input": true,
            "required": true
          },
          {
            "label": "Household Type",
            "key": "householdType",
            "type": "select",
            "input": true,
            "data": {
              "values": [
                { "label": "Nuclear Family", "value": "nuclear" },
                { "label": "Extended Family", "value": "extended" },
                { "label": "Single Parent", "value": "single_parent" }
              ]
            }
          }
        ]
      }
    ]
  }
}
```

## Troubleshooting

### Common Issues

1. **Circular Dependencies**: Ensure no circular references exist between entity forms
2. **Form Validation Errors**: Check that all required fields are properly configured
3. **Data Not Saving**: Verify form submission is properly handled
4. **Performance Issues**: Optimize complex forms by reducing unnecessary components

### Debugging Tips

- Use the Form.io preview mode to test form behavior
- Check browser console for JavaScript errors
- Verify form data structure matches expected schema
- Test form submission with sample data

## Related Documentation

- [Configuration Overview](./index.md) - General configuration concepts
- [Form.io Documentation](https://form.io) - Detailed Form.io reference
