---
name: People Management Platform
type: architecture-spine
purpose: build-substrate
altitude: initiative
paradigm: service-oriented bounded contexts with hexagonal service internals
scope: platform boundaries, ownership, integration, authorization consistency, and delivery conventions
status: final
created: 2026-08-25
updated: 2026-08-25
binds: [FR-1..FR-45, NFR-access-control, NFR-performance, NFR-availability, NFR-accessibility]
sources:
  - docs/requirements/project-requirements.md
  - docs/access-control/section-matrix.md
  - _bmad-output/planning-artifacts/prds/prd-PeopleManagementSystem-2026-08-25/prd.md
  - docs/decisions/ADR-001-authorization-projection-consistency.md
  - user-provided architecture-options-presentation.md
companions: []
---

# Architecture Spine — People Management Platform

## Design Paradigm

The platform uses service-oriented bounded contexts in one monorepo. Each service keeps domain
logic behind explicit application and API/adapter boundaries; services communicate through
versioned REST/JSON APIs or RabbitMQ events, never through another service's persistence layer.

The initial boundaries are deliberately thin and pragmatic. Independent deployment is supported,
but local development and the first delivery scope use one shared Docker Compose platform.

## Invariants & Rules

### AD-1 — Bounded contexts own their domains

- **Binds:** all domain capabilities
- **Prevents:** duplicated ownership, cross-service table coupling, and incompatible domain models
- **Rule:** People/Organization owns profiles, employment history, organization structure,
  reporting lines, departments, projects, assignments, People Partner relationships,
  cross-system identity links, custom-field definitions/values, system dictionaries, and
  authoritative organizational relationships. It also owns the career-timeline record store and
  manual timeline overrides; domain services publish events that cause timeline entries where
  appropriate. Work Management owns risks, action items, CDS, mentorship, campaigns, and
  feedback. Resourcing owns requests, candidates, proposals, approvals, request history, and
  resourcing-specific workflow state. Integration services own adapters and genuinely
  integration-owned normalized records only.

### AD-2 — Authorization is a separate policy boundary

- **Binds:** FR-1..FR-7, FR-20, FR-25..FR-30, FR-39, NFR-access-control
- **Prevents:** functional roles being mistaken for data access and client-side or distributed
  permission decisions
- **Rule:** Authorization owns access-role resolution, functional permissions, and section,
  record, and operation policy decisions. Functional permissions are stored runtime data.
  Access roles are derived per viewer/subject/request from relationship inputs. No other service
  may replace this with a hardcoded role-name check.

### AD-3 — Authorization uses a derived relationship projection

- **Binds:** FR-1, FR-2, FR-4..FR-7, FR-20, FR-25..FR-30, FR-39, ADR-001
- **Prevents:** synchronous People calls on every request and stale access surviving silently
  after a relationship revocation
- **Rule:** People/Organization is authoritative for relationships. Authorization owns only the
  derived projection needed for policy evaluation. RabbitMQ is the normal synchronization path.
  Relationship changes are published through transactional outboxes; events carry an event id,
  source aggregate/version, occurred-at timestamp, schema version, and whether the change grants
  or revokes access. Revocations receive priority propagation and fail-closed handling while
  freshness is uncertain. Authorization records applied source versions and projection
  freshness/watermarks, rejects stale or out-of-order updates, and supports replay. A
  synchronous People lookup is an exceptional freshness check or fallback, not the default
  request path.

### AD-4 — Persistence ownership is isolated

- **Binds:** all service data
- **Prevents:** hidden coupling through shared PostgreSQL tables and untraceable mutations
- **Rule:** PostgreSQL is the primary store. Each bounded context owns its database or schema.
  Services may initially share one physical PostgreSQL instance, but may not directly read or
  write another service's tables. Cross-service access uses explicit APIs, contracts, or events.
  Each service owns and runs its own migrations.

### AD-5 — The BFF is the browser boundary, not a domain owner

- **Binds:** frontend integration and profile/list/dashboard responses
- **Prevents:** domain rules leaking into the frontend or the BFF becoming a second policy engine
- **Rule:** React communicates through the BFF/API gateway. The BFF validates Keycloak-issued
  authentication, adds correlation context, calls and composes domain APIs, and returns
  consistent errors. It must not own authorization policy or bypass the Authorization Service.
  Restricted sections and fields are omitted server-side before reaching React.

### AD-6 — Cross-service messages are durable and replay-safe

- **Binds:** integrations, background workflows, relationship propagation, and domain events
- **Prevents:** lost events, duplicate side effects, poison-message loops, and incompatible
  consumers
- **Rule:** RabbitMQ carries versioned message contracts. Consumers have independent queues,
  process messages idempotently, retry failures, dead-letter unprocessable messages, and support
  safe replay. Authoritative producers use transactional outboxes for published domain events.

