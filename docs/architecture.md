# Architecture

- Status: implemented MVP
- Last verified against the repository: 2026-10-26
- Related decisions: [ADR-0001](adr/0001-monorepo-and-stack.md),
  [ADR-0002](adr/0002-postgres-production-sqlite-dev.md),
  [ADR-0005](adr/0005-single-spatial-model.md),
  [ADR-0007](adr/0007-svg-plan-renderer.md)

## 1. Shape of the system

```
Browser
  ├─ Next.js server components  ── session cookie ──┐
  │    /, /login, /projects, /projects/[id]         │
  ├─ Client workspace (React)                        │
  │    plan · circuits · materials · findings        │
  └─ fetch("/api/...")                               │
                                                     ▼
Next.js route handlers (Node runtime)
  ├─ requireProjectAccess / requireApiCapability
  ├─ Zod request schemas
  ├─ services: projects · design · mutations
  ├─ Prisma 6 ──────────────── SQLite (dev/E2E)
  │                            PostgreSQL (production target)
  └─ @vectrix/electrical + @vectrix/core (pure)
```

There is no separate backend service, queue, worker, object store or external
API client in this repository. Everything runs in one Node process and one
database.

## 2. Repository layout

| Path | Responsibility |
|---|---|
| `apps/web/src/app` | App Router pages, login, API route handlers |
| `apps/web/src/components` | Project index, account/theme controls, workspace UI |
| `apps/web/src/components/workspace` | Plan canvas, inspector, busbar, schedules, dialogs, palette |
| `apps/web/src/server` | Session/auth, Prisma client, serializers, services, request schemas |
| `apps/web/src/lib` | Browser API client, formatting, client-side workspace types |
| `apps/web/prisma` | Schema, seed, demo fixture, environment loader |
| `apps/web/e2e` | Playwright specs and storage-state setup |
| `packages/core` | Domain schemas, catalogue, permissions, geometry, units, IDs |
| `packages/electrical` | Load, ampacity, voltage drop, cable selection, routing, validation, take-off |
| `docs` | This documentation set |

Legacy `ecotrack/`, `ecotrack-backup-20261008/` and `roometo/` are unrelated and
gitignored. They are not part of the build.

## 3. Runtime layers

### 3.1 Pages (server components)

- `/` requires a session, lists the user's projects and redirects to
  `VX-DEMO-001` when present, otherwise the first project.
- `/login` renders the sign-in form.
- `/projects` lists projects scoped to the session organisation.
- `/projects/[projectId]` loads the workspace aggregate for the requested level
  (`?level=`), checks that the project is in the user's project list, and passes a
  JSON-serialised payload to the client orchestrator.

`requireSessionUser()` redirects anonymous visitors to `/login`. Server
components never accept an organisation id from the URL or a form.

### 3.2 Client workspace

`workspace-view.tsx` is the orchestrator. It owns:

- the workspace payload and active view (`plan`, `circuits`, `materials`,
  `findings`);
- selection, active circuit, active tool, draft polygons and route points;
- capability-derived flags (`canDesign`, `canValidate`, `canResolve`);
- dialogs, command palette, toasts, mobile drawers;
- refresh after a successful mutation (`GET /workspace?levelId=...`).

Individual views are presentational and receive data plus callbacks. The
inspector is the editing surface for equipment, circuits and routes.

### 3.3 Request layer

Every route handler follows the same sequence:

1. `assertSameOrigin(request)` for state-changing methods.
2. `requireProjectAccess(projectId, capability)` or
   `requireApiCapability(user, capability)`.
3. `readJson(request, schema)` — Zod parse; failures return `422` with field
   issues.
4. A service call (`design.ts` for reads, `mutations.ts` for writes).
5. `json()` (adds `Cache-Control: no-store`) or a typed `ApiError`.
6. `apiRoute()` converts unexpected errors to a generic `500`; server details are
   logged, not returned.

### 3.4 Engineering layer

Pure functions receive domain objects and return results with explicit method
versions and assumptions:

- `computeLoadSchedule()` — connected vs demand load, phase currents;
- `correctedAmpacity()` / `deratingFactors()` — PVC copper reference method C;
- `calculateVoltageDrop()` — ΔU with temperature-corrected resistance;
- `selectCable()` — smallest supported section satisfying `In ≤ Iz` and ΔU;
- `routeOrthogonal()` — deterministic A* on an orthogonal grid;
- `checkRouteGeometry()` — diagnostics used by UI and server;
- `validateElectrical()` — the `VX-EL-*` advisory rule set;
- `computeTakeoff()` / `takeoffToCsv()` — quantities with a basis per line.

No React, Prisma, filesystem, network or `server-only` import is allowed in these
packages.

## 4. API surface

All project routes are scoped by the session organisation. `project:read` is
implicit in `requireProjectAccess`; the capability shown is the additional one
required.

