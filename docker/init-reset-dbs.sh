#!/bin/bash
set -e

# Wait for Postgres to be ready
until pg_isready -U "$POSTGRES_USER"; do
  sleep 1
done

# Drop all databases except postgres, template0, template1
psql -U "$POSTGRES_USER" -d postgres -c "
DO \$\$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT datname FROM pg_database WHERE datname NOT IN ('postgres', 'template0', 'template1')) LOOP
        EXECUTE 'DROP DATABASE IF EXISTS ' || quote_ident(r.datname) || ' WITH (FORCE);';
    END LOOP;
END
\$\$;
"

# Create the two databases
psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE datacollect;"
psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE datacollect_test;"