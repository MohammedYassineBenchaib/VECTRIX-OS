# ADR-0005 — One spatial model, one aggregate read, pure calculation packages

- Status: Accepted
- Date: 2026-10-26

## Context

The product claim is that moving an outlet changes its circuit load, route
length, voltage drop, quantities and open findings. That claim fails if the plan,
the circuit schedule, the calculation sheet and the bill of materials are
separate documents. It also fails if geometry lives in the UI while calculations
live on the server and never meet.

The MVP must be testable without a browser and without a database, because
electrical results need reference tests and property-style invariants.

## Decision

1. **One canonical spatial model.** Rooms, walls, equipment, routes, terminals
   and connections are stored once and read by every view. The plan is not a
   drawing that references a separate circuit file.
2. **One aggregate workspace payload.** `loadWorkspace(projectId, levelId)`
   returns the project, building, selected level, level rooms/walls/equipment/
   routes/connections, all project circuits, all validations, the load schedule,
   the take-off and the advisory notice. The client does not stitch several
   endpoints together for one screen.
3. **One unit.** All plan coordinates and lengths are **millimetres**. Lengths
   presented to users are converted at the edge (`m`, `km`) and never stored in
   display units. Electrical values use volts, amperes, volt-amperes and mm².
4. **JSON columns are validated at the boundary.** `polygonJson`, `pointsJson`,
   `diagnosticsJson`, `detailsJson`, `snapshotJson` and `payloadJson` are
   strings in the database. They are parsed and checked against Zod schemas in
   `packages/core/src/domain.ts` on the way out. A corrupt row fails loudly
   instead of producing a plausible wrong calculation.
5. **Pure packages own engineering logic.**
   - `@vectrix/core`: enums, domain schemas, catalogue, permissions, geometry,
     units, identifiers, formatting.
   - `@vectrix/electrical`: load schedule, ampacity, voltage drop, cable
     selection, routing, validation, take-off.
   Neither package imports React, Prisma, `server-only`, or Next.js.
6. **The database only stores facts and decisions.** Derived values (current,
   voltage drop, quantities) are recomputed from the current model on each
   workspace read. The MVP does not persist calculation snapshots; the method
   version travels with each result so a later snapshot design can reproduce it.
7. **Geometry uses an explicit discriminator.** The geometry endpoint accepts
   `entityType: "wall" | "room"` and switches to the matching Zod schema. There
   is no “generic polygon” write path with ambiguous semantics.

## Consequences

- One edit invalidates every derived view consistently because all of them are
  computed from the same aggregate.
- The workspace endpoint is the hot path and can become large. Performance work
  must target it first; see `docs/performance.md`.
- Recalculation on read keeps the MVP honest but does not scale indefinitely.
  Caching or persisted calculation snapshots become necessary when projects grow
  beyond a few hundred devices.
- Pure packages can be reused by a future CLI, worker, desktop shell or mobile
  client without extracting logic from components.
- The team must resist adding database reads inside components. The boundary is
  enforced by convention and by `server-only` imports in the request layer.

## Alternatives considered

- **Separate drawing, circuit and calculation stores** — rejected: recreates the
  reconciliation problem the product exists to remove.
- **A canvas/DXF document as the source of truth** — rejected for the MVP:
  difficult to validate, diff and query, and it makes circuit topology a
  second-class citizen.
- **Persist every derived value** — rejected for the MVP: stale values are worse
  than recomputation, and invalidation rules would dominate the codebase.
- **Put calculations in the Next.js server layer** — rejected: they would be
  harder to test and impossible to reuse outside the web app.

## Verification

- `npm run test` runs all three workspaces without a database for core and
  electrical packages.
- `packages/core/test/core.test.ts` validates catalogue and geometry contracts.
- `packages/electrical/test/*.test.ts` exercise calculations, routing and
  validation without React or Prisma.
- `apps/web/e2e/workspace.spec.ts` asserts that plan totals, circuit schedule,
  findings and take-off agree on the same demo project.
- `apps/web/e2e/api.spec.ts` asserts JSON and CSV take-off representations come
  from the same model.
