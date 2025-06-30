// @ts-check
/** @type {import("@docusaurus/plugin-content-docs").SidebarsConfig} */
const typedocSidebar = {
  items: [
    {
      type: "category",
      label: "Enumerations",
      items: [
        {
          type: "doc",
          id: "packages/datacollect/api/enumerations/EntityType",
          label: "EntityType"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/enumerations/SyncLevel",
          label: "SyncLevel"
        }
      ]
    },
    {
      type: "category",
      label: "Classes",
      items: [
        {
          type: "doc",
          id: "packages/datacollect/api/classes/AuthManager",
          label: "AuthManager"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/classes/EntityDataManager",
          label: "EntityDataManager"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/classes/EntityStoreImpl",
          label: "EntityStoreImpl"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/classes/EventStoreImpl",
          label: "EventStoreImpl"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/classes/ExternalSyncManager",
          label: "ExternalSyncManager"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/classes/InternalSyncManager",
          label: "InternalSyncManager"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/classes/SyncAdapterImpl",
          label: "SyncAdapterImpl"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/classes/EventApplierService",
          label: "EventApplierService"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/classes/SingleAuthStorageImpl",
          label: "SingleAuthStorageImpl"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/classes/IndexedDbAuthStorageAdapter",
          label: "IndexedDbAuthStorageAdapter"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/classes/IndexedDbEntityStorageAdapter",
          label: "IndexedDbEntityStorageAdapter"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/classes/IndexedDbEventStorageAdapter",
          label: "IndexedDbEventStorageAdapter"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/classes/PostgresEntityStorageAdapter",
          label: "PostgresEntityStorageAdapter"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/classes/PostgresEventStorageAdapter",
          label: "PostgresEventStorageAdapter"
        }
      ]
    },
    {
      type: "category",
      label: "Interfaces",
      items: [
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/EntityDoc",
          label: "EntityDoc"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/EntityPair",
          label: "EntityPair"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/GroupDoc",
          label: "GroupDoc"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/IndividualDoc",
          label: "IndividualDoc"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/DetailEntityDoc",
          label: "DetailEntityDoc"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/DetailGroupDoc",
          label: "DetailGroupDoc"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/FormSubmission",
          label: "FormSubmission"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/AuditLogEntry",
          label: "AuditLogEntry"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/EventStore",
          label: "EventStore"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/EventStorageAdapter",
          label: "EventStorageAdapter"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/EventApplier",
          label: "EventApplier"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/EncryptionAdapter",
          label: "EncryptionAdapter"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/ExportImportManager",
          label: "ExportImportManager"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/EntityStore",
          label: "EntityStore"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/EntityStorageAdapter",
          label: "EntityStorageAdapter"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/SyncAdapter",
          label: "SyncAdapter"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/AuthenticatedSyncAdapter",
          label: "AuthenticatedSyncAdapter"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/SyncStatus",
          label: "SyncStatus"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/MerkleTreeStorage",
          label: "MerkleTreeStorage"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/Conflict",
          label: "Conflict"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/ExternalSyncAdapter",
          label: "ExternalSyncAdapter"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/ExternalSyncCredentials",
          label: "ExternalSyncCredentials"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/OIDCConfig",
          label: "OIDCConfig"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/AuthResult",
          label: "AuthResult"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/AuthConfig",
          label: "AuthConfig"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/PasswordCredentials",
          label: "PasswordCredentials"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/TokenCredentials",
          label: "TokenCredentials"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/AuthAdapter",
          label: "AuthAdapter"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/AuthStorageAdapter",
          label: "AuthStorageAdapter"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/interfaces/SingleAuthStorage",
          label: "SingleAuthStorage"
        }
      ]
    },
    {
      type: "category",
      label: "Type Aliases",
      items: [
        {
          type: "doc",
          id: "packages/datacollect/api/type-aliases/ImportResult",
          label: "ImportResult"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/type-aliases/SearchCriteria",
          label: "SearchCriteria"
        },
        {
          type: "doc",
          id: "packages/datacollect/api/type-aliases/ExternalSyncConfig",
          label: "ExternalSyncConfig"
        }
      ]
    }
  ]
};
module.exports = typedocSidebar.items;