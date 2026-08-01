#!/bin/bash
set -e

if [ -z "$(ls -A "$PGDATA" 2>/dev/null)" ]; then
  until pg_basebackup -h "$POSTGRES_PRIMARY_HOST" -D "$PGDATA" -U "$PGUSER" -Fp -Xs -P -R; do
    echo "Waiting for the primary to become available for pg_basebackup..."
    sleep 1
  done
  chmod 0700 "$PGDATA"
fi

exec docker-entrypoint.sh postgres
