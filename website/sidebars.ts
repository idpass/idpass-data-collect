const backendApiSidebar = [
  {
    type: "doc",
    id: "packages/backend/api-reference-generated/idpass-data-collect-backend-api",
  },
  {
    type: "category",
    label: "Authentication",
    items: [
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/authentication",
        label: "Overview",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/user-login",
        label: "User login",
        className: "api-method post",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/validate-jwt-token",
        label: "Validate JWT token",
        className: "api-method get",
      },
    ],
  },
  {
    type: "category",
    label: "User Management",
    items: [
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/user-management",
        label: "Overview",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/get-all-users",
        label: "Get all users",
        className: "api-method get",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/create-new-user",
        label: "Create new user",
        className: "api-method post",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/update-user",
        label: "Update user",
        className: "api-method put",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/delete-user",
        label: "Delete user",
        className: "api-method delete",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/get-current-user",
        label: "Get current user",
        className: "api-method get",
      },
    ],
  },
  {
    type: "category",
    label: "Synchronization",
    items: [
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/synchronization",
        label: "Overview",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/count-entities",
        label: "Count entities",
        className: "api-method get",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/pull-events-from-server",
        label: "Pull events from server",
        className: "api-method get",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/push-events-to-server",
        label: "Push events to server",
        className: "api-method post",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/push-audit-logs-to-server",
        label: "Push audit logs to server",
        className: "api-method post",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/pull-audit-logs-from-server",
        label: "Pull audit logs from server",
        className: "api-method get",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/trigger-external-sync",
        label: "Trigger external sync",
        className: "api-method post",
      },
    ],
  },
  {
    type: "category",
    label: "App Configuration",
    items: [
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/app-configuration",
        label: "Overview",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/get-all-app-configurations",
        label: "Get all app configurations",
        className: "api-method get",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/upload-app-configuration",
        label: "Upload app configuration",
        className: "api-method post",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/delete-app-configuration",
        label: "Delete app configuration",
        className: "api-method delete",
      },
    ],
  },
  {
    type: "category",
    label: "Data Management",
    items: [
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/data-management",
        label: "Overview",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/get-potential-duplicates",
        label: "Get potential duplicates",
        className: "api-method get",
      },
      {
        type: "doc",
        id: "packages/backend/api-reference-generated/resolve-duplicate-entities",
        label: "Resolve duplicate entities",
        className: "api-method post",
      },
    ],
  },
];

