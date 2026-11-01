# Testing

- Status: 108 unit/integration tests + 37 Playwright tests passing
- Last verified: 2026-10-26
- Commands: `npm run test`, `npm run test:e2e`, `npm run typecheck`,
  `npm run build`

> Test counts are exact for this commit. If you add or remove a test, update
> this page, [architecture.md](architecture.md) §10, and the final report.

## 1. Test layers

| Layer | Runner | Location | Count |
|---|---|---|---:|
| Domain + catalogue | Vitest | `packages/core/test/core.test.ts` | 22 |
| Electrical calculations | Vitest | `packages/electrical/test/calculations.test.ts` | 19 |
| Routing | Vitest | `packages/electrical/test/routing.test.ts` | 14 |
| Validation, load, take-off | Vitest | `packages/electrical/test/validation.test.ts` | 22 |
| Request schemas | Vitest | `apps/web/test/request-schemas.test.ts` | 19 |
| Workspace helpers | Vitest | `apps/web/test/workspace-helpers.test.ts` | 12 |
| **Unit/integration total** | | | **108** |
| Browser E2E | Playwright | `apps/web/e2e/*.spec.ts` | 37 + 1 setup |

E2E distribution: `a11y` 6, `api` 10, `auth` 4, `design` 2, `mobile` 5,
`technician` 5, `workspace` 5. Total 37; the separate `setup` project
authenticates the engineer and technician once.

## 2. Commands

```bash
# All unit and integration tests across the workspaces
npm run test

# One package
npm run test --workspace @vectrix/core
npm run test --workspace @vectrix/electrical
npm run test --workspace @vectrix/web

# Type checking
npm run typecheck

# Production build
npm run build

# End-to-end (resets and seeds apps/web/prisma/e2e.db, port 3100)
npm run test:e2e

# One E2E project
npm run test:e2e -- --project=desktop
npm run test:e2e -- --project=mobile
npm run test:e2e -- --project=technician
npm run test:e2e -- --project=anonymous

# One spec
npm run test:e2e -- e2e/workspace.spec.ts
```

Playwright starts `next dev` on port **3100** — not the production build. The
E2E database is separate from `dev.db`, so running the suite does not destroy
local demo data.

## 3. What the unit suite covers

### `@vectrix/core` (22)

- Prefixed IDs: generation, round-trip guard, wrong kind, malformed.
- Fixture slug normalisation.
- Geometry: shoelace area in either winding, boundary-point-inside semantics,
  polyline length with duplicate points, orthogonality tolerance, segment
  intersection including collinear overlap, intersection point, grid snapping,
  Douglas–Peucker simplification, Euclidean distance.
- Catalogue: every definition validates, keys are unique, every class I product
  has a PE terminal, socket defaults represent rated maximum not simultaneous
  load, unknown keys fail, Portuguese supply preset, invalid definition
  rejection, MVP circuit types.

### `@vectrix/electrical` calculations (19)

- IEC 60228 20 °C resistance for 2.5 mm² and correction to 70 °C.
- Reference voltage drop: single-phase 16 A / 20 m / 2.5 mm² / PF 1 and
  three-phase 32 A / 30 m / 25 mm² / PF 0.95.
- Linear scaling with length and current; power-factor effect through
  reactance; negative-current rejection.
- Ampacity at 30 °C, ambient derating, grouping derating, combined factors,
  unsupported section returns `null`.
- Cable selection: 2.5 mm² accepted at 4 %, voltage-drop-bound upsize,
  breaker-bound upsize, no solution for extreme length, XLPE refusal,
  assumptions present.

### `@vectrix/electrical` routing (14)

- Orthogonal path in an empty plan; exact anchors; wall avoidance; no path
  through a dividing wall; determinism; grid-size guard; stated assumptions.
- Length/turn summary.
- Geometry diagnostics: clean route, diagonal, undeclared crossing, declared
  penetration, dangling endpoint, outside plan, true polyline length.

### `@vectrix/electrical` validation, load and take-off (22)

- Coherent circuit acceptance; missing board; undersized breaker; insufficient
  ampacity; voltage drop; missing 30 mA RCD; equipment outside room; load
  without circuit; mounting height; duplicate names; earth continuity missing
  and satisfied; wall crossing; dangling endpoint; phase imbalance; circuit-type
  mismatch; stable dedupe keys.
- Load schedule separates connected and demand, computes current, keeps
  unassigned equipment visible.
- Take-off: equipment counts, cable from route + slack + verticals, basis on
  every line, no invented prices, deterministic CSV with assumptions.

### `apps/web` request schemas (19)

- Login trimming and password requirement.
- Project defaults, code format, supply/sheet bounds, non-empty update.
- Equipment catalogue keys, safe defaults, geometry/rotation/load bounds,
  nullable assignments, non-empty update.
- Circuit defaults, standard-breaker rejection at the schema boundary (the
  domain accepts non-standard ratings but the create schema does not),
  cable/colour/demand bounds, nullable RCD, non-empty update.
- Room vertices and envelope defaults; wall defaults; route point count and
  conduit key; status mapping; non-empty update.
- Validation decisions; cable-selection condition defaults.

### `apps/web` workspace helpers (12)

