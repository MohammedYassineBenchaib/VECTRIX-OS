# Electrical methods

- Status: implemented, advisory, **not standards-verified**
- Last verified against the repository: 2026-10-26
- Code: `packages/electrical/src/{ampacity,loads,voltage-drop,cable-selection,routing,takeoff}.ts`
- Related decisions: [ADR-0003](adr/0003-advisory-calculations.md),
  [ADR-0006](adr/0006-route-lifecycle-and-decisions.md)
- Rules: [validation-rules.md](validation-rules.md)

> **Safety boundary.** Every number in this document is advisory engineering
> output from an unverified rule pack. It is not a compliance statement, a
> professional approval, or permission to install. A qualified person must
> review the design against the licensed standards and the actual installation
> conditions. The software has never been checked against a licensed copy of
> IEC 60364-5-52.

## 1. Supported calculation envelope

| Dimension | Supported in this build | Behaviour outside the envelope |
|---|---|---|
| Conductor material | Copper | Not modelled |
| Insulation | PVC only | `UnsupportedInstallationError` in cable selection; `VX-EL-017` warning from validation for XLPE |
| Installation method | Reference method C (single-core cable in conduit on a wall) | No table exists; unsupported |
| Loaded conductors | 2 (single-phase) or 3 (three-phase) | Only these two modes exist |
| Cross-section | 1.5–300 mm², standard series | `null` / `UnsupportedConductorError`; no interpolation |
| Ambient temperature | 25–60 °C correction table | Above 60 °C ⇒ zero factors |
| Supply | Any phase/line voltage stored on the project; defaults 230/400 V, 50 Hz | No frequency-dependent impedance model |
| Fault level | Not modelled | Fault-loop impedance, disconnection time and thermal withstand are not checked |

There is no automatic fallback. An unsupported combination produces an error or
a visible warning, never a plausible-looking substitute.

## 2. Data provenance

| Data | Source as recorded in code | Verification status |
|---|---|---|
| DC resistance at 20 °C | IEC 60228 class 1/2 plain copper values, widely published | Reference values; not copied from a licensed standard |
| Ampacity, PVC, Ref C | Indicative table authored for this build | **Unverified** against IEC 60364-5-52 |
| Ambient correction | Indicative PVC factors | **Unverified** |
| Grouping correction | Indicative factors for 1–6 circuits | **Unverified** |
| Thermal-insulation factor | User input clamped to 0.5–1.0 | An assumption, not a table lookup |
| Conductor temperature coefficient | 0.00393 K⁻¹ for copper | Standard reference value |
| Operating temperature | PVC 70 °C, XLPE 90 °C | Standard reference values |
| Cable reactance | 0.08 Ω/km, generic | Conservative placeholder, not cable-specific |
| Voltage-drop limits | Project fields; defaults 3 % lighting / 5 % other | Configurable Portuguese-practice defaults, not a legal determination |
| RCD, socket-count, breaker ceilings | Rule-set constants | Advisory defaults |

The UI and validation results carry the rule-set version
`VX-PT-RES-1.0.0`; each calculation result also carries its own method version.

## 3. Ampacity

### 3.1 Base table

`PVC_COPPER_REF_C` stores, per section, the 20 °C resistance and the
current-carrying capacity for 2 and 3 loaded conductors at 30 °C ambient, one
circuit, reference method C.

| Section (mm²) | R₂₀ (Ω/km) | 2 loaded (A) | 3 loaded (A) |
|---:|---:|---:|---:|
| 1.5 | 12.1 | 19.5 | 17.5 |
| 2.5 | 7.41 | 27 | 24 |
| 4 | 4.61 | 36 | 32 |
| 6 | 3.08 | 46 | 41 |
| 10 | 1.83 | 63 | 57 |
| 16 | 1.15 | 85 | 76 |
| 25 | 0.727 | 112 | 96 |
| 35 | 0.524 | 138 | 119 |
| 50 | 0.387 | 168 | 144 |
| 70 | 0.268 | 213 | 184 |
| 95 | 0.193 | 258 | 223 |
| 120 | 0.153 | 299 | 259 |
| 150 | 0.124 | 344 | 299 |
| 185 | 0.0991 | 392 | 341 |
| 240 | 0.0754 | 461 | 403 |
| 300 | 0.0601 | 530 | 464 |