### AD-7 — Delivery quality gates protect the access model

- **Binds:** NFR-access-control, NFR-performance, NFR-availability, NFR-accessibility
- **Prevents:** shipping an apparently working feature with unverified authorization or broken
  integration behavior
- **Rule:** CI runs builds, unit tests, service integration tests, API contract tests, migration
  validation, and focused end-to-end tests. A machine-readable authorization coverage manifest
  must cover every section-matrix audience/relationship-path combination, every `—` cell,
  operation-level R/RW case, S7 flag-gating, colleague whitelist, shared-link restriction, and
  custom-field visibility case; CI fails for uncovered cells. Revocation tests cover reporting
  line and project-assignment endings, outbox atomicity, duplicate/reordered events, replay,
  stale-projection denial, and removal within the approved propagation bound. Integration tests
  cover timeouts, 5xx responses, malformed payloads, stale-but-labeled data, and per-candidate
  PeopleForce fallback. Contract checks enforce OpenAPI/message schema compatibility. Migration
  checks cover clean apply and upgrade paths, and the performance gate is p95 <= 2 seconds for
  500+ employees with permission resolution. Integration failures degrade safely and never grant
  unauthorized access.

### AD-8 — Shared profile views are authorization-owned grants

- **Binds:** FR-29..FR-30, profile sharing, resourcing candidate review
- **Prevents:** a share link becoming an alternate permission system or granting unintended write
  and sensitive-section access
- **Rule:** Authorization owns share grants and their policy state; the BFF exposes the flow and
  domain services request decisions. A grant identifies its subject, recipient, allowed-section
  allowlist, creator, expiry, revocation state, and access log. S2, S5, S6, and S8 are excluded
  by default; S3, S7, and S13 are never shareable. Every access is logged, expiry and revocation
  are enforced server-side, and a shared grant is read-only regardless of its sections.

### AD-9 — Cross-service contracts evolve compatibly

- **Binds:** APIs, RabbitMQ messages, independent deployment
- **Prevents:** independently deployable services disagreeing on required fields, event ordering,
  tombstones, or replay behavior
- **Rule:** Shared contracts are versioned and owned in `libs/contracts` (or an explicitly
  designated contract package). OpenAPI and message schemas use backward-compatible additive
  evolution within a version; breaking changes require a new version and a migration plan.
  Producers and consumers verify compatibility in CI, and event consumers tolerate duplicate,
  delayed, and replayed messages.

### AD-10 — Visibility is enforced before query and composition

- **Binds:** FR-4, FR-7..FR-12, NFR-access-control, exports, search, notifications, list columns
- **Prevents:** hidden-field inference through filters, sorting, exports, search, composed payloads,
  or client-side omission
- **Rule:** Every surface that can return or use profile data obtains an Authorization decision
  before querying/composing that section or field. Custom-field visibility is enforced for values,
  filters, sorting, list columns, exports, and search. Colleague responses are constructed from
  the exact S1/S10/S11 whitelist. A denied section or field is absent from the response and from
  error or notification content.

### Dependency direction

```mermaid
flowchart LR
    React[React frontend] --> BFF[BFF / API gateway]
    BFF --> Identity[Auth service]
    Identity --> Keycloak[Keycloak]
    BFF --> Auth[Authorization service]
    BFF --> People[People / Organization service]
    BFF --> Work[Work Management service]
    BFF --> Resourcing[Resourcing service]
    Timetracker[Timetracker adapter] --> People
    People --> Broker[RabbitMQ]
    Work --> Broker
    Resourcing --> Broker
    Broker --> Auth
    Auth -. exceptional freshness lookup .-> People
    People --> PeopleDB[(People-owned PostgreSQL)]
    Auth --> AuthDB[(Authorization-owned PostgreSQL)]
    Work --> WorkDB[(Work-owned PostgreSQL)]
    Resourcing --> ResourcingDB[(Resourcing-owned PostgreSQL)]
    Broker --> Redis[(Redis cache, where justified)]
```

## Consistency Conventions

| Concern | Convention |
| --- | --- |
| Naming | Domain-oriented service and event names; explicit API and message versions; stable identifiers across contracts; no role-name constants as policy checks |
| Data & formats | REST/JSON APIs described by OpenAPI; versioned contracts; ISO 8601 timestamps; consistent structured error envelope; service-owned PostgreSQL migrations; pseudonymized non-production data |
| State & cross-cutting | Auth service validates Keycloak-issued identity at the edge; server-side section authorization; transactional outbox; idempotent consumers; retries and dead letters; correlation IDs in structured logs; fail closed on authorization uncertainty |
| Caching | Redis only where a measured need justifies it; never the system of record; authorization caches must not preserve revoked access beyond the approved propagation bound |
| Testing | Unit, service integration, API contract, migration, and focused end-to-end tests; authorization matrix tests assert API-level inclusion and exclusion |