const sidebars = {
  docsSidebar: [
    {
      type: "doc",
      id: "index"
    },
    {
      type: "category",
      label: "Getting Started",
      collapsed: false,
      items: [
        {
          type: "doc",
          id: "getting-started/index"
        },
        {
          type: "doc",
          id: "getting-started/installation"
        },
        {
          type: "doc",
          id: "getting-started/configuration"
        },
      ],
    },
    {
      type: "category",
      label: "Tutorials",
      items: [
        {
          type: "doc",
          id: "getting-started/tutorials"
        },
        {
          type: "doc",
          id: "getting-started/basic-entitydatamanager-setup"
        },
        {
          type: "doc",
          id: "getting-started/authentication-workflows"
        },
        {
          type: "doc",
          id: "getting-started/forms-and-entities-authenticated"
        },
        {
          type: "doc",
          id: "getting-started/entity-retrieval-and-search"
        },
        {
          type: "doc",
          id: "getting-started/authenticated-synchronization"
        },
        {
          type: "doc",
          id: "getting-started/advanced-operations"
        },
        {
          type: "doc",
          id: "getting-started/error-handling-and-best-practices"
        },
      ],
    },
    {
      type: "category",
      label: "Packages",
      collapsed: false,
      items: [
        {
          type: "doc",
          id: "packages/packages"
        },
        {
          type: "category",
          label: "@idpass/data-collect-core",
          collapsed: false,
          items: [
            {
              type: "doc",
              id: "packages/datacollect/datacollect-overview"
            },
            {
              type: "doc",
              id: "packages/datacollect/datacollect-api-reference"
            },
            {
              type: "link",
              label: "Complete API Reference",
              href: "/packages/datacollect/api/",
            },
          ],
        },
        {
          type: "category",
          label: "@idpass/data-collect-backend",
          collapsed: true,
          items: [
            {
              type: "doc",
              id: "packages/backend/backend-overview"
            },
            {
              type: "category",
              label: "REST API",
              collapsed: true,
              items: [
                // Overview of the auto-generated API documentation
                {
                  type: "doc",
                  id: "packages/backend/backend-api-overview"
                },
                // Auto-generated API documentation from OpenAPI spec
                ...backendApiSidebar,
              ],
            },
            // TODO: Add when created
            // 'packages/backend/configuration',
            // 'packages/backend/deployment/index',
          ],
        },
        {
          type: "doc",
          id: "packages/admin/index"
        },
        {
          type: "doc",
          id: "packages/mobile/index"
        },
      ],
    },
    {
      type: "category",
      label: "Architecture",
      items: [
        {
          type: "doc",
          id: "architecture/index"
        },
        {
          type: "doc",
          id: "architecture/event-sourcing"
        },
        {
          type: "doc",
          id: "architecture/sync-architecture"
        },
        {
          type: "doc",
          id: "architecture/authentication"
        },
        // TODO: Add when created
        // 'architecture/storage-adapters',
        // 'architecture/security-model',
        // 'architecture/data-flow',
      ],
    },
    {
      type: "category",
      label: "Configuration",
      items: [
        {
          type: "doc",
          id: "configuration/index"
        },
        {
          type: "doc",
          id: "configuration/entity-forms"
        },
        {
          type: "doc",
          id: "configuration/external-sync"
        },
        {
          type: "category",
          label: "Authentication Configs",
          collapsed: true,
          items: [
            {
              type: "doc",
              id: "configuration/auth-configs/index"
            },
            {
              type: "doc",
              id: "configuration/auth-configs/default-auth"
            },
            {
              type: "doc",
              id: "configuration/auth-configs/auth-configs-auth0"
            },
            {
              type: "doc",
              id: "configuration/auth-configs/auth-configs-keycloak"
            },
          ],
        },
      ],
    },
    {
      type: "category",
      label: "Deployment",
      items: [
        {
          type: "doc",
          id: "deployment/index"
        },
        {
          type: "category",
          label: "Deployment with Docker",
          link: {
            type: "doc",
            id: "deployment/docker-deployment",
          },
          items: [
            {
              type: "doc",
              id: "deployment/docker-openfn-deployment"
            },
            {
              type: "doc",
              id: "deployment/docker-openspp-deployment"
            },
          ],
        },
        {
          type: "category",
          label: "Deployment without Docker",
          link: {
            type: "doc",
            id: "deployment/without-docker-deployment",
          },
          items: [
            {
              type: "doc",
              id: "deployment/without-docker-openfn-deployment"
            },
            {
              type: "doc",
              id: "deployment/without-docker-openspp-deployment"
            },
          ],
        },
        // "deployment/production",
        // "deployment/scaling",
        // "deployment/monitoring",
      ],
    },
    {
      type: "category",
      label: "How-To Guides",
      items: [
        {
          type: "doc",
          id: "how-to/create-custom-auth-adapter"
        }
      ],
    },
    {
      type: "category",
      label: "Adapters",
      items: [
        {
          type: "doc",
          id: "adapters/openfn-adapter"
        },
        {
          type: "doc",
          id: "adapters/auth0-adapter"
        },
        {
          type: "doc",
          id: "adapters/keycloak-adapter"
        }
      ],
    },
    {
      type: "doc",
      id: "glossary"
    },
    {
      type: 'category',
      label: 'User Guide',
      items: [
        {
          type: 'doc',
          id: 'user-guide/index'
        },
        {
          type: 'doc',
          id: 'user-guide/admin-ui-dashboard'
        },
        {
          type: 'doc',
          id: 'user-guide/mobile-app'
        },
      ],
    },
  ]  
};

export default sidebars;
