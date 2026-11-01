# ADR-0006 — Route lifecycle and recorded validation decisions

- Status: Accepted
- Date: 2026-10-26
- Related: ADR-0003

## Context

A line on a plan can mean a sketch, a proposal, a checked design or an installed
fact. Conflating them is dangerous: a technician may drill through a wall
because a line was drawn, or a reviewer may read “validated” as “approved by an
engineer”. The MVP needs distinct states with explicit transitions, and it needs
to keep the history of decisions about findings.

## Decision

### Route states

`visual → proposed → validated → installed`

| Transition | Allowed | Conditions |
|---|---|---|
| visual → proposed | yes | none beyond design capability |
| proposed → visual | yes | none |
| proposed → validated | yes | geometry has no blocking diagnostic **and** the route is assigned to a circuit |
| validated → proposed | yes | clears `validatedAt` and `validatedRuleSetVersion` |
| validated → installed | yes | explicit user action |
| installed → anything | **no** | installed is terminal in this MVP |
| any other pair | no | `409 INVALID_ROUTE_TRANSITION` |

Editing route geometry demotes `validated` and `installed` routes to `proposed`
and clears validation metadata. Geometry changed after validation is not still
validated.

### Blocking diagnostics

A route cannot be saved or promoted to `validated` while any of these are
present:

- `WALL_CROSSING` — crosses a wall not marked `allowPenetration`
- `OUTSIDE_PLAN`
- `DANGLING_ENDPOINT` — endpoint more than 300 mm from any equipment
- `ROUTE_TOO_SHORT`
- `ZERO_LENGTH_SEGMENT`
- `NO_PATH`, `GRID_TOO_LARGE`, `GRID_TOO_FINE` from the auto-router

Declared penetrations (`PENETRATION_DECLARED`), diagonal segments, short
segments, self-intersections and endpoint snapping are **non-blocking**
diagnostics: they are surfaced and can be reviewed, but the engine does not
pretend to know whether the installation method permits them.

Validation is a geometric and rule-set check. It is **not** a professional
approval, a compliance statement, or permission to install.

### Finding decisions

`ValidationResult.status` is one of `open`, `acknowledged`, `accepted_risk`,
`resolved`.

- A decision records `decidedAt` and `decidedBy`.
- `resolved` additionally records `resolvedAt` and `resolvedBy`.
- Reopening a finding (`status: open`) clears those fields.
- Re-running validation preserves acknowledgements and accepted risks.
- A finding that disappears is marked `resolved`, not deleted, so the audit trail
  survives.
- A previously resolved finding that reappears is reopened with cleared decision
  fields.

Findings are keyed by a deterministic `dedupeKey`
(`RULE:entityType:entityId[:discriminator]`). This lets the same finding persist
across re-runs and lets reviewers diff revisions later.

## Consequences

- The UI must show state and decision metadata; it cannot rely on colour alone.
- A route can be geometrically valid and still be a bad design. The copy and the
  lifecycle must keep that distinction visible.
- Installed routes are immutable in the MVP. Rework requires a new route or a
  future explicit “reopen installed” workflow with its own audit semantics.
- Because decisions survive re-runs, a reviewer can see that a risk was accepted
  earlier even when the current model still triggers it.

## Known gaps

- No revision diff view yet; `Revision` rows and `snapshotJson` exist in the
  schema but are not written by the MVP.
- No approval signature, role-separated four-eyes check, or issue lock.
- `accepted_risk` does not require a written justification field; the decision is
  recorded, but the reason is not captured in the MVP.
- Findings cannot be bulk-resolved.

## Alternatives considered

- **Two states (draft/approved)** — rejected: loses the difference between “drawn”
  and “checked” and invites over-claiming.
- **Delete findings when they disappear** — rejected: destroys the audit trail.
- **Auto-promote a valid route to validated** — rejected: hides the moment a
  person takes responsibility.
- **Block every non-orthogonal or self-intersecting route** — rejected: some
  installation methods allow it, and the engine cannot verify the method.

## Verification

- `packages/electrical/test/routing.test.ts` covers wall crossing, penetration,
  dangling endpoints, plan bounds and diagonal segments.
- `packages/electrical/test/validation.test.ts` covers stable dedupe keys and
  rule triggers.
- `apps/web/e2e/api.spec.ts` acknowledges and reopens a finding and asserts the
  recorded decision.
- `apps/web/e2e/workspace.spec.ts` keeps the baseline findings after a re-run.
