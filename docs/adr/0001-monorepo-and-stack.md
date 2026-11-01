# ADR-0001 — Monorepo, TypeScript and the application stack

- Status: Accepted
- Date: 2026-10-26
- Deciders: product and engineering (solo build)

## Context

The first release must deliver a working electrical design workspace, not a
diagram. It needs a browser UI, server-side persistence, a domain model that can
be unit-tested without a browser, and calculations that are independent of the
UI. The repository already contains unrelated legacy projects (`ecotrack/`,
`ecotrack-backup-20261008/`, `roometo/`) that must not be disturbed.

There is no Docker daemon or PostgreSQL server available in the build
environment, so the development and test runtime has to work without them.

## Decision

Use npm workspaces at the repository root:

- `apps/web` — Next.js application, server routes, Prisma schema, UI.
- `packages/core` — pure TypeScript domain types, catalogue, permissions,
  geometry and helpers.
- `packages/electrical` — pure TypeScript electrical calculations.

Stack: TypeScript 5.9, Next.js 16 (App Router), React 19, Tailwind 4, Prisma 6,
Zod 4, Vitest 5, Playwright 1.64.

Legacy directories remain untouched and gitignored. Pure packages have no React,
no database and no `server-only` imports, so they can be tested quickly and
reused by a future worker or CLI.

## Consequences

- Domain logic is testable without a running app or database.
- The UI and server share types through workspace payloads.
- Two build boundaries must be kept honest: no `server-only` in pure packages,
  and no database imports in components.
- npm workspaces produce a single lockfile; install is simple and CI-friendly.
- A future desktop or mobile client can reuse the core and electrical packages.

## Alternatives considered

- **Single Next.js app** — simpler at first, but domain logic would drift into
  components and become hard to test.
- **Separate backend service** — more operational surface than an MVP needs.
- **Python calculation service** — rejected: no Python runtime requirement, and
  the team is TypeScript-first.

## Verification

`npm run typecheck` and `npm run test` at the root exercise all three workspaces.
The production build is run from `apps/web`.