### 3.2 Correction factors

```
Iz = It × k_ambient × k_grouping × k_insulation
```

**Ambient (PVC).** The first row whose `maxTempC` is ≥ the requested
temperature is used; a value above 60 °C returns zero factors.

| Up to (°C) | 25 | 30 | 35 | 40 | 45 | 50 | 55 | 60 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Factor | 1.03 | 1.00 | 0.94 | 0.87 | 0.79 | 0.71 | 0.61 | 0.50 |

**Grouping.** The first row whose circuit count is ≥ the requested count is
used.

| Circuits | 1 | 2 | 3 | 4 | 5 | 6+ |
|---|---:|---:|---:|---:|---:|---:|
| Factor | 1.00 | 0.80 | 0.70 | 0.60 | 0.55 | 0.50 |

**Thermal insulation.** Supplied factor, clamped to `[0.5, 1.0]`. The default
is 1.0 (no additional insulation).

### 3.3 Worked example

2.5 mm², two loaded conductors, 40 °C ambient, two grouped circuits, no extra
insulation:

```
It   = 27 A
k_amb = 0.87
k_grp = 0.80
k_ins = 1.00
Iz   = 27 × 0.87 × 0.80 × 1.00 = 18.79 A
```

The implementation returns `correctedAmpacity(2.5, 2, …) = 18.79 A` for these
conditions; the unit test asserts the 23.49 A ambient-only case and the 21.6 A
grouping-only case separately.

## 4. Load schedule

`computeLoadSchedule()` keeps connected load and demand load separate.

### 4.1 Per-equipment load

1. Use `loadVAOverride` when present; otherwise use the catalogue
   `defaultLoadVA`.
2. Use `powerFactorOverride` when present; otherwise the catalogue power factor.
3. If neither an override nor a catalogue load exists, the connected load is
   0 VA and the basis is `none`; the equipment is not silently estimated.
4. Basis is reported per equipment as `catalogue`, `override` or `none`.

### 4.2 Per-circuit load

```
connectedVA = Σ equipment connectedVA
demandVA    = connectedVA × circuit.demandFactor
```

`demandFactor` is an explicit circuit field in `(0, 1]`. The default is 1.0;
it is never inferred from circuit type.

**Single-phase current**

```
I = demandVA / U_phase
```

The current is assigned to the phase of the first member that declares one,
otherwise L1. All single-phase members are treated as being on that same phase
for the circuit total; the per-device phase is not used to split a single-phase
circuit.

**Three-phase current**

```
I = demandVA / (√3 × U_line)
```

Phase currents are accumulated per member that declares a phase. Any unassigned
load is split equally across L1/L2/L3. This is an explicit balanced-load
assumption; the phase-imbalance rule reports the consequence.

**Weighted power factor**

```
PF_weighted = Σ(connectedVA × PF) / Σ connectedVA    (clamped to 0.01–1)
```

Zero-load circuits report PF 1.

### 4.3 Board totals

`totalConnectedVA` and `totalDemandVA` are sums of circuit values. There is no
diversity between circuits beyond each circuit's own demand factor. Unassigned
equipment with non-zero load remains visible in `unassignedEquipment` and is
reported by `VX-EL-002`.

## 5. Voltage drop

### 5.1 Method

```
R_T = R₂₀ × (1 + α × (T − 20))          α = 0.00393 K⁻¹
ΔU  = k × I × L × (R_T × cosφ + X × sinφ)
```

- `k = 2` for single-phase (out and back), `k = √3` for balanced three-phase.
- `T = 70 °C` for PVC, `90 °C` for XLPE.
- `L` is in km; the stored route length is in mm and is divided by 1,000,000.
- `X = 0.08 Ω/km`, generic and conservative, included so the method also
  produces a non-zero reactance term for larger feeders.
