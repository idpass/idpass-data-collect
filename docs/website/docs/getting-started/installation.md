---
id: installation
title: Installation
sidebar_position: 2
---

# Installation Guide

This guide provides detailed installation instructions for ID PASS DataCollect based on the actual implementation and tested deployment scenarios.

## System Requirements

### Client Applications
- **Node.js**: 18.x or higher
- **Browser**: Modern browser with IndexedDB support (Chrome 58+, Firefox 55+, Safari 10+)
- **Memory**: Minimum 512MB available for IndexedDB storage

### Backend Server
- **Node.js**: 18.x or higher
- **PostgreSQL**: 12.x or higher
- **Memory**: Minimum 2GB RAM for production
- **Storage**: SSD recommended for database performance

## Installation Methods

### Method 1: Development Setup

For development and testing purposes.

#### 1. Clone the Repository
```bash
git clone https://github.com/idpass/idpass-data-collect.git
cd idpass-data-collect
```

#### 2. Install DataCollect Core Library
```bash
cd packages/datacollect
npm install
npm run build
```

**Verify installation:**
```bash
npm test
# Should pass all tests with fake-indexeddb
```

#### 3. Set Up Backend (Optional)
```bash
cd packages/backend
npm install

# Create environment file
cp .env.example .env
```

**Edit `.env` file:**
```env
POSTGRES=postgresql://admin:admin@localhost:5432/postgres
POSTGRES_TEST=postgresql://admin:admin@localhost:5432/test
INITIAL_PASSWORD=your-secure-password
JWT_SECRET=your-jwt-secret-key
PORT=3000
```

**Start PostgreSQL** (using Docker):
```bash
docker run --name postgres-hdm \
  -e POSTGRES_USER=admin \
  -e POSTGRES_PASSWORD=admin \
  -e POSTGRES_DB=postgres \
  -p 5432:5432 \
  -d postgres:14
```

**Start backend:**
```bash
npm run dev
# Server starts on http://localhost:3000
```

#### 4. Set Up Admin Interface (Optional)
```bash
cd packages/admin
npm install

# Create environment file
cp .env.example .env
```

**Edit `.env` file:**
```env
VITE_API_URL=http://localhost:3000
```

**Start admin interface:**
```bash
npm run dev
# Interface available at http://localhost:5173
```

### Method 2: Docker Deployment

For production-like environments.

#### 1. Clone Repository
```bash
git clone https://github.com/idpass/idpass-data-collect.git
cd idpass-data-collect
```

#### 2. Configure Environment
```bash
# Copy environment files
cp .env.example .env
cp postgresql.env.example postgresql.env

# Edit .env with your configuration
nano .env
```

#### 3. Build and Start Services
```bash
docker-compose build
docker-compose up -d
```

**Services will be available at:**
- Backend API: http://localhost:3000
- Admin Interface: http://localhost:5173
- PostgreSQL: localhost:5432

### Method 3: npm Package Installation

For integrating DataCollect into existing applications.

#### 1. Install Package
```bash
npm install idpass-data-collect
```

#### 2. Basic Usage
```typescript
import {
  EntityDataManager,
  IndexedDbEntityStorageAdapter,
  IndexedDbEventStorageAdapter,
  EventApplierService,
  EntityType,
  SyncLevel
} from 'idpass-data-collect';

// Initialize storage adapters
const eventStorageAdapter = new IndexedDbEventStorageAdapter();
const entityStorageAdapter = new IndexedDbEntityStorageAdapter();

// Initialize stores
const eventStore = new EventStoreImpl('user-1', eventStorageAdapter);
await eventStore.initialize();

const entityStore = new EntityStoreImpl(entityStorageAdapter);
await entityStore.initialize();

// Initialize services
const eventApplierService = new EventApplierService('user-1', eventStore, entityStore);

// Create entity data manager
const manager = new EntityDataManager(
  eventStore,
  entityStore,
  null, // No sync adapter for offline-only
  null, // No internal sync manager
  eventApplierService
);

console.log('DataCollect initialized successfully');
```

## Verification

### Test DataCollect Library
```typescript
// Create a test group
const groupForm = {
  guid: 'test-group-001',
  type: 'create-group',
  entityGuid: 'test-group-001',
  data: { name: 'Test Family' },
  timestamp: new Date().toISOString(),
  userId: 'test-user',
  syncLevel: SyncLevel.LOCAL
};

const result = await manager.submitForm(groupForm);
console.log('Created group:', result);

// Verify the group was saved
const savedGroup = await manager.getEntity(result.id);
console.log('Retrieved group:', savedGroup);
```

### Test Backend API
```bash
# Test health endpoint
curl http://localhost:3000/api/health

# Test authentication
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@hdm.example", "password": "your-password"}'
```

### Test Admin Interface
1. Open http://localhost:5173
2. Login with admin credentials
3. Navigate to Users section
4. Verify user management interface loads

## Common Installation Issues

### IndexedDB Errors
**Problem**: IndexedDB not available in environment
**Solution**: Ensure running in browser context or use fake-indexeddb for testing
```typescript
// For testing environments
import 'fake-indexeddb/auto';
```

### PostgreSQL Connection Errors
**Problem**: Cannot connect to PostgreSQL
**Solutions**:
1. Verify PostgreSQL is running: `docker ps`
2. Check connection string in `.env`
3. Ensure database exists: `createdb postgres`

### Port Conflicts
**Problem**: Port 3000 or 5173 already in use
**Solutions**:
1. Change PORT in backend `.env` file
2. Update VITE_API_URL in admin `.env` file
3. Kill existing processes: `lsof -ti:3000 | xargs kill`

### Build Failures
**Problem**: TypeScript compilation errors
**Solutions**:
1. Ensure Node.js version 18+: `node --version`
2. Clear node_modules and reinstall: `rm -rf node_modules && npm install`
3. Check for peer dependency conflicts: `npm ls`

## Production Considerations

### Security
- Use strong passwords for `INITIAL_PASSWORD` and `JWT_SECRET`
- Enable HTTPS in production
- Configure PostgreSQL with proper authentication
- Regularly update dependencies

### Performance
- Use SSD storage for PostgreSQL
- Configure appropriate PostgreSQL memory settings
- Enable gzip compression in reverse proxy
- Monitor IndexedDB storage limits in browsers

### Monitoring
- Set up logging for Express.js backend
- Monitor PostgreSQL performance
- Track API response times
- Set up health checks for Docker containers

## Next Steps

- [Configuration Guide](configuration.md) - Configure for your environment
- [First App Tutorial](first-app.md) - Build your first application
- [API Documentation](/api/datacollect/index.html) - Explore the APIs
- [Deployment Guide](../deployment/README.md) - Production deployment