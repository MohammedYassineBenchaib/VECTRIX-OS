# Validation rules

- Status: implemented advisory rule set
- Rule-set version: `VX-PT-RES-1.0.0`
- Last verified against the repository: 2026-10-26
- Code: `packages/electrical/src/validation.ts`
- Methods and provenance: [electrical-methods.md](electrical-methods.md)
- Decision semantics: [ADR-0006](adr/0006-route-lifecycle-and-decisions.md)

> A passing rule set is engineering evidence, not legal compliance and not a
> professional approval. Findings can be acknowledged, risk-accepted or
> resolved; none of those decisions makes the installation compliant.

## 1. How validation runs

`validateElectrical()` is pure. It receives the project, circuits, equipment,
rooms, walls, routes, connections, terminals and optional installation
conditions, and returns a deterministically sorted list of findings.

- Findings are sorted by severity (`error`, `warning`, `info`) and then by
  `dedupeKey`.
- The result is persisted only when the user explicitly runs
  `POST /api/projects/:projectId/validate` (capability `validation:run`). It is
  not a side effect of editing, and there is no client-side rule preview: the
  persisted result is the only rule output.
- The workspace shows the rule-set version and the advisory notice next to the
  register.

`createRuleSet(project)` takes jurisdiction, voltage-drop limits and the
advisory constants below. The jurisdiction string is metadata; no
jurisdiction-specific rule pack exists yet.

## 2. Severity

| Severity | Meaning in this product |
|---|---|
| `error` | A constraint the model itself depends on is violated (for example, a circuit that references a deleted circuit, a breaker smaller than the demand current, or missing cable data). Fix or explicitly accept it before relying on the result. |
| `warning` | A design concern or a missing record. It may be legitimate in context, but it must be reviewed. |
| `info` | Coverage or advisory context; not necessarily a defect. |

Severity is **not** a legal classification. There is no “compliant / non-compliant”
state.

## 3. Advisory limits

| Limit | Value | Source |
|---|---:|---|
| Voltage drop, lighting | 3 % (project field, editable) | Portuguese-practice default |
| Voltage drop, other | 5 % (project field, editable) | Portuguese-practice default |
| Socket RCD sensitivity | ≤ 30 mA | Rule-set constant |
| Maximum sockets per circuit | 10 | Rule-set constant |
| Maximum lighting points per circuit | 20 | Constant; no rule currently enforces the point count |
| Lighting breaker maximum | 16 A | Rule-set constant |
| Socket breaker maximum | 20 A | Rule-set constant |
| Phase imbalance | 30 % | Rule-set constant |
| Design-headroom warning | 80 % of breaker rating | Rule-set constant |
| Route anchor tolerance | 300 mm | Rule-set constant |

Per-circuit `voltageDropLimitPct` overrides the project limit.

## 4. Rule reference

Rules are stable identifiers. `VX-EL-019` is intentionally absent from this
build; identifiers are never reused.

