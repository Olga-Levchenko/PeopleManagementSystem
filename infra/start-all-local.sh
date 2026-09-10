#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$REPO_ROOT/infra"
LOG_DIR="${TMPDIR:-/tmp}/people-management-system"
mkdir -p "$LOG_DIR"

docker compose --project-directory "$INFRA_DIR" --env-file "$INFRA_DIR/.env" up -d

start_node_service() {
  local name="$1"
  local directory="$2"
  (
    cd "$REPO_ROOT/$directory"
    exec npm run start:dev
  ) >"$LOG_DIR/$name.log" 2>&1 &
  echo "$!" >"$LOG_DIR/$name.pid"
}

start_dotnet_service() {
  local name="$1"
  local directory="$2"
  shift 2
  (
    cd "$REPO_ROOT/$directory"
    exec dotnet run "$@"
  ) >"$LOG_DIR/$name.log" 2>&1 &
  echo "$!" >"$LOG_DIR/$name.pid"
}

echo "Starting all application services..."

start_dotnet_service authentication-service \
  services/authentication-service \
  --project src/AuthenticationService.Api
start_node_service people-service services/people-service
start_node_service resourcing-service services/resourcing-service
start_node_service work-management-service services/work-management-service
start_node_service integration-timetracker services/integration-timetracker
start_node_service integration-peopleforce services/integration-peopleforce
start_dotnet_service access-control-service \
  services/access-control-service \
  --project src/AccessControlService.Api \
  --launch-profile http
start_node_service bff services/bff
start_node_service frontend services/frontend

echo
echo "All application services were started."
echo "Open http://localhost:4200"
echo "Logs and process IDs: $LOG_DIR"
