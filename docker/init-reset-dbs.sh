#!/bin/bash
set -e

# Wait for Postgres to be ready
until pg_isready -U "$POSTGRES_USER"; do
  sleep 1
done

# Drop specific databases if they exist
psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS datacollect WITH (FORCE);"
psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS datacollect_test WITH (FORCE);"

# Create the two databases
psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE datacollect;"
psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE datacollect_test;"