import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";


// Copy this to sidebars.ts if the API structure changes:
// const backendApiSidebar = [
  {
    "type": "doc",
    "id": "packages/backend/api-reference-generated/idpass-datacollect-backend-api"
  },
  {
    "type": "category",
    "label": "Authentication",
    "link": {
      "type": "doc",
      "id": "packages/backend/api-reference-generated/authentication"
    },
    "items": [
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/user-login",
        "label": "User login",
        "className": "api-method post"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/validate-jwt-token",
        "label": "Validate JWT token",
        "className": "api-method get"
      }
    ]
  },
  {
    "type": "category",
    "label": "User Management",
    "link": {
      "type": "doc",
      "id": "packages/backend/api-reference-generated/user-management"
    },
    "items": [
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/get-all-users",
        "label": "Get all users",
        "className": "api-method get"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/create-new-user",
        "label": "Create new user",
        "className": "api-method post"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/update-user",
        "label": "Update user",
        "className": "api-method put"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/delete-user",
        "label": "Delete user",
        "className": "api-method delete"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/get-current-user",
        "label": "Get current user",
        "className": "api-method get"
      }
    ]
  },
  {
    "type": "category",
    "label": "Synchronization",
    "link": {
      "type": "doc",
      "id": "packages/backend/api-reference-generated/synchronization"
    },
    "items": [
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/count-entities",
        "label": "Count entities",
        "className": "api-method get"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/pull-events-from-server",
        "label": "Pull events from server",
        "className": "api-method get"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/push-events-to-server",
        "label": "Push events to server",
        "className": "api-method post"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/push-audit-logs-to-server",
        "label": "Push audit logs to server",
        "className": "api-method post"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/pull-audit-logs-from-server",
        "label": "Pull audit logs from server",
        "className": "api-method get"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/trigger-external-sync",
        "label": "Trigger external sync",
        "className": "api-method post"
      }
    ]
  },
  {
    "type": "category",
    "label": "App Configuration",
    "link": {
      "type": "doc",
      "id": "packages/backend/api-reference-generated/app-configuration"
    },
    "items": [
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/get-all-app-configurations",
        "label": "Get all app configurations",
        "className": "api-method get"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/upload-app-configuration",
        "label": "Upload app configuration",
        "className": "api-method post"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/delete-app-configuration",
        "label": "Delete app configuration",
        "className": "api-method delete"
      }
    ]
  },
  {
    "type": "category",
    "label": "Data Management",
    "link": {
      "type": "doc",
      "id": "packages/backend/api-reference-generated/data-management"
    },
    "items": [
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/get-potential-duplicates",
        "label": "Get potential duplicates",
        "className": "api-method get"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/resolve-duplicate-entities",
        "label": "Resolve duplicate entities",
        "className": "api-method post"
      }
    ]
  }
];

const sidebar: SidebarsConfig = {
  apisidebar: [
  {
    "type": "doc",
    "id": "packages/backend/api-reference-generated/idpass-datacollect-backend-api"
  },
  {
    "type": "category",
    "label": "Authentication",
    "link": {
      "type": "doc",
      "id": "packages/backend/api-reference-generated/authentication"
    },
    "items": [
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/user-login",
        "label": "User login",
        "className": "api-method post"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/validate-jwt-token",
        "label": "Validate JWT token",
        "className": "api-method get"
      }
    ]
  },
  {
    "type": "category",
    "label": "User Management",
    "link": {
      "type": "doc",
      "id": "packages/backend/api-reference-generated/user-management"
    },
    "items": [
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/get-all-users",
        "label": "Get all users",
        "className": "api-method get"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/create-new-user",
        "label": "Create new user",
        "className": "api-method post"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/update-user",
        "label": "Update user",
        "className": "api-method put"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/delete-user",
        "label": "Delete user",
        "className": "api-method delete"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/get-current-user",
        "label": "Get current user",
        "className": "api-method get"
      }
    ]
  },
  {
    "type": "category",
    "label": "Synchronization",
    "link": {
      "type": "doc",
      "id": "packages/backend/api-reference-generated/synchronization"
    },
    "items": [
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/count-entities",
        "label": "Count entities",
        "className": "api-method get"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/pull-events-from-server",
        "label": "Pull events from server",
        "className": "api-method get"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/push-events-to-server",
        "label": "Push events to server",
        "className": "api-method post"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/push-audit-logs-to-server",
        "label": "Push audit logs to server",
        "className": "api-method post"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/pull-audit-logs-from-server",
        "label": "Pull audit logs from server",
        "className": "api-method get"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/trigger-external-sync",
        "label": "Trigger external sync",
        "className": "api-method post"
      }
    ]
  },
  {
    "type": "category",
    "label": "App Configuration",
    "link": {
      "type": "doc",
      "id": "packages/backend/api-reference-generated/app-configuration"
    },
    "items": [
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/get-all-app-configurations",
        "label": "Get all app configurations",
        "className": "api-method get"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/upload-app-configuration",
        "label": "Upload app configuration",
        "className": "api-method post"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/delete-app-configuration",
        "label": "Delete app configuration",
        "className": "api-method delete"
      }
    ]
  },
  {
    "type": "category",
    "label": "Data Management",
    "link": {
      "type": "doc",
      "id": "packages/backend/api-reference-generated/data-management"
    },
    "items": [
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/get-potential-duplicates",
        "label": "Get potential duplicates",
        "className": "api-method get"
      },
      {
        "type": "doc",
        "id": "packages/backend/api-reference-generated/resolve-duplicate-entities",
        "label": "Resolve duplicate entities",
        "className": "api-method post"
      }
    ]
  }
],
};

export default sidebar.apisidebar;
