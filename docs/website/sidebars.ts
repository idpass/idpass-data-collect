import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

// Backend API sidebar items - automatically generated
const backendApiSidebar = [
  {
    type: "doc",
    id: "packages/backend/api-reference-generated/idpass-datacollect-backend-api",
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

const sidebars: SidebarsConfig = {
  docsSidebar: [
    "index",
    {
      type: "category",
      label: "Getting Started",
      collapsed: false,
      items: [
        "getting-started/index",
        "getting-started/installation",
        "getting-started/tutorials",
        "getting-started/configuration",
      ],
    },
    {
      type: "category",
      label: "Packages",
      collapsed: false,
      items: [
        "packages/packages",
        {
          type: "category",
          label: "DataCollect",
          collapsed: true,
          items: [
            "packages/datacollect/datacollect-overview",
            "packages/datacollect/datacollect-api-reference",
            {
              type: "link",
              label: "Complete API Reference",
              href: "/packages/datacollect/api/",
            },
            // TODO: Add when created
            // "packages/datacollect/datacollect-tutorials",
            // 'packages/datacollect/configuration',
          ],
        },
        {
          type: "category",
          label: "Backend",
          collapsed: true,
          items: [
            "packages/backend/backend-overview",
            {
              type: "category",
              label: "REST API",
              collapsed: true,
              items: [
                // Overview of the auto-generated API documentation
                "packages/backend/backend-api-overview",
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
          type: "category",
          label: "Admin",
          collapsed: true,
          items: [
            "packages/admin/admin-overview",
            // TODO: Add when created
            // 'packages/admin/user-guide/index',
            // 'packages/admin/components/index',
            // 'packages/admin/theming',
          ],
        },
        {
          type: "category",
          label: "Mobile",
          collapsed: true,
          items: ["packages/mobile/mobile-overview"],
        },
      ],
    },
    // TODO: Add Guides section when content is created
    // {
    //   type: 'category',
    //   label: 'Guides',
    //   collapsed: true,
    //   items: [
    //     'guides/deployment/index',
    //     'guides/integration/index',
    //     'guides/troubleshooting/index',
    //   ],
    // },
    {
      type: "category",
      label: "Architecture",
      items: [
        "architecture/index",
        "architecture/event-sourcing",
        "architecture/sync-architecture",
        "architecture/authentication",
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
        "configuration/index",
        "configuration/entity-forms",
        "configuration/external-sync",
        {
          type: "category",
          label: "Authentication Configs",
          collapsed: true,
          items: [
            "configuration/auth-configs/index",
            "configuration/auth-configs/auth-configs-auth0",
            "configuration/auth-configs/auth-configs-keycloak",
          ],
        },
      ],
    },
    {
      type: "category",
      label: "Deployment",
      items: [
        "deployment/index",
        // "deployment/docker",
        // "deployment/production",
        // "deployment/scaling",
        // "deployment/monitoring",
      ],
    },
    {
      type: "category",
      label: "How-To Guides",
      items: [
        "how-to/create-custom-auth-adapter",
      ],
    },
    {
      type: "category",
      label: "Adapters",
      items: [
        "adapters/openfn-adapter",
        "adapters/auth0-adapter",
        "adapters/keycloak-adapter",
        
      ],
    },
    // TODO: Add these sections when documents are created
    /*
    {
      type: 'category',
      label: 'User Guide',
      items: [
        'user-guide/index',
        'user-guide/data-management',
        'user-guide/sync-operations',
        'user-guide/forms-submissions',
        'user-guide/offline-mode',
        'user-guide/troubleshooting',
      ],
    },

    {
      type: 'category',
      label: 'Administration',
      items: [
        'administration/index',
        'administration/user-management',
        'administration/multi-tenant',
        'administration/external-sync',
        'administration/backup-restore',
      ],
    },
    {
      type: 'category',
      label: 'Developers',
      items: [
        'developers/index',
        'developers/contributing',
        'developers/development-setup',
        'developers/testing',
        'developers/coding-standards',
        'developers/release-process',
      ],
    },
    {
      type: 'category',
      label: 'Tutorials',
      items: [
        'tutorials/index',
        'tutorials/basic-usage',
        'tutorials/custom-events',
        'tutorials/external-adapters',
        'tutorials/integration-examples',
      ],
    },
    {
      type: 'category',
      label: 'Examples',
      items: [
        'examples/index',
        'examples/basic-client',
        'examples/multi-tenant-setup',
        'examples/custom-sync-adapter',
        'examples/production-deployment',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'reference/index',
        'reference/configuration-schema',
        'reference/event-types',
        'reference/error-codes',
        'reference/performance',
        'reference/faq',
      ],
    },
    */
  ],
};

export default sidebars;