| ID | Title | Severity | Trigger | Dedupe scope |
|---|---|---|---|---|
| `VX-EL-001` | No distribution board | error | At least one circuit exists and no placed equipment has category `distribution_board` | project |
| `VX-EL-002` | Equipment without circuit | warning | An equipment instance has a load greater than 0 VA and `circuitId` is null | equipment |
| `VX-EL-003` | Empty circuit | warning | A circuit has no member equipment | circuit |
| `VX-EL-004` | Breaker undersized | error | Circuit demand current exceeds `breakerRatingA`; **also** a socket circuit uses a breaker above the 20 A advisory maximum (discriminator `socket-breaker`) | circuit |
| `VX-EL-005` | Voltage drop above configured limit | warning | A route length exists and the computed drop exceeds the circuit or project limit | circuit |
| `VX-EL-006` | Cable ampacity below breaker rating | error | Derated capacity of the circuit cable is below `breakerRatingA` | circuit |
| `VX-EL-007` | Socket circuit without 30 mA RCD | warning | The circuit type is `sockets` or it supplies socket equipment, and `rcdSensitivityMa` is null or above 30 mA | circuit |
| `VX-EL-008` | Lighting breaker above advisory maximum | warning | A `lighting` circuit has a breaker above 16 A | circuit |
| `VX-EL-009` | Earth continuity not recorded | info / error / warning | Four cases, below | project or equipment |
| `VX-EL-010` | Equipment outside its room | warning | Equipment has no room, or its position is outside the room polygon | equipment |
| `VX-EL-011` | Mounting height outside product range | warning | Mounting height is outside the catalogue definition's advisory min/max | equipment |
| `VX-EL-012` | Duplicate circuit name | warning | Two or more circuits share a case-insensitive trimmed name; one finding per affected circuit | circuit |
| `VX-EL-013` | Route without circuit | warning | `route.circuitId` is null | route |
| `VX-EL-014` | Route endpoint not connected | warning | An endpoint is more than 300 mm from any equipment | route |
| `VX-EL-015` | Non-orthogonal route segment | warning | A segment changes both x and y | route |
| `VX-EL-016` | Too many outlets on one circuit | warning | A socket circuit has more than 10 socket members | circuit |
| `VX-EL-017` | Unsupported cable data | warning | Cable key is unknown, insulation is not PVC, or the section has no ampacity row | circuit |
| `VX-EL-018` | Phase imbalance | warning | On a three-phase circuit, `(max − min) / average × 100 > 30 %` | circuit |
| `VX-EL-020` | Non-standard breaker rating | info | Breaker rating is not one of 6, 10, 13, 16, 20, 25, 32, 40, 50, 63 A | circuit |
| `VX-EL-021` | Route crosses an undeclared wall | warning | A segment crosses a wall with `allowPenetration = false` | route |
| `VX-EL-022` | Route outside plan bounds | warning | Any route point lies outside the computed plan bounds | route |
| `VX-EL-023` | Low design headroom | info | Design current exceeds 80 % of the breaker rating (only evaluated when ampacity passes) | circuit |
| `VX-EL-024` | Equipment type does not match circuit type | warning | Catalogue `typicalCircuitType` differs from the circuit type, unless either side is `other_power` | equipment |
| `VX-EL-025` | Proposed routes not checked | info | At least one route is `proposed` or `visual` | project |
| `VX-EL-026` | Circuit data integrity | error | Unknown equipment-library key, or equipment references a circuit that no longer exists | project or equipment |

### VX-EL-009 variants

Earth continuity is only judged where topology exists. This avoids producing
dozens of false errors when the designer has not recorded connections yet.

1. **No connections at all** — one project-level `info`: topology cannot be
   verified.
2. **Requires earth, has no earth terminal record** — equipment-level `error`.
3. **Earth terminal exists but is unconnected** — equipment-level `warning`.
4. **Class I equipment with no recorded connections** — one project-level
   `info` with a coverage count.

A connection to any terminal on the equipment is enough to make it “covered”;
the specific PE terminal must be connected to satisfy case 3.

## 5. What a passing run does not prove

- It does not prove compliance with IEC 60364, Portuguese rules, or any other
  standard.
- It does not check fault-loop impedance, disconnection time, thermal
  withstand, selectivity, breaking capacity, neutral/PE sizing, or harmonics.
- It does not verify that the cable is available, that the route is
  constructible, or that the installed product matches the catalogue.
- It does not check the 20-point lighting limit; no implemented rule enforces
  it.
- It does not inspect manufacturer data, because no manufacturer catalogue is
  integrated.

## 6. Decisions and persistence

`ValidationResult` status is one of `open`, `acknowledged`, `accepted_risk`,
`resolved`.

| Action | Capability | Recorded fields |
|---|---|---|
| Run validation | `validation:run` | New/updated findings, rule-set version |
| Acknowledge | `validation:resolve` | `status`, `decidedAt`, `decidedBy` |
| Accept risk | `validation:resolve` | `status`, `decidedAt`, `decidedBy` |
| Resolve | `validation:resolve` | `status`, `decidedAt`, `decidedBy`, `resolvedAt`, `resolvedBy` |
| Reopen | `validation:resolve` | `status = open`; decision fields cleared |

Roles `owner`, `admin` and `engineer` hold `validation:resolve`; `technician`
and `viewer` do not.

Persistence rules:

- Findings are keyed by `dedupeKey = RULE:entityType:entityId[:discriminator]`
  and are unique per project.
- The database id is derived from the key, so identity survives re-runs.
- On re-run, acknowledgements and accepted risks are preserved.
- A finding that disappears is marked `resolved`, **not deleted**.
- A previously resolved finding that reappears is reopened and its decision
  fields are cleared.

**Gaps.** `accepted_risk` does not require or store a written justification.
There is no bulk decision action, no four-eyes approval, no issue lock and no
revision diff. `Revision` exists in the schema but is not written.

## 7. Baseline demo

The seeded demo project (`VX-DEMO-001`) has 39 devices, 8 circuits, 8 routes
and 3 terminal connections. A fresh run produces:

- **0 errors**
- **0 warnings**
- **2 info** — `VX-EL-009` (partial topology coverage) and `VX-EL-025`
  (proposed/visual routes)

This baseline is asserted by Playwright and is re-checked manually after
changes to the seed or rules.
