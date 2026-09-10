# Local development

Follow these steps in order. The first four steps are needed only once per computer.

## First-time setup

### 1. Install the required software

Install:

- Docker Desktop
- Node.js 22
- .NET SDK 8.0.x
- Git

### 2. Open the project

Open a terminal in the repository root, the folder containing `README.md`.

### 3. Prepare Docker and the databases

On Windows PowerShell:

```powershell
powershell -File infra/bootstrap-local.ps1
```

On macOS/Linux:

```bash
bash infra/bootstrap-local.sh
```

Wait for:

```text
Local bootstrap complete
```

The script starts PostgreSQL, Keycloak, and RabbitMQ, creates local configuration files, generates
local keys, runs migrations, and loads the development seed data.

### 4. Start the application

The bootstrap script installs all Node dependencies and prepares all service databases. Start all
application services with one command.

Windows PowerShell:

```powershell
powershell -File infra/start-all-local.ps1
```

macOS/Linux:

```bash
bash infra/start-all-local.sh
```

On Windows, each service opens in its own window. On macOS/Linux, services run in the background;
logs and process IDs are written to a temporary directory printed by the script.

Open the website:

```text
http://localhost:4200
```

## Sign in

Use the seeded Site Administrator account:

- Username: `tt.site-admin@altexsoft.com`
- Password: `DevPassword1!`

The **Administration** menu should be visible.

## Who has a functional role?

Functional roles are stored in Access Control, not in Keycloak. The development seed assigns:

| Login | Access Control person ID | Functional role |
|---|---|---|
| `tt.site-admin@altexsoft.com` | `cccccccc-0000-0000-0000-000000000001` | HR Admin |
| `viktor.bondar@altexsoft.com` | `cccccccc-0000-0000-0000-000000000005` | Delivery Manager |
| `olena.romaniuk@altexsoft.com` | `cccccccc-0000-0000-0000-000000000006` | Unit Manager |
| `andrii.fedorchuk@altexsoft.com` | `cccccccc-0000-0000-0000-000000000007` | Unit Manager |
| `olena.lysak@altexsoft.com` | `cccccccc-0000-0000-0000-000000000009` | Delivery Manager |
| `diana.savchuk@altexsoft.com` | `cccccccc-0000-0000-0000-00000000000a` | Delivery Manager |
| `dmytro.danylenko@altexsoft.com` | `cccccccc-0000-0000-0000-000000000015` | Project Manager |

The assignments are defined in `infra/seed/02-access-control-service.sql`.

Functional roles control features. Relationship-derived access roles—such as Manager, People
Partner, and Colleague—are calculated from organizational relationships. A person can have no
functional role and still have relationship-derived access.

## Every other day

1. Start Docker Desktop.
2. Start all infrastructure and application services:

   ```powershell
   powershell -File infra/start-all-local.ps1
   ```

   Or on macOS/Linux:

   ```bash
   bash infra/start-all-local.sh
   ```

3. Open `http://localhost:4200`.

If the database was deleted or reset, run the bootstrap script again. The seed scripts are safe to
run more than once.

## After pulling new code

Bootstrap runs database migrations only on first setup (when core tables are still missing). After
you pull changes that add migrations — for example All Employees **saved views** (Story 2.3, stored
in **People Service**, not a separate app) — apply pending migrations yourself:

Windows PowerShell:

```powershell
cd services/people-service
npm run db:deploy
```

macOS/Linux:

```bash
cd services/people-service
npm run db:deploy
```

Repeat `npm run db:deploy` in any other service folder whose `prisma/migrations/` directory changed
(`resourcing-service`, `work-management-service`, and so on). Then restart the affected service
windows if they were already running.

### Saved views return 503 or 500

All Employees saved views are served by **People Service** (port 3002) and proxied through the **BFF**
(port 3001). The frontend calls `POST /api/v1/employees/saved-views` on the BFF only.

If creating a view fails with **503 Service Unavailable** or an **Axios 500** after you enter a name:

1. Confirm People Service is running (one of the windows started by `start-all-local.ps1`).
2. Apply pending People Service migrations (command above). A missing
   `employee_list_saved_views` table causes People Service to error; the BFF may surface that as 503
   on list requests or pass through 500 on create.

You do not need a new service or port for saved views.

## Services started by the all-services script

The script starts the complete local platform:

| Service | Port |
|---|---:|
| People Service | 3002 |
| Access Control Service | 3007 |
| BFF | 3001 |
| Frontend | 4200 |
| Authentication Service | 3008 |
| Resourcing Service | 3003 |
| Work Management Service | 3004 |
| Timetracker integration | 3005 |
| PeopleForce integration | 3006 |

Do not start `services/authentication-service-nestjs`; it is a preserved, non-live scaffold.