| Method | Path | Capability | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/login` | public, rate-limited | Create session cookie |
| `DELETE` | `/api/auth/login` | session | Clear session cookie |
| `GET` | `/api/auth/session` | session | Current user summary |
| `GET` | `/api/projects` | `project:read` | Project cards for the organisation |
| `POST` | `/api/projects` | `project:write` | Create demo or empty project |
| `PATCH` | `/api/projects/:projectId` | `project:write` | Project metadata and limits |
| `GET` | `/api/projects/:projectId/workspace` | `project:read` | Aggregate workspace payload |
| `POST` | `/api/projects/:projectId/geometry` | `design:write` | Create wall or room |
| `POST` | `/api/projects/:projectId/equipment` | `design:write` | Place catalogue equipment |
| `PATCH` | `/api/projects/:projectId/equipment/:id` | `design:write` | Move/edit equipment |
| `DELETE` | `/api/projects/:projectId/equipment/:id` | `design:write` | Delete when unreferenced |
| `POST` | `/api/projects/:projectId/circuits` | `design:write` | Create circuit |
| `PATCH` | `/api/projects/:projectId/circuits/:id` | `design:write` | Edit circuit |
| `POST` | `/api/projects/:projectId/routes` | `design:write` | Create manual or auto route |
| `PATCH` | `/api/projects/:projectId/routes/:id` | `design:write` | Edit geometry, circuit, slack |
| `POST` | `/api/projects/:projectId/routes/:id/status` | `design:write` | Route lifecycle transition |
| `POST` | `/api/projects/:projectId/validate` | `validation:run` | Re-run rules, persist findings |
| `PATCH` | `/api/projects/:projectId/validations/:id` | `validation:resolve` | Acknowledge / risk / resolve / reopen |
| `POST` | `/api/projects/:projectId/cable-selection` | `estimate:read` | Advisory cable selection |
| `GET` | `/api/projects/:projectId/takeoff` | `estimate:read` | JSON or CSV take-off |

There is no public API, webhook, GraphQL endpoint or file upload endpoint.

## 5. HTTP and error contract

Errors are JSON:

```json
{ "error": { "code": "ROUTE_NOT_ACCEPTABLE", "message": "...", "details": [] } }
```

- `400 INVALID_JSON`
- `401 UNAUTHENTICATED`, `INVALID_CREDENTIALS`
- `403 FORBIDDEN`, `BAD_ORIGIN`, `NO_ORGANISATION`
- `404` for missing or out-of-organisation resources
- `409` for conflicts (`EQUIPMENT_IN_USE`, duplicate code, invalid transition)
- `422` for schema/domain rejection (`VALIDATION_FAILED`, `OUTSIDE_PLAN`,
  `ROUTE_NOT_ACCEPTABLE`, `UNSUPPORTED_INSTALLATION`)
- `429 RATE_LIMITED`
- `500 INTERNAL` with no implementation detail

Every JSON response is `no-store`. The CSV response is also `no-store` and sets
a filename from the project code.

## 6. Data flow for one design change

```
place equipment
  → POST /equipment (Zod, permission, inside-plan check)
  → Prisma transaction: equipment + terminals copied from catalogue + audit event
  → serialized Equipment/Terminal
  → client refresh()
  → GET /workspace
      → scope load (project, circuits, equipment, rooms, walls, routes, connections)
      → load schedule recomputed
      → take-off recomputed
      → advisory findings read from persisted decisions
  → plan, busbar, schedule, inspector and stats all update from one payload
```

Validation is an explicit action (`POST /validate`), not a side effect of every
edit. This avoids writing findings on every mouse move while keeping the
workspace’s open-finding counts accurate between runs.

## 7. Deployment shape

- **Build:** `npm run build` (Next.js production build) from the repo root.
- **Start:** `npm run start` (single Node process).
- **Database:** `DATABASE_URL`; SQLite in dev/E2E, PostgreSQL as the production
  target. The Prisma schema uses portable scalar types, but no PostgreSQL run has
  been performed. See [ADR-0002](adr/0002-postgres-production-sqlite-dev.md).
- **Assets:** fonts are bundled from `@fontsource-variable`; no CDN, no external
  script.
- **Secrets:** only `DATABASE_URL` is required at runtime. There is no API key,
  no mail provider and no object-store credential.
- **Scale:** a single instance only. In-memory rate limiting and SQLite are
  explicitly not horizontally scalable. See [security](security.md) and
  [operations](operations.md).

## 8. What is deliberately not here

- No real-time collaboration, presence or WebSocket.
- No background job, scheduled recalculation or export worker.
- No 3D, AR, DWG/IFC/PDF import, or raster underlay upload. `Level.underlayUrl`
  exists in the schema but has no upload path or UI.
- No manufacturer catalogue, price book or supplier integration.
- No AI service. The `source: "ai"` equipment value exists as a future
  provenance marker; no AI call is made.
- No external API integration. See [APIs](apis/) and `AGENTS.md`.

## 9. Extension points already present

- `Calculation` and `Revision` models exist in the Prisma schema but are not used
  by the MVP; they are reserved for reproducible calculation snapshots and
  revision diffs.
- `AuditEvent` records every mutation and validation decision.
- `Level` already supports multiple buildings/levels, and the workspace switches
  levels through `?level=` and the model panel.
- `Discipline` and `equipmentCategory` enums reserve telecom, solar, HVAC and
  plumbing without pretending they are implemented.
- `@vectrix/core` and `@vectrix/electrical` can be consumed by a future CLI or
  worker without extracting logic from React.

## 10. Verification

- `npm run typecheck` — all workspaces.
- `npm run test` — 22 core + 55 electrical + 31 web unit tests.
- `npm run test:e2e` — 38 Playwright tests (1 setup, 23 desktop, 5 mobile,
  4 anonymous, 5 technician).
- `npm run build` — production build with `@vectrix/*` transpiled and Prisma
  externalised.