- The percentage uses the phase voltage for single-phase and the line voltage
  for three-phase:
  `% = ΔU / U_reference × 100`.

### 5.2 Worked examples

Both values below are produced by the current code and asserted, with
tolerance, in `packages/electrical/test/calculations.test.ts`.

**Single-phase, 16 A, 20 m, 2.5 mm², PF 1, 230 V**

```
R₇₀ = 7.41 × (1 + 0.00393 × 50) = 8.8661 Ω/km
ΔU  = 2 × 16 × 0.020 × (8.8661 × 1 + 0.08 × 0) = 5.674 V
%   = 5.674 / 230 × 100 = 2.467 %
```

**Balanced three-phase, 32 A, 30 m, 25 mm², PF 0.95, 400 V**

```
R₇₀ = 0.727 × 1.1965 = 0.8699 Ω/km
sinφ = √(1 − 0.95²) = 0.3122
ΔU  = √3 × 32 × 0.030 × (0.8699 × 0.95 + 0.08 × 0.3122)
    = 1.416 V
%   = 1.416 / 400 × 100 = 0.354 %
```

### 5.3 What the result does and does not include

Included: the selected circuit conductor, at the circuit design current and
weighted power factor, over the **longest route assigned to that circuit**.

Not included:

- supply transformer, service cable or upstream distribution losses;
- separate spurs shorter than the longest route (the full circuit current is
  applied to the longest route, which is conservative only when that route
  carries the whole load);
- neutral or protective-conductor voltage drop;
- harmonics, skin effect or temperature-dependent reactance;
- fault-loop impedance and disconnection time.

## 6. Cable selection

`selectCable()` is an advisory helper exposed as `POST /cable-selection`
(capability `estimate:read`).

Algorithm:

1. Reject insulation other than PVC and conditions outside the supported table.
2. Take the loaded-conductor count from the phase mode (2 or 3).
3. Iterate the supported sections in ascending order, skipping anything below
   `minimumSectionMm2` (default 1.5 mm²).
4. Accept a section only when **both**:
   - `Iz_derated ≥ In` (protective-device rating), and
   - `ΔU% ≤ maxVoltageDropPct`.
5. Return the first accepted section with its derated ampacity, voltage-drop
   result and a per-candidate rejection reason.
6. If no supported section passes, return `selectedSectionMm2: null` and an
   explicit explanation. Never return the largest section as a guess.

The response includes every candidate and the assumptions. Selection does
**not** check:

- fault-loop impedance or maximum disconnection time;
- thermal withstand (`I²t`) of the conductor;
- protective-device breaking capacity or selectivity;
- neutral sizing, PE sizing, or parallel conductors;
- grouping inside the board, harmonics or transient loads.

## 7. Orthogonal routing

`routeOrthogonal()` is a deterministic A* search on a discretised plan.

| Parameter | Default | Meaning |
|---|---:|---|
| `gridMm` | 250 | Cell size; below 50 mm is refused |
| `clearanceMm` | 50 | Free distance beyond half the wall thickness |
| `turnPenaltyMm` | 400 | Equivalent length added for a 90° turn |
| `maxCells` | 120,000 | Hard guard against unbounded search |

- A wall blocks every cell within `thickness/2 + clearance` of its centreline.
  Walls are **always** obstacles; the router never creates a penetration.
- The search state is cell plus arrival direction (five states per cell), so
  turns can be costed.
- Endpoints that fall inside a clearance zone are snapped to the nearest free
  cell; this produces an `ENDPOINT_SNAPPED` information diagnostic.
- Identical input produces identical output: priorities are ordered by cost and
  then by a deterministic geometric tie-break.
- A feasible result means "a path exists on this discretised model". It is not
  proof of physical constructibility and is never a drilling guide.

`checkRouteGeometry()` is used both by the UI and the server:

