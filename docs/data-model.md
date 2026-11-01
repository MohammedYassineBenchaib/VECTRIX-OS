# Data model

- Status: implemented
- Source of truth: `apps/web/prisma/schema.prisma`
- Domain schemas: `packages/core/src/domain.ts`
- Verified: 2026-10-26

## 1. Principles

1. **One organisation owns every project.** Access is always derived from the
   session membership; no request supplies an `orgId`.
2. **Opaque, prefixed identifiers.** IDs look like `prj_...`, `eq_...`,
   `ckt_...`. They are generated with `crypto.randomUUID()` (`newId()`), never
   from array positions. Fixtures use deterministic `fixtureId()` values.
3. **Integer millimetres for geometry.** Plan coordinates and lengths are stored
   as integers or floats in mm. Display conversion happens at the edge.
4. **JSON columns are typed payloads, not escape hatches.** Every JSON string is
   parsed and validated against a Zod schema before use.
5. **Facts vs decisions.** Geometry and assignments are facts; validation status
   and route lifecycle are decisions with actor and timestamp fields.
6. **Soft audit trail.** Findings are marked resolved rather than deleted;
   audit events are append-only.

## 2. Relationship map

```
Organization
 ├─ Membership ── User
 ├─ Project
 │   ├─ Building
 │   │   └─ Level
 │   │       ├─ Room ──────── Equipment (roomId, nullable)
 │   │       ├─ Wall
 │   │       ├─ Equipment ─── Terminal
 │   │       └─ Route ─────── RouteSegment (reserved, unused)
 │   ├─ Circuit ───────────── Equipment (circuitId, nullable)
 │   ├─ Route ─────────────── Circuit (circuitId, nullable)
 │   ├─ Connection ────────── Terminal (from/to)
 │   ├─ ValidationResult
 │   ├─ Revision (reserved, unused)
 │   └─ AuditEvent
 └─ AuditEvent
```

## 3. Tables

### Organization

`id`, `name`, `slug` (unique), `createdAt`.
Root tenant boundary. Cascades to memberships, projects and audits.

### User

`id`, `email` (unique), `name`, `passwordHash`, `createdAt`.
`passwordHash` is `scrypt$<salt>$<hex>`; see
[ADR-0004](adr/0004-session-auth-and-capabilities.md).

### Membership

`id`, `orgId`, `userId`, `role`, `createdAt`.
Unique `(orgId, userId)`. `role` is stored as a string and narrowed to
`MemberRole` by `memberRoleSchema` (`owner`, `admin`, `engineer`, `technician`,
`viewer`). The session uses the user's first membership by `createdAt`; multiple
memberships are not switchable in the UI.

### Session

`id`, `userId`, `tokenHash` (unique), `expiresAt`, `createdAt`.
Only the SHA-256 hash of the cookie token is stored. Cascades on user deletion.

### Project

`id`, `orgId`, `name`, `code`, client/address fields, `country`, `jurisdiction`,
supply fields (`supplyPresetKey`, `phaseVoltageV`, `lineVoltageV`, `frequencyHz`,
`earthingSystem`), voltage-drop limits, `status`, `notes`, timestamps,
`createdBy`.

- Unique `(orgId, code)`.
- Project status: `draft`, `design`, `issued`, `as_built`, `archived`.
- Supply presets are configurable starting points, not claims about the actual
  supply. The demo uses Portugal 230/400 V, 50 Hz, TT.

### Building

`id`, `projectId`, `name`, `address`, `createdAt`.

### Level

`id`, `buildingId`, `name`, `elevationMm`, `planWidthMm`, `planHeightMm`,
`sortOrder`, `underlayUrl`, `underlayOpacity`, `underlayScale`, `notes`.

- Plan size is bounded to 500,000 mm per side by the domain schema.
- `underlayUrl` is reserved; there is no upload or rendering path in the MVP.
- The workspace selects one level at a time via `?level=`; circuits and routes
  are project-scoped, rooms/walls/equipment are level-scoped.

### Room

`id`, `levelId`, `name`, `number`, `polygonJson`, `clearHeightMm`, `occupancy`,
`notes`.

- `polygonJson` is an array of ≥3 finite `{x,y}` points, validated on read.
- `occupancy` drives wet-zone hatching (`bathroom`, `laundry`) and is advisory.
- Area is recomputed with the shoelace formula; the API rejects rooms below
  0.1 m².

