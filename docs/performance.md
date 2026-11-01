# Performance

- Status: observed behaviour, **no formal benchmarks**
- Last verified: 2026-10-26
- Related: [architecture.md](architecture.md), [operations.md](operations.md)

> No load tests, timing budgets or performance regression suite exist. The
> numbers below are based on code inspection and manual observation of the
> seeded demo, not measured in CI.

## 1. Architecture constraints

| Choice | Effect | Status |
|---|---|---|
| Single Node process, Next.js App Router | No horizontal scaling of the app server | By design for MVP |
| SQLite (dev/E2E) | Fast for small projects; no concurrent writes at scale, file locking | Development/E2E only |
| PostgreSQL target | Untested in this environment | Planned, see [ADR-0002](adr/0002-postgres-production-sqlite-dev.md) |
| In-memory rate limiting | Per-process only | Adequate for single instance; see [security.md](security.md) |
| No caching layer | Every page load re-runs session/auth checks and services read from the DB | Acceptable for MVP |
| Pure packages, no network in calculations | Calculation cost is CPU-bound but small | Good |
| One worker for Playwright | Avoids DB contention, slows the suite | Intentional |

## 2. Known costs

| Operation | Notes |
|---|---|
| `GET /workspace` | Loads project, buildings/levels, rooms/walls, equipment, circuits, routes, connections, terminals, validations. Serialises the whole aggregate. Recomputes load schedule and take-off in memory. |
| `POST /validate` | Runs the full rule set over all entities, recomputes load schedule, persists findings with decisions preserved. |
| Auto-route (`routeOrthogonal`) | A* on a grid; bounded by `maxCells` (120000) and grid ≥50 mm. Can be expensive on large, complex plans. Returns early with `GRID_TOO_LARGE`. |
| Cable selection | Iterates all supported sections (up to 16) with a voltage-drop call each; trivial. |
| Take-off CSV | Builds strings in memory; fine for the demo. No streaming. |
| Prisma queries | Uses `include`/`findFirst`/`findMany` with org/project scoping. No `select` is used everywhere; some queries fetch more than strictly needed. |
| SVG plan rendering | All geometry is rendered as SVG in the browser; no canvas yet. Large plans could create many DOM nodes. |

## 3. Budgets (aspirational)

There are no enforced budgets. For a realistic residential plan (like the demo:
11,000 × 8,000 mm, ~70 entities), all operations should feel instant on a
typical developer machine. No measurements were recorded.

## 4. Bottlenecks and mitigations

| Risk | Current mitigation | Still needed |
|---|---|---|
| Large grid routing | `maxCells` guard, `GRID_TOO_FINE` refusal, clearance model | User feedback, grid-size recommendation, route splitting |
| N+1 queries | Some helpers batch by ID; not systematically audited | Query audit, `select` where heavy |
| Workspace payload size | Serialised as JSON in a server component | Pagination not needed yet, but consider if projects grow |
| SVG node count | Acceptable for demo | Virtualisation or canvas if plans become large |
| In-process rate limit / buckets | Memory grows unbounded; not shared | Redis + TTL, size limits |

## 5. What to measure before scaling

1. Time to `GET /workspace` for the demo and a 2× plan.
2. Auto-route time for a blocked and an open plan.
3. Memory for the grid arrays.
4. DB query count and time per request.
5. Build time and bundle size.

## 6. Verification

None of the above is automated. Performance is **unverified**.
