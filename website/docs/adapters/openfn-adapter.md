# OpenFn Adapter

The OpenFn adapter enables synchronization with [OpenFn](https://www.openfn.org/), an integration platform for connecting humanitarian and development systems. This adapter allows you to push data from IDPass DataCollect to OpenFn workflows for further processing and integration with external systems.

## Configuration Requirements

The OpenFn adapter requires the following configuration in your app config file:

```json
{
  "externalSync": {
    "type": "openfn",
    "url": "https://app.openfn.org/i/{webhookId}",
    "extraFields": [
      {
        "name": "apiKey",
        "value": "your-webhook-api-key"
      },
      {
        "name": "callbackToken",
        "value": "generated-callback-token"
      }
    ]
  }
}
```

## Configuration Parameters

### Required Fields

- `type`: Must be set to `"openfn"` (required)
- `url`: The OpenFn webhook URL where data will be pushed (required)

### Extra Fields Array

The `extraFields` array allows you to configure additional parameters specific to the OpenFn adapter:

| Field Name      | Description                              | Required | Notes                                                      |
| --------------- | ---------------------------------------- | -------- | ---------------------------------------------------------- |
| `apiKey`        | API key for webhook authentication       | Optional | Required if your OpenFn webhook has authentication enabled |
| `callbackToken` | Generated token for pull sync operations | Optional | Currently reserved for future pull sync functionality      |
| `batchSize`     | Number of records to send per batch      | Optional | Defaults to 100 if not specified                           |

## Example Configuration

Here's a complete example configuration for a student attendance tracking system:

```json
{
  "id": "student-attendance-tracking",
  "name": "Student Attendance Tracking",
  "description": "Sample config for OpenFn adapter using student attendance workflow",
  "version": "1.0.0",
  "entityForms": [
    {
      "name": "student",
      "title": "Student Attendance",
      "formio": {
        "display": "form",
        "components": [
          {
            "key": "student_id",
            "type": "textfield",
            "label": "Student ID",
            "validate": { "required": true, "unique": true }
          },
          {
            "key": "attendance_status",
            "type": "radio",
            "label": "Attendance Status",
            "values": [
              { "label": "Present", "value": "present" },
              { "label": "Absent", "value": "absent" },
              { "label": "Late", "value": "late" },
              { "label": "Excused", "value": "excused" }
            ]
          }
        ]
      }
    }
  ],
  "externalSync": {
    "type": "openfn",
    "url": "https://app.openfn.org/i/your-webhook-id",
    "extraFields": [
      {
        "name": "apiKey",
        "value": "your-api-key"
      },
      {
        "name": "callbackToken",
        "value": "your-callback-token"
      },
      {
        "name": "batchSize",
        "value": "50"
      }
    ]
  }
}
```

## Configuration via Admin Interface

When using the IDPass DataCollect admin interface to configure the OpenFn adapter:

1. Set **Type** to "OpenFn"
2. Enter your **URL** (OpenFn webhook URL)
3. Use the **Add Field** button to add extra configuration fields:
   - **Name**: `apiKey`, **Value**: `your-webhook-api-key`
   - **Name**: `callbackToken`, **Value**: `your-callback-token`
   - **Name**: `batchSize`, **Value**: `100` (optional)

This approach provides flexibility to add additional configuration parameters without modifying the core configuration structure.

## Current Capabilities

✅ **Push Sync**: Data is successfully pushed from IDPass DataCollect to OpenFn webhooks

- Batched processing (configurable batch size, default: 100 records per batch)
- Automatic timestamp tracking for incremental sync
- API key authentication support
- Error handling and retry logic

## Work in Progress

⏳ **Pull Sync**: Pulling data from OpenFn back to IDPass DataCollect is currently under development

- Will use callback endpoints with token authentication
- Planned to trigger OpenFn workflows that can push data back to the system
- The `callbackToken` field in extraFields is reserved for this functionality

## Data Format

When pushing data to OpenFn, the adapter sends form submissions in the following structure:

```json
{
  "entities": [
    {
      "guid": "unique-form-id",
      "entityGuid": "entity-id",
      "data": {
        "student_id": "STU001",
        "first_name": "Alice",
        "attendance_status": "present"
      },
      "timestamp": "2024-01-15T10:30:00Z",
      "userId": "user-123",
      "syncLevel": "EXTERNAL"
    }
  ]
}
```

## OpenFn Workflow Integration

On the OpenFn side, you can create workflows to:

1. Receive data from IDPass DataCollect via webhooks
2. Transform and validate the data
3. Send to final destination systems (databases, APIs, etc.)
4. Send confirmation or updates back to IDPass DataCollect (coming soon)

## Setup Steps

1. **Create OpenFn Webhook**: Set up a webhook in your OpenFn project
2. **Configure IDPass DataCollect**: Add the OpenFn configuration to your app config
3. **Design OpenFn Workflow**: Create workflows to process incoming data
4. **Test Integration**: Verify data flows correctly from IDPass DataCollect to your target system

## Limitations

- Pull sync functionality is not yet implemented
- Callback token feature is reserved for future pull sync operations
- Currently supports one-way data flow (IDPass DataCollect → OpenFn)

## Troubleshooting

### Common Issues

**Webhook Authentication Errors**

- Verify the `apiKey` value in your `extraFields` array is correct
- Check that the webhook URL is properly formatted
- Ensure the webhook is active in your OpenFn project
- Confirm the field name is exactly `"apiKey"` (case-sensitive)

**Data Not Appearing in OpenFn**

- Check that the sync process is running
- Verify the webhook URL is accessible
- Review OpenFn logs for processing errors
- Ensure the `type` field is set to `"openfn"`

**Batch Processing Issues**

- Default batch size is 100 records
- Override with `batchSize` field in `extraFields` if needed
- Large datasets may take time to process
- Check timestamp tracking for incremental sync status

**Configuration Issues**

- Ensure `extraFields` is an array of objects with `name` and `value` properties
- Field names in `extraFields` are case-sensitive
- Values in `extraFields` should be strings, even for numeric values like `batchSize`

## Support

For issues specific to the OpenFn adapter, please check:

- OpenFn documentation: https://docs.openfn.org/
- [IDPass DataCollect GitHub issues](https://github.com/idpass/idpass-data-collect/issues)
- OpenFn community forum for workflow-related questions
