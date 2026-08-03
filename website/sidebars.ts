const backendApiSidebar = [
  {
    type: "doc",
    id: "packages/backend/api-reference-generated/idpass-data-collect-backend-api",
  },
  {
    type: "category",
    label: "Meta",
    link: { type: "doc", id: "packages/backend/api-reference-generated/meta" },
    items: [
      { type: "doc", id: "packages/backend/api-reference-generated/health-check", label: "Health check", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/openapi-specification", label: "OpenAPI specification", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/download-program-config-artifact-json", label: "Download program config artifact (JSON)", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/download-program-qr-code-png", label: "Download program QR code (PNG)", className: "api-method get" },
    ],
  },
  {
    type: "category",
    label: "Authentication",
    link: { type: "doc", id: "packages/backend/api-reference-generated/authentication" },
    items: [
      { type: "doc", id: "packages/backend/api-reference-generated/log-in", label: "Log in", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/refresh-access-token", label: "Refresh access token", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/validate-access-token", label: "Validate access token", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/get-current-user", label: "Get current user", className: "api-method get" },
    ],
  },
  {
    type: "category",
    label: "User Management",
    link: { type: "doc", id: "packages/backend/api-reference-generated/user-management" },
    items: [
      { type: "doc", id: "packages/backend/api-reference-generated/list-all-users", label: "List all users", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/create-a-user", label: "Create a user", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/update-a-user", label: "Update a user", className: "api-method put" },
      { type: "doc", id: "packages/backend/api-reference-generated/delete-a-user", label: "Delete a user", className: "api-method delete" },
    ],
  },
  {
    type: "category",
    label: "App Configuration",
    link: { type: "doc", id: "packages/backend/api-reference-generated/app-configuration" },
    items: [
      { type: "doc", id: "packages/backend/api-reference-generated/list-app-configurations", label: "List app configurations", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/upload-a-new-app-configuration", label: "Upload a new app configuration", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/get-app-configuration-by-id", label: "Get app configuration by ID", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/replace-app-configuration", label: "Replace app configuration", className: "api-method put" },
      { type: "doc", id: "packages/backend/api-reference-generated/archive-app-configuration", label: "Archive app configuration", className: "api-method delete" },
      { type: "doc", id: "packages/backend/api-reference-generated/public-config-metadata", label: "Public config metadata", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/restore-archived-configuration", label: "Restore archived configuration", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/permanently-delete-configuration-non-production-only", label: "Permanently delete configuration", className: "api-method delete" },
    ],
  },
  {
    type: "category",
    label: "Entities",
    link: { type: "doc", id: "packages/backend/api-reference-generated/entities" },
    items: [
      { type: "doc", id: "packages/backend/api-reference-generated/list-entities", label: "List entities", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/count-entities", label: "Count entities", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/count-entities-grouped-by-form", label: "Count entities grouped by form", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/search-entities", label: "Search entities", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/get-entity-by-guid", label: "Get entity by GUID", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/list-members-of-a-group", label: "List members of a group", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/list-events-for-an-entity", label: "List events for an entity", className: "api-method get" },
    ],
  },
  {
    type: "category",
    label: "Synchronization",
    link: { type: "doc", id: "packages/backend/api-reference-generated/synchronization" },
    items: [
      { type: "doc", id: "packages/backend/api-reference-generated/pull-events-from-server", label: "Pull events from server", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/external-pull-callback-reserved", label: "External pull callback (reserved)", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/push-events-to-server", label: "Push events to server", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/pull-audit-logs", label: "Pull audit logs", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/push-audit-logs", label: "Push audit logs", className: "api-method post" },
    ],
  },
  {
    type: "category",
    label: "External Sync Jobs",
    link: { type: "doc", id: "packages/backend/api-reference-generated/external-sync-jobs" },
    items: [
      { type: "doc", id: "packages/backend/api-reference-generated/get-latest-external-sync-status", label: "Get latest external sync status", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/list-recent-sync-jobs", label: "List recent sync jobs", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/trigger-external-sync", label: "Trigger external sync", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/get-sync-job-by-id", label: "Get sync job by ID", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/cancel-a-running-sync-job", label: "Cancel a running sync job", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/retry-a-completed-sync-job", label: "Retry a completed sync job", className: "api-method post" },
    ],
  },
  {
    type: "category",
    label: "Attachments",
    link: { type: "doc", id: "packages/backend/api-reference-generated/attachments" },
    items: [
      { type: "doc", id: "packages/backend/api-reference-generated/upload-an-attachment", label: "Upload an attachment", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/download-an-attachment", label: "Download an attachment", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/delete-an-attachment", label: "Delete an attachment", className: "api-method delete" },
      { type: "doc", id: "packages/backend/api-reference-generated/list-attachment-metadata-for-an-entity", label: "List attachment metadata for an entity", className: "api-method get" },
    ],
  },
  {
    type: "category",
    label: "Self-Service",
    link: { type: "doc", id: "packages/backend/api-reference-generated/self-service" },
    items: [
      { type: "doc", id: "packages/backend/api-reference-generated/request-otp", label: "Request OTP", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/verify-otp", label: "Verify OTP", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/verify-national-id-date-of-birth", label: "Verify national ID + date of birth", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/exchange-oidc-token-for-self-service-jwt", label: "Exchange OIDC token for self-service JWT", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/get-citizen-s-own-entity-and-available-forms", label: "Get citizen's own entity and available forms", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/submit-self-service-change-request", label: "Submit self-service change request", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/list-citizen-s-submission-history", label: "List citizen's submission history", className: "api-method get" },
    ],
  },
  {
    type: "category",
    label: "Potential Duplicates",
    link: { type: "doc", id: "packages/backend/api-reference-generated/potential-duplicates" },
    items: [
      { type: "doc", id: "packages/backend/api-reference-generated/list-potential-duplicates", label: "List potential duplicates", className: "api-method get" },
      { type: "doc", id: "packages/backend/api-reference-generated/resolve-a-potential-duplicate", label: "Resolve a potential duplicate", className: "api-method post" },
    ],
  },
  {
    type: "category",
    label: "OpenSPP Fields",
    link: { type: "doc", id: "packages/backend/api-reference-generated/openspp-fields" },
    items: [
      { type: "doc", id: "packages/backend/api-reference-generated/parse-openspp-fields-from-uploaded-json-file", label: "Parse OpenSPP fields from uploaded JSON file", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/parse-openspp-fields-from-json-payload", label: "Parse OpenSPP fields from JSON payload", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/fetch-fields-from-openspp-v1-odoo", label: "Fetch fields from OpenSPP V1 (Odoo)", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/test-openspp-v2-oauth2-connection", label: "Test OpenSPP V2 OAuth2 connection", className: "api-method post" },
      { type: "doc", id: "packages/backend/api-reference-generated/fetch-openspp-v2-studio-fields", label: "Fetch OpenSPP V2 Studio fields", className: "api-method post" },
    ],
  },
];

const developerSidebarItems = [
  {
    type: "doc",
    id: "developers/index",
  },
  {
    type: "category",
    label: "Setup & Onboarding",
    collapsed: false,
    items: [
      {
        type: "doc",
        id: "getting-started/index",
      },
      {
        type: "doc",
        id: "getting-started/installation",
      },
      {
        type: "doc",
        id: "getting-started/configuration",
      },
      {
        type: "doc",
        id: "getting-started/tutorials",
      },
      {
        type: "doc",
        id: "getting-started/migration-v2",
      },
    ],
  },
  {
    type: "category",
    label: "Development Guides",
    items: [
      {
        type: "doc",
        id: "getting-started/basic-entitydatamanager-setup",
      },
      {
        type: "doc",
        id: "getting-started/authentication-workflows",
      },
      {
        type: "doc",
        id: "getting-started/forms-and-entities-authenticated",
      },
      {
        type: "doc",
        id: "getting-started/entity-retrieval-and-search",
      },
      {
        type: "doc",
        id: "getting-started/authenticated-synchronization",
      },
      {
        type: "doc",
        id: "getting-started/advanced-operations",
      },
      {
        type: "doc",
        id: "getting-started/error-handling-and-best-practices",
      },
    ],
  },
  {
    type: "category",
    label: "Architecture & Concepts",
    items: [
      {
        type: "doc",
        id: "architecture/index",
      },
      {
        type: "doc",
        id: "architecture/event-sourcing",
      },
      {
        type: "doc",
        id: "architecture/sync-architecture",
      },
      {
        type: "doc",
        id: "architecture/authentication",
      },
    ],
  },
  {
    type: "category",
    label: "Configuration & Deployment",
    items: [
      {
        type: "doc",
        id: "configuration/index",
      },
      {
        type: "doc",
        id: "configuration/entity-forms",
      },
      {
        type: "doc",
        id: "configuration/external-sync",
      },
      {
        type: "category",
        label: "Authentication Configs",
        collapsed: true,
        items: [
          {
            type: "doc",
            id: "configuration/auth-configs/index",
          },
          {
            type: "doc",
            id: "configuration/auth-configs/default-auth",
          },
          {
            type: "doc",
            id: "configuration/auth-configs/auth-configs-auth0",
          },
          {
            type: "doc",
            id: "configuration/auth-configs/auth-configs-keycloak",
          },
        ],
      },
      {
        type: "doc",
        id: "deployment/index",
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
            id: "deployment/docker-openfn-deployment",
          },
          {
            type: "doc",
            id: "deployment/docker-openspp-deployment",
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
            id: "deployment/without-docker-openfn-deployment",
          },
          {
            type: "doc",
            id: "deployment/without-docker-openspp-deployment",
          },
        ],
      },
    ],
  },
  {
    type: "category",
    label: "Reference & Extensibility",
    items: [
      {
        type: "doc",
        id: "packages/packages",
      },
      {
        type: "category",
        label: "@idpass/data-collect-core",
        collapsed: false,
        items: [
          {
            type: "doc",
            id: "packages/datacollect/datacollect-overview",
          },
          {
            type: "doc",
            id: "packages/datacollect/datacollect-api-reference",
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
            id: "packages/backend/backend-overview",
          },
          {
            type: "category",
            label: "REST API",
            collapsed: true,
            items: [
              {
                type: "doc",
                id: "packages/backend/backend-api-overview",
              },
              ...backendApiSidebar,
              {
                type: "doc",
                id: "packages/backend/openspp-fields-api",
              },
            ],
          },
        ],
      },
      {
        type: "doc",
        id: "packages/admin/index",
      },
      {
        type: "doc",
        id: "packages/mobile/index",
      },
      {
        type: "category",
        label: "How-To Guides",
        items: [
          {
            type: "doc",
            id: "how-to/create-custom-auth-adapter",
          },
          {
            type: "doc",
            id: "how-to/security-testing",
          },
        ],
      },
      {
        type: "category",
        label: "Adapters",
        items: [
          {
            type: "doc",
            id: "adapters/adapter-registry",
          },
          {
            type: "doc",
            id: "adapters/building-an-adapter",
          },
          {
            type: "doc",
            id: "adapters/publicschema-alignment",
          },
          {
            type: "doc",
            id: "adapters/openspp-adapter",
          },
          {
            type: "doc",
            id: "adapters/openspp-v2-adapter",
          },
          {
            type: "doc",
            id: "adapters/openfn-adapter",
          },
          {
            type: "doc",
            id: "adapters/auth0-adapter",
          },
          {
            type: "doc",
            id: "adapters/keycloak-adapter",
          },
        ],
      },
    ],
  },
];

const userSidebarItems = [
  {
    type: "doc",
    id: "users/index",
  },
  {
    type: "category",
    label: "Admin Console",
    items: [
      {
        type: "doc",
        id: "user-guide/index",
      },
      {
        type: "doc",
        id: "user-guide/admin-ui-dashboard",
      },
      {
        type: "doc",
        id: "user-guide/import-openspp-fields",
      },
    ],
  },
  {
    type: "category",
    label: "Mobile App",
    items: [
      {
        type: "doc",
        id: "user-guide/mobile-app",
      },
    ],
  },
  {
    type: "category",
    label: "Web App",
    items: [
      {
        type: "doc",
        id: "user-guide/web-app",
      },
    ],
  },
  {
    type: "doc",
    id: "glossary",
  },
];

const sidebars = {
  docsSidebar: [
    {
      type: "doc",
      id: "index",
    },
    {
      type: "category",
      label: "For Developers",
      collapsed: false,
      items: developerSidebarItems,
    },
    {
      type: "category",
      label: "For Admins & Field Teams",
      collapsed: false,
      items: userSidebarItems,
    },
    {
      type: "category",
      label: "Security",
      collapsed: false,
      link: { type: "doc", id: "security/security-overview" },
      items: [
        { type: "doc", id: "security/report-a-vulnerability" },
      ],
    },
  ],
};

export default sidebars;
