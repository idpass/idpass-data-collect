# Docker Setup Guide

This directory contains Docker configurations for deploying ID PASS DataCollect.

## Quick Start

### Development Setup (Recommended for getting started)

The `docker-compose.dev.yaml` provides a development setup with everything you need to start quickly.
Before running, you need to configure the `.env` file and the `postgresql.env` file.

Keep in mind that the PostgreSQL details in both files need to be in sync,
or you will experience authentication issues between the services.

```bash
# Copy the example environment files and update with your values.
cp .env.example .env
cp .env.example .env
```
Then, you can start the services:

```bash
# Start all services
docker compose -f docker-compose.dev.yaml up -d

# View logs
docker compose -f docker-compose.dev.yaml logs -f

# Stop all services
docker compose -f docker-compose.dev.yaml down
```

This will start:
- **Sync Server** on port 3000
- **PostgreSQL** on port 5432
- **Admin UI** on port 5173
- **Mobile App UI** on port 8081
- **PgAdmin** on port 5050

### Basic Production Setup

The default `docker-compose.yaml` provides a minimal setup with just the core components:

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down
```

This will start:
- **Sync Server** on port 3000
- **PostgreSQL** on port 5432
- **Admin UI** on port 5173

### Services Overview

#### Core Services (docker-compose.yaml)

1. **sync-server**: The main HDM Sync Server
   - Port: 3000
   - Handles data synchronization between clients
   - RESTful API for data management

2. **postgres**: PostgreSQL database
   - Port: 5432
   - Stores events and entities
   - Persistent data volume

3. **admin-ui**: Vue.js administration interface
   - Port: 5173
   - User management
   - App configuration
   - Monitoring dashboard

## Advanced Setup with OpenSPP

For external synchronization with OpenSPP, use the example configuration:

```bash
# Use the OpenSPP configuration
docker compose -f docker-compose.openspp.yaml up -d
```

### Additional Services (docker-compose.openspp.yaml)

4. **openspp**: OpenSPP social protection platform
   - Port: 8069
   - Based on Odoo 17.0
   - External sync target

5. **openspp-db**: PostGIS database for OpenSPP
   - Port: 5433
   - Spatial data support
   - Separate from main database

6. **nginx**: Reverse proxy
   - Port: 80
   - Routes traffic to all services
   - SSL termination point (when configured)

## Environment Configuration

### Required Environment Files

Copy the example environment files and update with your values:

```bash
# For basic setup
cp .env.example .env
cp .env.example .env

# For OpenSPP setup (optional)
cp odoo.env.example odoo.env

```

1. **.env** - Sync server configuration
   - Contains database credentials, JWT secret, and server configuration
   - See `.env.example` for all available options

2. **postgresql.env** - Main database configuration
   - PostgreSQL credentials for HDM Sync database

3. **odoo.env** - OpenSPP configuration (optional)
   - Required only when using OpenSPP integration

4. **odoo_postgresql.env** - OpenSPP database configuration (optional)
   - PostgreSQL credentials for OpenSPP database

## Building Images

### Build all images
```bash
docker compose build
```

### Build specific service
```bash
docker compose build sync-server
docker compose build admin-ui
```

## Data Persistence

Data is persisted in Docker volumes:
- `postgres-data`: Main database data
- `odoo-web-data`: OpenSPP file storage (when using OpenSPP)
- `odoo-db-data`: OpenSPP database (when using OpenSPP)

### Backup data
```bash
# Backup PostgreSQL
docker compose exec postgres pg_dump -U admin hdm_sync > backup.sql

# Backup volumes
docker run --rm -v postgres-data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-data.tar.gz -C /data .
```

### Restore data
```bash
# Restore PostgreSQL
docker compose exec -T postgres psql -U admin hdm_sync < backup.sql

# Restore volumes
docker run --rm -v postgres-data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres-data.tar.gz -C /data
```

## Networking

All services communicate through the `hdm-network` bridge network. Service names can be used as hostnames within the network.

### Service URLs (internal)
- Sync Server: http://localhost:3000
- Admin UI: http://admin-ui
- PostgreSQL: postgres:5432
- OpenSPP: http://openspp:8069 (when enabled)

### External Access
- Sync Server API: http://localhost:3000
- Admin UI: http://localhost:5173
- OpenSPP: http://localhost:8069 (when enabled)
- Nginx Proxy: http://localhost:80 (when enabled)

## Troubleshooting

### View logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f sync-server
```

### Access container shell
```bash
docker compose exec sync-server sh
docker compose exec postgres psql -U admin hdm_sync
```

### Reset everything
```bash
# Stop and remove containers, networks, volumes
docker compose down -v

# Remove all images
docker compose down --rmi all
```

### Common Issues

1. **Port conflicts**: Ensure ports 3000, 5173, and 5432 are not in use
2. **Database connection**: Wait for postgres to be ready before starting sync-server
3. **Permission issues**: The sync-server runs as non-root user `node`

## Production Considerations

1. **Security**:
   - Change all default passwords
   - Use secrets management for sensitive data
   - Enable SSL/TLS
   - Restrict network access

2. **Performance**:
   - Adjust PostgreSQL configuration for production workloads
   - Configure resource limits in docker compose
   - Use external load balancer for high availability

3. **Monitoring**:
   - Set up logging aggregation
   - Monitor container health
   - Track resource usage

## Development Workflow

### Hot reload for development
```bash
# Mount source code for live updates
docker compose -f docker-compose.dev.yaml up
```

This will start:
- **Admin UI** on port 5173
- **Sync Server** on port 3000
- **PostgreSQL** on port 5432
- **PgAdmin** on port 5050
- **Mobile UI** on port 8081

### Running tests in containers
```bash
# Run sync server tests
docker compose exec sync-server npm test

# Run admin UI tests
docker compose exec admin-ui npm run test:unit
```
