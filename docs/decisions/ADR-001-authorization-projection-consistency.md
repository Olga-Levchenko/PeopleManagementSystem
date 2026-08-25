# ADR-001: Authorization Projection Consistency and Revocation Propagation

- **Status:** Accepted
- **Date:** 2026-08-25

## Context

People/Organization owns the authoritative organizational relationships used to derive access:
reporting lines, project assignments, People Partner relationships, and related organization
data. Authorization must evaluate access per viewer, subject, section, record, and operation,
without directly reading another service's database.

Using synchronous relationship queries for every authorization decision would make authorization
latency and availability depend on People/Organization. Using only an asynchronously replicated
projection creates a security risk when a relationship that grants access ends and the
authorization projection is stale.

Relationship changes and their corresponding events must also be published reliably. A direct
database-write-plus-message-publish sequence could leave the source data and authorization
projection inconsistent if either operation fails.

## Decision

1. People/Organization is the source of truth for organizational relationships.
2. Authorization owns a derived, authorization-focused projection containing only the
   relationship representation required for policy evaluation. It does not become the owner of
   the underlying People/Organization relationships.
3. RabbitMQ is the normal synchronization path from People/Organization to Authorization.
4. Authoritative services publish relationship domain events through a transactional outbox.
   The relationship change and its pending event are committed together.
5. Authorization consumers are idempotent and replay-safe. They use retries and dead-letter
   handling, and can rebuild or repair the projection by replaying supported events.
6. Access-revoking changes, including ended reporting lines and project assignments, receive
   priority handling. Their events must update or invalidate the relevant authorization
   projection promptly. The implementation must define and verify a bounded revocation
   propagation expectation before production use.
7. Synchronous People/Organization lookups are exceptional. They may be used when a caller
   explicitly requires stronger freshness or as a consistency fallback, but they are not
   required for every authorization decision.
8. Until the revocation update is confirmed, the system must fail closed for decisions that
   could rely on stale relationship state. It must not use stale authorization state to grant
   access after a known revocation signal.
9. RabbitMQ, projection, or integration failures must not cause an authorization bypass.
   The system may temporarily deny or degrade an operation, expose an operationally safe error,
   and retry or replay processing. It must never fall back to unrestricted access.

## Consequences

### Positive

- People/Organization retains clear ownership of relationship data.
- Authorization decisions remain isolated in the Authorization bounded context.
- Most authorization requests avoid a synchronous cross-service dependency.
- Transactional outbox publication prevents committed relationship changes from silently losing
  their corresponding events.
- Idempotency, retries, dead-letter handling, and replay support operational recovery.
- Revocation is treated as a security-critical propagation path rather than ordinary eventual
  consistency.

### Negative

- Authorization projection updates are normally asynchronous and require freshness monitoring.
- Each authoritative event producer needs outbox storage and delivery processing.
- Projection repair and replay procedures must be implemented and tested.
- Fail-closed behavior during uncertainty can temporarily deny legitimate access.
- The exact propagation-time bound and alerting thresholds remain implementation decisions to be
  established before production deployment.

## Scope

This decision governs relationship-derived access-role resolution and any authorization policy
that depends on organizational relationships. It does not transfer ownership of People/Organization
data to Authorization and does not define the complete RabbitMQ topology or deployment platform.
