---
id: index
title: Getting Started
sidebar_position: 1
---

# Getting Started with ID PASS Data Collectct

ID PASS Data Collectct is a robust, offline-first data management system designed for managing household and individual beneficiary data. This guide will help you get up and running quickly.

## What is ID PASS Data Collectct?

ID PASS Data Collectct provides:
- **Offline-first architecture** - Work without internet connectivity
- **Event sourcing** - Complete audit trail of all data changes
- **Two-level synchronization** - Client ↔ Server ↔ External systems
- **Multi-tenant support** - Support multiple organizations
- **TypeScript-based** - Type-safe development experience

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 12+ (for backend)
- Modern web browser with IndexedDB support

### 5-Minute Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/Data-Management-System-Sync.git
   cd Data-Management-System-Sync
   ```

2. **Build the DataCollect library**
   ```bash
   cd packages/datacollect
   npm install
   npm run build
   ```

3. **Set up the backend** (optional, for sync functionality)
   ```bash
   cd packages/backend
   npm install
   cp .env.example .env
   # Edit .env with your database settings
   npm run dev
   ```

4. **Try the admin interface** (optional)
   ```bash
   cd packages/admin
   npm install
   npm run dev
   ```

### Your First Application

Create a simple client application:

```typescript
import {
  EntityDataManager,
  IndexedDbEntityStorageAdapter,
  IndexedDbEventStorageAdapter,
  EventApplierService,
  SyncLevel
} from "idpass-datacollect";

// Initialize the data manager
const manager = await initializeDataManager();

// Create a household group
const groupData = {
  guid: "group-001",
  type: "create-group",
  entityGuid: "group-001",
  data: { name: "Smith Family" },
  timestamp: new Date().toISOString(),
  userId: "user-1",
  syncLevel: SyncLevel.LOCAL,
};

const group = await manager.submitForm(groupData);
console.log("Created group:", group);

// Add a family member
const memberData = {
  guid: "member-001",
  entityGuid: "individual-001",
  type: "create-individual", 
  data: { 
    name: "John Smith",
    dateOfBirth: "1980-01-01",
    relationship: "Head"
  },
  timestamp: new Date().toISOString(),
  userId: "user-1",
  syncLevel: SyncLevel.LOCAL,
};

const member = await manager.submitForm(memberData);
console.log("Created member:", member);
```

## What's Next?

- [Installation Guide](installation.md) - Detailed installation instructions
- [Configuration](configuration.md) - Configure for your environment  
- [Build Your First App](first-app.md) - Complete tutorial
- [User Guide](../user-guide/README.md) - Comprehensive usage guide
- [API Reference](/api/datacollect/index.html) - Complete API documentation

## Need Help?

- Check our [Troubleshooting Guide](../user-guide/troubleshooting.md)
- Read the [FAQ](../reference/faq.md)
- Open an issue on [GitHub](https://github.com/your-org/Data-Management-System-Sync/issues)
- Join our [Community Discussions](https://github.com/your-org/Data-Management-System-Sync/discussions)