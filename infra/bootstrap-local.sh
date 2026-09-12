#!/usr/bin/env bash
# First-run local setup: Docker infra, service .env files, RSA keys, migrations, and
# the Site Administrator hr-admin seed. Application services still run on the host;
# Compose only starts Postgres, Keycloak, and RabbitMQ.
set -euo pipefail

INFRA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$INFRA_DIR/.." && pwd)"
SET_DOTENV="$INFRA_DIR/scripts/set-dotenv-if-empty.js"
GENERATE_PEM="$INFRA_DIR/scripts/generate-rsa-pem.js"

compose() {
  docker compose --project-directory "$INFRA_DIR" -f "$INFRA_DIR/docker-compose.yml" --env-file "$INFRA_DIR/.env" "$@"
}

copy_example_env() {
  local example="$1"
  local target="$2"
  if [[ ! -f "$target" ]]; then
    cp "$example" "$target"
    echo "Created $target"
  fi
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "$1 is required." >&2
    exit 1
  }
}

need_cmd docker
need_cmd node
need_cmd dotnet

copy_example_env "$INFRA_DIR/.env.example" "$INFRA_DIR/.env"

PEOPLE_DIR="$REPO_ROOT/services/people-service"
ACS_DIR="$REPO_ROOT/services/access-control-service"
BFF_DIR="$REPO_ROOT/services/bff"
FRONTEND_DIR="$REPO_ROOT/services/frontend"
AUTH_DIR="$REPO_ROOT/services/authentication-service"
NODE_SERVICE_DIRS=(
  "$PEOPLE_DIR"
  "$REPO_ROOT/services/resourcing-service"
  "$REPO_ROOT/services/work-management-service"
  "$REPO_ROOT/services/integration-timetracker"
  "$REPO_ROOT/services/integration-peopleforce"
  "$BFF_DIR"
  "$FRONTEND_DIR"
)

copy_example_env "$PEOPLE_DIR/.env.example" "$PEOPLE_DIR/.env"
copy_example_env "$ACS_DIR/.env.example" "$ACS_DIR/.env"
copy_example_env "$BFF_DIR/.env.example" "$BFF_DIR/.env"
copy_example_env "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env"
copy_example_env "$AUTH_DIR/.env.example" "$AUTH_DIR/.env"
for service_dir in "${NODE_SERVICE_DIRS[@]:1:4}"; do
  copy_example_env "$service_dir/.env.example" "$service_dir/.env"
done

BFF_PEM="$BFF_DIR/.local-bff-private-key.pem"
ACS_PEM="$ACS_DIR/.local-access-control-private-key.pem"
PEOPLE_PEM="$PEOPLE_DIR/.local-people-private-key.pem"
WORK_MANAGEMENT_PEM="$REPO_ROOT/services/work-management-service/.local-work-management-private-key.pem"

node "$GENERATE_PEM" "$BFF_PEM"
node "$GENERATE_PEM" "$ACS_PEM"
node "$GENERATE_PEM" "$PEOPLE_PEM"
node "$GENERATE_PEM" "$WORK_MANAGEMENT_PEM"

node "$SET_DOTENV" "$BFF_DIR/.env" KEYCLOAK_CLIENT_PRIVATE_KEY_PATH "$BFF_PEM"
node "$SET_DOTENV" "$BFF_DIR/.env" KEYCLOAK_CLIENT_KEY_ID local-bff-key
node "$SET_DOTENV" "$BFF_DIR/.env" SERVICE_AUTH_PRIVATE_KEY_PATH "$BFF_PEM"
node "$SET_DOTENV" "$BFF_DIR/.env" SERVICE_AUTH_KEY_ID local-bff-key

node "$SET_DOTENV" "$ACS_DIR/.env" SERVICE_AUTH_PRIVATE_KEY_PATH "$ACS_PEM"
node "$SET_DOTENV" "$ACS_DIR/.env" SERVICE_AUTH_KEY_ID local-access-control-key

node "$SET_DOTENV" "$PEOPLE_DIR/.env" SERVICE_AUTH_PRIVATE_KEY_PATH "$PEOPLE_PEM"
node "$SET_DOTENV" "$PEOPLE_DIR/.env" SERVICE_AUTH_KEY_ID local-people-key
node "$SET_DOTENV" "$REPO_ROOT/services/work-management-service/.env" SERVICE_AUTH_PRIVATE_KEY_PATH "$WORK_MANAGEMENT_PEM"
node "$SET_DOTENV" "$REPO_ROOT/services/work-management-service/.env" SERVICE_AUTH_KEY_ID local-work-management-key
node "$SET_DOTENV" "$REPO_ROOT/services/work-management-service/.env" PEOPLE_SERVICE_BASE_URL http://localhost:3002

for library_dir in "$REPO_ROOT/libs/config" "$REPO_ROOT/libs/contracts"; do
  (
    cd "$library_dir"
    if [[ ! -d node_modules ]]; then
      npm install
    fi
    if [[ "$library_dir" == "$REPO_ROOT/libs/contracts" ]]; then
      npm run build
    fi
  )
done

for service_dir in "${NODE_SERVICE_DIRS[@]}"; do
  if [[ ! -d "$service_dir/node_modules" ]]; then
    (cd "$service_dir" && npm install)
  fi
done

echo "Starting Postgres, Keycloak, and RabbitMQ..."
compose up -d

echo "Waiting for Postgres..."
ready=0
for _ in $(seq 1 30); do
  if compose exec -T postgres pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" -ne 1 ]]; then
  echo "Postgres did not become ready. Is Docker running?" >&2
  exit 1
fi

regclass() {
  local database="$1"
  local relation="$2"
  compose exec -T postgres psql -U postgres -d "$database" -tAc "SELECT to_regclass('$relation')" | tr -d '[:space:]'
}

if [[ -z "$(regclass people_service public.person_external_identity_links)" ]]; then
  echo "Applying people-service migrations..."
  (
    cd "$PEOPLE_DIR"
    if [[ ! -d node_modules/prisma ]]; then
      npm install
    fi
    npm run db:deploy
  )
fi

for service_dir in "${NODE_SERVICE_DIRS[@]:1}"; do
  (
    cd "$service_dir"
    if [[ ! -d node_modules ]]; then
      npm install
    fi
    if [[ -d prisma ]]; then
      npm run db:deploy
    fi
  )
done

if [[ -z "$(regclass access_control_service public.person_functional_role_assignments)" ]]; then
  echo "Applying access-control-service migrations..."
  (
    cd "$ACS_DIR"
    dotnet tool restore
    dotnet ef database update --project src/AccessControlService.Infrastructure --startup-project src/AccessControlService.Api
  )
fi

if [[ -z "$(regclass people_service public.person_external_identity_links)" ||
      -z "$(regclass access_control_service public.person_functional_role_assignments)" ]]; then
  echo "Service schemas are still missing after migrate. Fix the migration error above, then re-run this script." >&2
  exit 1
fi

echo "Applying identity and hr-admin seeds..."
compose exec -T postgres psql -U postgres -d people_service -v ON_ERROR_STOP=1 -f /seed/01-people-service.sql
compose exec -T postgres psql -U postgres -d access_control_service -v ON_ERROR_STOP=1 -f /seed/02-access-control-service.sql

cat <<'EOF'

Local bootstrap complete. Site Administrator has hr-admin (Administration).
  Sign in: tt.site-admin@altexsoft.com
  Password: DevPassword1!

Compose runs Postgres, Keycloak, and RabbitMQ. Start all apps on the host with:
  bash infra/start-all-local.sh
Then open http://localhost:4200
EOF