- Point-in-polygon boundary; area winding; bounds/centre; overlapping-room
  selection; 50 mm snapping and clamping; distance/nearest device; orthogonal
  constraint; circuit route-length sum; equipment-to-circuit lookup; finding
  sort order; label/entity fallbacks; nested detail rendering.

## 4. What the E2E suite covers

| Spec | Coverage |
|---|---|
| `workspace.spec.ts` | Populated demo totals, eight-circuit schedule, 14 take-off lines and matching CSV download, baseline info findings survive validation, circuit isolation and clear |
| `design.spec.ts` | End-to-end project → room/wall → device → circuit → route flow; circuit creation from the schedule in an isolated project |
| `auth.spec.ts` | Anonymous redirect, generic bad-password message, httpOnly/SameSite/path cookie, unauthenticated API, bad credentials, cross-origin rejection |
| `api.spec.ts` | Organisation-scoped project list, invalid payload details, duplicate code 409, out-of-organisation 404, unknown level 404, cable selection success/422, acknowledge/reopen with decision record, unknown decision rejection, JSON and CSV take-off consistency |
| `technician.spec.ts` | Read and estimate access, mutation/validation refusal, role identified in UI, read-only affordances, no project creation |
| `mobile.spec.ts` | Compact tab bar, zero page-level horizontal overflow, inspector drawer, model drawer, drawing sheet fits the viewport |
| `a11y.spec.ts` | Page language and single project heading, every visible button has an accessible name, new-project dialog labels and initial focus, table headers and focusable rows, no positive `tabindex`, command palette keyboard open/Escape close |

The suite is deliberately serial (`workers: 1`) because tests share one
database. CI retries twice; local runs do not retry.

## 5. Query and cleanup strategy

- Unit tests are pure and touch no database or network.
- E2E resets `apps/web/prisma/e2e.db` with `prisma db push --force-reset` and
  reseeds before starting the server.
- `design.spec.ts` creates isolated projects so it does not mutate the demo.
- The engineer and technician storage states are written under
  `apps/web/e2e/.auth/`, which is gitignored.
- `page.request` is used where cookies must be shared with the browser;
  `request` is used for anonymous and role-specific API tests.

## 6. Requirement coverage

| Required test type | Status | Evidence / gap |
|---|---|---|
| Unit | **Implemented** | 108 Vitest tests |
| Calculation reference | **Implemented** | Two independent reference inputs with expected values and tolerances |
| Connectivity invariants | **Partial** | Earth-terminal and unknown-circuit invariants are tested; connection authoring does not exist, so full terminal topology is only seeded |
| Routing | **Implemented** | 14 routing and geometry tests |
| API | **Implemented** | 10 API E2E tests + 19 schema tests |
| Migration | **Not implemented** | No `prisma/migrations/`, no migration test; `db push` is used |
| UI | **Partial** | Browser E2E only; no React component tests |
| Playwright E2E | **Implemented** | 37 tests + setup, desktop/mobile/anonymous/technician |
| Import/export round-trip | **Not implemented** | CSV export is tested for content and download; there is no importer to round-trip |
| Accessibility | **Partial** | Structural and keyboard E2E checks; no axe scan, no screen-reader session, no contrast measurement |
| Security | **Partial** | Negative auth/authz and origin tests; no SAST/DAST, fuzzing or penetration test |
| Performance | **Not implemented** | No benchmark or latency budget; see [performance.md](performance.md) |

These gaps are recorded rather than hidden. “Not implemented” means there is no
test, not that the underlying feature is absent.

## 7. Flakiness and determinism

Known sources of order dependence and how they are controlled:

- **Shared database** → one worker, `fullyParallel: false`, reset per run.
- **Async refresh after mutations** → assertions wait for visible state, not
  fixed timeouts.
- **Two `role="alert"` regions** → form errors are located with `.login-error`,
  not the generic role.
- **Animated states** → reduced motion is honoured by CSS; assertions use
  `toBeVisible`/`toHaveText`.
- **Fonts and icons** → bundled locally; no network dependency.
- **Time zone/locale** → pinned to `Europe/Lisbon` and `en-GB` in Playwright.
- **IDs** → request helpers read IDs from API responses rather than hardcoding
  them where possible; fixture IDs are deterministic.

The suite has been run repeatedly at 38/38 entries passing; there is no
historical flake log because the project has no CI yet.

## 8. Missing infrastructure

- No CI workflow, no test reporting service, no coverage threshold and no
  coverage report (Vitest runs without coverage).
- No database migration test, no PostgreSQL test run, no backup/restore test.
- No visual regression screenshots.
- No load or soak test.
- No dependency or container scanning.
- No test for CSV formula injection, cross-tenant access matrix, or concurrent
  mutation races.

## 9. Adding tests

- Pure engineering logic belongs in `packages/electrical/test/`; do not test it
  through the UI.
- Request-schema changes require a case in
  `apps/web/test/request-schemas.test.ts`.
- Any new rule needs a positive and a negative fixture in
  `validation.test.ts`, plus a dedupe-key assertion if it can repeat.
- New user-facing flows need an E2E assertion, and any role-sensitive control
  needs a technician or viewer counterpart.
- Update the counts in this file and in `architecture.md` when the totals
  change.