| Diagnostic | Severity | Meaning |
|---|---|---|
| `ROUTE_TOO_SHORT` | error | Fewer than two points |
| `DIAGONAL_SEGMENT` | warning | Non-orthogonal segment |
| `ZERO_LENGTH_SEGMENT` | warning | Duplicate consecutive point |
| `SHORT_SEGMENT` | info | Segment under 100 mm |
| `OUTSIDE_PLAN` | warning | Point outside the level bounds |
| `WALL_CROSSING` | warning | Crosses a wall without `allowPenetration` |
| `PENETRATION_DECLARED` | info | Crosses a wall that accepts a penetration |
| `SELF_INTERSECTION` | warning | Non-adjacent segments cross |
| `DANGLING_ENDPOINT` | warning | Endpoint more than 300 mm from equipment |
| `NO_PATH`, `GRID_TOO_LARGE`, `GRID_TOO_FINE`, `NO_FREE_CELL` | error | Router could not build a usable search |

The server treats `WALL_CROSSING`, `OUTSIDE_PLAN`, `DANGLING_ENDPOINT`,
`ROUTE_TOO_SHORT`, `ZERO_LENGTH_SEGMENT` and the router errors as blocking
(`422 ROUTE_NOT_ACCEPTABLE`). Diagonal segments, short segments,
self-intersections, declared penetrations and snapping are **not** blocking:
the engine cannot know whether the chosen installation method permits them.
See [ADR-0006](adr/0006-route-lifecycle-and-decisions.md).

## 8. Material take-off

`computeTakeoff()` produces lines only from recorded data. Every line declares
its basis:

| Basis | Used for | Meaning |
|---|---|---|
| `catalogue` | Equipment counts | Number of placed instances of a catalogue definition |
| `inferred` | Cable, conduit, mounting boxes | Derived from geometry plus a stated allowance |
| `assumed` | Reserved | Would depend on a design assumption |
| `measured` | Reserved | Would be a direct measurement |

**Cable quantity per route**

```
L_total = L_planar × (1 + slack% / 100) + h_from + h_to
```

`L_planar` is the polyline length, `slackPercent` is the route field (0–50 %,
default 10 %), and `h_from` / `h_to` are the mounting heights of the endpoint
equipment. Both vertical drops are added. Routes without a circuit contribute
no cable; routes without a conduit key contribute no containment.

**Other rules**

- Mounting boxes: one per socket, switch and data outlet (`inferred`).
- Conduit: one conduit per route (`inferred`); shared containment is not
  modelled.
- No waste, fixings, terminations, accessories or consumables.
- **No price, supplier, product or manufacturer data.** A bill of quantities is
  not a quotation.
- CSV export includes the method version and all assumptions, and escapes
  commas, quotes and newlines. Spreadsheet formula injection is not mitigated;
  see [security.md](security.md).

## 9. Method versions

| Constant | Value | Used by |
|---|---|---|
| `AMPACITY_METHOD_VERSION` | `ampacity-2026.10-refC-pvc` | Ampacity data |
| `VOLTAGE_DROP_METHOD_VERSION` | `vd-2026.10` | Voltage-drop result |
| `LOAD_SCHEDULE_METHOD_VERSION` | `load-2026.10` | Load schedule |
| `CABLE_SELECTION_METHOD_VERSION` | `cable-2026.10` | Cable selection |
| `ROUTING_METHOD_VERSION` | `route-astar-2026.10` | Routing result |
| `TAKEOFF_METHOD_VERSION` | `takeoff-2026.10` | Take-off and CSV |
| `DEFAULT_RULE_SET_VERSION` | `VX-PT-RES-1.0.0` | Validation findings |

Changing a table, factor or formula requires a new method/rule-set version and
a re-run of the reference tests.

## 10. How to verify

```bash
npm run test --workspace @vectrix/electrical
npm run typecheck
```

The suite covers conductor resistance, the two reference voltage-drop
calculations, derating, cable selection with each binding constraint, refusal
of XLPE and unsupported sections, A* routing around walls, no-path cases,
determinism, grid guards, route diagnostics, load separation, take-off bases
and CSV output.

Licensed-standard verification remains outstanding. Until it is completed, the
UI must continue to show the advisory notice and the “unverified” provenance.