### Wall

`id`, `levelId`, start/end coordinates, `thicknessMm`, `heightMm`, `kind`,
`material`, `loadBearing`, `allowPenetration`.

- `kind`: `exterior`, `interior`, `partition`, `shaft`.
- `material`: `masonry`, `concrete`, `drywall`, `other`.
- `allowPenetration` is an explicit design decision. A route crossing a wall
  without it produces `WALL_CROSSING`.
- Wall geometry is a centreline plus thickness. The router treats the wall as a
  solid obstacle with clearance; it never auto-creates a penetration.

### Equipment

`id`, `levelId`, `roomId?`, `definitionKey`, `label`, `xMm`, `yMm`,
`rotationDeg`, `mountingHeightMm`, `circuitId?`, `phase?`, load overrides,
`installationState`, `source`, `notes`, timestamps.

- `definitionKey` must exist in `EQUIPMENT_CATALOG` (18 generic definitions).
- `circuitId` is nullable: unassigned load is surfaced as a finding, not hidden.
- `loadVAOverride` / `powerFactorOverride` override catalogue defaults; the UI
  labels the basis.
- `installationState`: `planned`, `installed`, `verified`, `issue`.
- `source`: `manual`, `import`, `ai` (provenance marker; only `manual` is written
  today).
- Deleting equipment is refused while routes or connections reference it
  (`409 EQUIPMENT_IN_USE`).

### Terminal

`id`, `equipmentId`, `designation`, `function`, `capacity`.

- Unique `(equipmentId, designation)`.
- `function`: `line`, `neutral`, `earth`, `switched_line`, `signal`.
- Terminals are copied from the catalogue definition when equipment is placed.
  Capacity is capped at 8 in the mutation layer.
- Terminal topology is **read-only in the MVP**: the inspector lists terminals and
  recorded connections, but there is no create/delete connection endpoint or UI.

### Circuit

`id`, `projectId`, `boardEquipmentId?`, `name`, `description`, `type`,
`phaseMode`, `breakerRatingA`, `breakerCurve`, `rcdSensitivityMa?`, `rcdRatingA?`,
`cableTypeKey`, `cableSectionMm2`, `demandFactor`, `voltageDropLimitPct?`,
`color`, `notes`, timestamps.

- `type`: `lighting`, `sockets`, `cooker`, `water_heater`, `hvac`, `ev_charging`,
  `other_power`, `data`.
- `phaseMode`: `single_phase`, `three_phase`.
- `breakerCurve`: `B`, `C`, `D`. Standard ratings are 6, 10, 13, 16, 20, 25, 32,
  40, 50, 63 A. Non-standard ratings are accepted by the schema but flagged
  `VX-EL-020`.
- `boardEquipmentId` is optional; if supplied, the target must be a
  `distribution_board`.
- `demandFactor` is an explicit assumption (0 < factor ≤ 1), never inferred.
- Cable type is a generic key (`h07v-u`, `h07v-k`, `h07rn-f-3g`, `u-1000-r2v`).

### Route

`id`, `projectId`, `levelId`, `circuitId?`, `fromEquipmentId?`, `toEquipmentId?`,
`status`, `method`, `conduitKey?`, `cableTypeKey?`, `pointsJson`, `lengthMm`,
`slackPercent`, `diagnosticsJson`, `notes`, `createdAt`, `createdBy`,
`validatedAt?`, `validatedRuleSetVersion?`.

- `status`: `visual`, `proposed`, `validated`, `installed`.
- `method`: `conduit_recessed`, `conduit_surface`, `cable_tray`, `direct_buried`,
  `cable_free_air`, `existing_containment`. The MVP writes `conduit_recessed`;
  the field is not yet editable in the UI.
- `pointsJson` is the authoritative polyline (≥2 points). `RouteSegment` rows
  exist in the schema but are **not written**; do not treat them as populated.
- `lengthMm` is the polyline length at save time.
- `slackPercent` is installation slack, 0–50 %, default 10 %.
- `diagnosticsJson` records the last geometry check.
- Editing geometry demotes `validated`/`installed` to `proposed` and clears
  `validatedAt` / `validatedRuleSetVersion`.

### Connection

`id`, `projectId`, `fromTerminalId`, `toTerminalId`, `kind`, `notes`,
`createdAt`.

