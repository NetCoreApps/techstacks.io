#!/bin/bash
# Sync production PostgreSQL database to local instance
# Usage: ./scripts/sync-db.sh
# Requires: TECHSTACKS_DB_PROD env var with .NET connection string
#   e.g. Server=host;Port=5433;User Id=user;Password=pass;Database=dbname

set -euo pipefail

if [ -z "${TECHSTACKS_DB_PROD:-}" ]; then
    echo "Error: TECHSTACKS_DB_PROD environment variable is not set"
    echo "Expected .NET connection string format:"
    echo "  Server=host;Port=5433;User Id=user;Password=pass;Database=dbname"
    exit 1
fi

# Parse .NET connection string
parse_connstr() {
    echo "$TECHSTACKS_DB_PROD" | tr ';' '\n' | grep -i "^$1=" | head -1 | cut -d'=' -f2-
}

REMOTE_HOST=$(parse_connstr "Server")
REMOTE_PORT=$(parse_connstr "Port")
REMOTE_USER=$(parse_connstr "User Id")
REMOTE_PASS=$(parse_connstr "Password")
REMOTE_DB=$(parse_connstr "Database")

REMOTE_PORT="${REMOTE_PORT:-5432}"

# Local
LOCAL_HOST="localhost"
LOCAL_PORT="5432"
LOCAL_USER="techstacks"
LOCAL_DB="techstacks"

DUMP_FILE="/tmp/techstacks-prod-dump.sql"

echo "==> Dumping production database from ${REMOTE_HOST}:${REMOTE_PORT}..."
PGPASSWORD="$REMOTE_PASS" pg_dump \
    -h "$REMOTE_HOST" \
    -p "$REMOTE_PORT" \
    -U "$REMOTE_USER" \
    -d "$REMOTE_DB" \
    --no-owner \
    --no-acl \
    -F plain \
    -f "$DUMP_FILE"

echo "==> Dump complete: $(du -h "$DUMP_FILE" | cut -f1)"

echo "==> Dropping and recreating local database..."
PGPASSWORD="${LOCAL_PGPASSWORD:-techstacks}" dropdb \
    -h "$LOCAL_HOST" \
    -p "$LOCAL_PORT" \
    -U "$LOCAL_USER" \
    --if-exists \
    "$LOCAL_DB"

PGPASSWORD="${LOCAL_PGPASSWORD:-techstacks}" createdb \
    -h "$LOCAL_HOST" \
    -p "$LOCAL_PORT" \
    -U "$LOCAL_USER" \
    "$LOCAL_DB"

echo "==> Restoring dump to local database..."
PGPASSWORD="${LOCAL_PGPASSWORD:-techstacks}" psql \
    -h "$LOCAL_HOST" \
    -p "$LOCAL_PORT" \
    -U "$LOCAL_USER" \
    -d "$LOCAL_DB" \
    -f "$DUMP_FILE" \
    -v ON_ERROR_STOP=1 2>&1 | grep -v "^SET\|^COMMENT\|^ALTER\|^CREATE\|^$" || true

echo "==> Verifying restore..."
TABLE_COUNT=$(PGPASSWORD="${LOCAL_PGPASSWORD:-techstacks}" psql \
    -h "$LOCAL_HOST" \
    -p "$LOCAL_PORT" \
    -U "$LOCAL_USER" \
    -d "$LOCAL_DB" \
    -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "==> Restored ${TABLE_COUNT// /} tables"

echo "==> Cleaning up dump file..."
rm -f "$DUMP_FILE"

echo "==> Done! Local database synced from production."
