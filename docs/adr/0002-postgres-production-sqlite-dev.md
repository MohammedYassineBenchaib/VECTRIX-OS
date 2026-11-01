# ADR-0002 — SQLite for development and tests, PostgreSQL for production

- Status: Accepted, with a documented gap
- Date: 2026-10-26

## Context

The target production database is PostgreSQL. The build environment has no
Docker daemon and no reachable PostgreSQL instance. Blocking all work on a
database server would stall the MVP; pretending SQLite is production would hide
real differences.

## Decision

- **Development and E2E:** SQLite via `file:./dev.db` and `file:./e2e.db`.
- **Production target:** PostgreSQL.
- Prisma is the single data-access layer and remains the source of schema truth.
- Schema changes are pushed to SQLite with `prisma db push`; no migration history
  is claimed for production yet.

## Consequences

- The MVP runs and is tested end to end without external infrastructure.
- SQLite and PostgreSQL differ in concurrency, types, case sensitivity, partial
  indexes and `NULL` ordering. None of those differences are exercised by the
  current tests.
- The seed and E2E reset paths use `db push --force-reset`, which is acceptable
  for disposable databases and **never** for production.
- A PostgreSQL migration and integration-test pass is a release gate, not an
  optional task.

## What must happen before production

1. Provision PostgreSQL and set `DATABASE_URL` to a PostgreSQL URL.
2. Replace `db push` with reviewed Prisma migrations (`prisma migrate`).
3. Run the full test suite against PostgreSQL.
4. Add a backup and restore procedure, and a migration rollback plan.
5. Re-check date/time, numeric precision and unique-constraint behaviour.

## Alternatives considered

- **SQLite in production** — rejected: single-writer and operational limits.
- **Embedded PostgreSQL** — not available in the environment.
- **In-memory database for tests** — rejected: does not exercise persistence or
  Prisma relations.
