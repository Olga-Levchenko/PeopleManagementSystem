#!/bin/sh
# Runs once, on first container init (empty data dir only). Each bounded context
# owns its own database on this shared Postgres instance (ADR AD-4) — add a name
# here when a new service gains a schema of its own.
set -e

for db in \
  people_service \
  resourcing_service \
  work_management_service \
  integration_timetracker \
  integration_peopleforce
do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    SELECT 'CREATE DATABASE $db'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
EOSQL
done