- `kind`: `line`, `neutral`, `earth`, `switched_line`, `data`.
- Both terminals must exist. Cascades on terminal/equipment deletion.
- Used by validation (`VX-EL-009`) and shown in the inspector.
- No authoring path in the MVP; the demo fixture seeds three connections.

### ValidationResult

`id`, `projectId`, `dedupeKey`, `levelId?`, `ruleId`, `ruleSetVersion`,
`severity`, `status`, `discipline`, `entityType`, `entityId`, `message`,
`detailsJson`, `createdAt`, `decidedAt?`, `decidedBy?`, `resolvedAt?`,
`resolvedBy?`.

- Unique `(projectId, dedupeKey)`.
- `status`: `open`, `acknowledged`, `accepted_risk`, `resolved`.
- `severity`: `info`, `warning`, `error`.
- `entityType`: `project`, `circuit`, `equipment`, `route`, `room`, `connection`.
- `dedupeKey` is deterministic: `RULE:entityType:entityId[:discriminator]`.
- `id` is derived from the dedupe key (`validationIdForKey`), so the same finding
  keeps its identity across runs.
- Decisions survive re-runs; a disappeared finding is marked resolved; a
  reappearing resolved finding is reopened.

### Revision (reserved)

`id`, `projectId`, `label`, `status`, `snapshotJson`, `note`, timestamps,
`createdBy`. **No row is written by the MVP.** It is reserved for issued
revisions and diffs.

### AuditEvent

`id`, `orgId`, `projectId?`, `actorId`, `action`, `entityType`, `entityId`,
`payloadJson`, `createdAt`.

- Written inside the same transaction as the mutation where one exists.
- Actions include `equipment.create`, `equipment.update`, `equipment.delete`,
  `circuit.create`, `circuit.update`, `room.create`, `wall.create`,
  `route.create`, `route.update`, `route.validate`, `route.status`,
  `validation.status`, `project.create`.
- No UI reads audits yet (`audit:read` exists but has no screen).

## 4. Invariants enforced in code

| Invariant | Where |
|---|---|
| Project code is unique per organisation | DB unique + `409` handling |
| Equipment position lies inside the level plan | `assertInsidePlan` on create/update |
| Equipment room belongs to the same level | mutations |
| Circuit belongs to the same project | `requireCircuit` |
| Route endpoints are on the route level | `CROSS_LEVEL_ROUTE` |
| Route has ≥2 points | Zod |
| Route cannot be saved with blocking diagnostics | `ROUTE_NOT_ACCEPTABLE` |
| Validated route must have a circuit | `ROUTE_WITHOUT_CIRCUIT` |
| Room has ≥3 vertices and ≥0.1 m² | Zod + mutation |
| Wall endpoints are distinct | `ZERO_LENGTH_WALL` |
| Terminal designation is unique per equipment | DB unique |
| Findings are unique per project and dedupe key | DB unique |
| Deleting referenced equipment is refused | `EQUIPMENT_IN_USE` |

## 5. Units and formats

| Quantity | Storage | Display |
|---|---|---|
| Plan coordinates, lengths | mm (Int/Float) | mm or m |
| Area | mm² derived | m² |
| Voltage | V | V |
| Current | A | A (1 decimal in schedules) |
| Apparent power | VA | VA / kVA |
| Conductor section | mm² | mm² |
| Frequency | Hz | Hz |
| Rotations | degrees 0–359 | degrees |
| Money | **not modelled** | — |

Metric is canonical. Imperial display is a planned presentation layer, not a
second storage unit. No unit conversion exists in the UI yet.

## 6. Migration state

- Development and E2E use `prisma db push` against SQLite.
- There is **no `prisma/migrations/` directory** and no migration test.
- Production requires reviewed PostgreSQL migrations. See
  [ADR-0002](adr/0002-postgres-production-sqlite-dev.md) and
  [operations](operations.md).

## 7. Known model gaps

- No connection authoring, so full terminal topology can only come from the seed.
- No revision snapshots or diffing.
- No calculation snapshot table usage; derived values are recomputed.
- No price, supplier, product or manufacturer entities.
- No attachment/document table beyond `Level.underlayUrl`.
- No field task, inspection or asset tables, although ID prefixes are reserved.
- No soft-delete for projects, circuits, rooms or walls; deletes cascade.