## Stack

| Name | Version |
| --- | --- |
| React | Approved frontend; version must be verified and centrally pinned before implementation |
| Node.js / TypeScript | Approved core business-service runtime; versions must be verified and centrally pinned before implementation |
| .NET | Approved Authorization Service runtime; version must be verified and centrally pinned before implementation |
| Keycloak | Approved identity provider; deployment version must be verified and pinned before implementation |
| PostgreSQL | Approved primary data store; deployment version must be verified and pinned before implementation |
| RabbitMQ | Approved message broker; deployment version must be verified and pinned before implementation |
| Redis | Approved cache where justified; deployment version must be verified and pinned before implementation |
| Docker Compose | Approved initial local orchestration; image versions must be verified and pinned in infrastructure configuration |

## Structural Seed

```text
repository-root/
  docs/
    decisions/                 # ADRs for cross-boundary decisions
    access-control/            # living section matrix and coverage
    integrations/              # external API research and decisions
  infra/
    docker-compose.yml         # local platform and shared infrastructure
  libs/
    contracts/                 # versioned cross-service API/message contracts
    config/                    # shared Node service tooling configuration
  services/
    frontend/                  # React application
    bff/                       # browser-facing composition boundary
    auth-service/               # Keycloak integration and identity plumbing
    authorization-service/      # .NET policy and derived relationship projection
    people-service/             # People/Organization authoritative domain
    work-management-service/    # risks, tasks, CDS, mentorship, campaigns, feedback
    resourcing-service/         # requests, candidates, proposals, approvals, history
    integration-timetracker/    # Timetracker adapter
    integration-peopleforce/    # PeopleForce adapter
```

```mermaid
flowchart TB
    subgraph Platform[Local Docker Compose platform]
        Frontend[React]
        Gateway[BFF]
        Domain[People / Authorization / Work / Resourcing]
        Adapters[Integration workers]
        Infra[RabbitMQ + PostgreSQL + Redis]
        Frontend --> Gateway
        Gateway --> Domain
        Domain --> Infra
        Adapters --> Infra
    end
    Timetracker[Internal Timetracker] <--> Adapters
    PeopleForce[PeopleForce] <--> Adapters
    Keycloak[Keycloak] --> Gateway
```

The initial operational baseline is Docker Compose with health/readiness checks, per-service
migrations, structured correlation-aware logs, basic tracing where practical, and separate
development/test profiles as implementation needs them.

## Capability → Architecture Map

| Capability / Area | Lives in | Governed by |
| --- | --- | --- |
| FR-1..FR-7 role resolution and section authorization | Authorization service, with People relationship events | AD-2, AD-3, AD-6 |
| FR-8..FR-15 profiles, list, self-service, custom fields | People/Organization service and BFF | AD-1, AD-4, AD-5 |
| FR-16..FR-19 dashboards | Work Management/Resourcing APIs composed by BFF | AD-1, AD-5 |
| FR-20..FR-24 tasks and risks | Work Management service | AD-1, AD-2, AD-4 |
| FR-25..FR-30 resourcing and profile sharing | Resourcing service plus Authorization decisions | AD-1, AD-2, AD-5 |
| FR-31 timeline and FR-32 manual timeline overrides | People/Organization service; events from People and Work Management | AD-1, AD-4, AD-6 |
| FR-33..FR-38 CDS and mentorship | Work Management service, with timeline events consumed by People/Organization | AD-1, AD-4, AD-6 |
| FR-39..FR-42 campaigns and feedback | Work Management service | AD-1, AD-2, AD-5 |
| FR-43..FR-45 Timetracker and PeopleForce | Integration workers through explicit service APIs/events | AD-1, AD-6, AD-7 |
| NFR and definition of done | All services, infra, and CI | AD-3, AD-6, AD-7 |

## Deferred

- Exact framework/library versions and integration-worker runtime; pin them in implementation
  baselines only after verifying current compatibility and recording the central compatibility
  baseline.
- Exact RabbitMQ exchange, routing-key, queue, retry, and dead-letter topology.
- Exact revocation propagation time target, freshness telemetry, alert thresholds, and the
  operational procedure for projection rebuild/replay.
- The detailed identity-link reconciliation workflow and external-identity conflict handling;
  People/Organization owns the links, while integration workers remain adapters.
- Deployment provider, production topology, secret-management implementation, and full
  observability platform; the initial scope owns local Compose and proportional CI only.
- Whether any bounded context should split into additional deployable services after usage and
  team ownership justify it.
- Detailed API resource shapes, event schemas, database attributes, and frontend component tree;
  these belong to contracts and implementation, subject to the invariants above.
