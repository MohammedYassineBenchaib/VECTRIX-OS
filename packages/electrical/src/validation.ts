import {
  BREAKER_RATINGS_A,
  type Circuit,
  type Connection,
  type Equipment,
  type EquipmentDefinition,
  type Project,
  type Room,
  type Route,
  type Terminal,
  type ValidationSeverity,
  type Wall,
  getEquipmentDefinition,
  pointInPolygon,
} from "@vectrix/core";
import { DEFAULT_CONDITIONS, correctedAmpacity, deratingFactors, type InstallationConditions } from "./ampacity";
import { computeLoadSchedule, type LoadSchedule } from "./loads";
import { calculateVoltageDrop } from "./voltage-drop";
import { CABLE_TYPES } from "@vectrix/core";
import { checkRouteGeometry, type RoutingWall } from "./routing";

/**
 * Rule set and validation.
 *
 * A passing rule set is engineering evidence, not legal compliance and not a
 * professional approval. Every rule carries a stable id so that findings can be
 * discussed, accepted, waived with justification, and diffed between revisions.
 */

export const DEFAULT_RULE_SET_VERSION = "VX-PT-RES-1.0.0";

export interface EngineeringLimits {
  voltageDropLightingPct: number;
  voltageDropOtherPct: number;
  socketRcdSensitivityMa: number;
  maxSocketOutletsPerCircuit: number;
  maxLightingPointsPerCircuit: number;
  lightingBreakerMaxA: number;
  socketBreakerMaxA: number;
  maxPhaseImbalancePct: number;
  designHeadroomWarningPct: number;
  anchorToleranceMm: number;
}

export interface RuleSet {
  version: string;
  jurisdiction: string;
  discipline: "electrical";
  title: string;
  advisoryNotice: string;
  limits: EngineeringLimits;
  sources: string[];
}

export function createRuleSet(project: Project): RuleSet {
  return {
    version: DEFAULT_RULE_SET_VERSION,
    jurisdiction: project.jurisdiction,
    discipline: "electrical",
    title: "Residential electrical advisory checks",
    advisoryNotice:
      "Advisory engineering checks only. Passing them does not establish compliance with IEC 60364, national installation rules, or any certification. A qualified professional must review and approve the design.",
    limits: {
      voltageDropLightingPct: project.voltageDropLimitLightingPct,
      voltageDropOtherPct: project.voltageDropLimitOtherPct,
      socketRcdSensitivityMa: 30,
      maxSocketOutletsPerCircuit: 10,
      maxLightingPointsPerCircuit: 20,
      lightingBreakerMaxA: 16,
      socketBreakerMaxA: 20,
      maxPhaseImbalancePct: 30,
      designHeadroomWarningPct: 80,
      anchorToleranceMm: 300,
    },
    sources: [
      "IEC 60364 series (structure and LV installation principles) — referenced, not reproduced.",
      "IEC 60228 conductor resistance values — widely published reference data.",
      "Indicative PVC copper reference-method-C ampacity — pending verification against a licensed copy of IEC 60364-5-52.",
      "Portuguese practice defaults are configurable assumptions, not a legal determination.",
    ],
  };
}

export type FindingEntityType =
  | "project"
  | "circuit"
  | "equipment"
  | "route"
  | "room"
  | "connection";

export interface Finding {
  ruleId: string;
  severity: ValidationSeverity;
  /** Deterministic key, stable across re-runs; used to preserve acknowledgements. */
  dedupeKey: string;
  entityType: FindingEntityType;
  entityId: string;
  levelId: string | null;
  message: string;
  details: Record<string, unknown>;
  title: string;
}

export interface ValidationInput {
  project: Project;
  circuits: Circuit[];
  equipment: Equipment[];
  rooms: Room[];
  walls: Wall[];
  routes: Route[];
  connections: Connection[];
  terminals: Terminal[];
  conditions?: InstallationConditions;
  resolveDefinition?: (key: string) => EquipmentDefinition | undefined;
}

const RULE_TITLES: Record<string, string> = {
  "VX-EL-001": "No distribution board",
  "VX-EL-002": "Equipment without circuit",
  "VX-EL-003": "Empty circuit",
  "VX-EL-004": "Breaker undersized",
  "VX-EL-005": "Voltage drop above configured limit",
  "VX-EL-006": "Cable ampacity below breaker rating",
  "VX-EL-007": "Socket circuit without 30 mA RCD",
  "VX-EL-008": "Lighting breaker above advisory maximum",
  "VX-EL-009": "Earth continuity not recorded",
  "VX-EL-010": "Equipment outside its room",
  "VX-EL-011": "Mounting height outside product range",
  "VX-EL-012": "Duplicate circuit name",
  "VX-EL-013": "Route without circuit",
  "VX-EL-014": "Route endpoint not connected",
  "VX-EL-015": "Non-orthogonal route segment",
  "VX-EL-016": "Too many outlets on one circuit",
  "VX-EL-017": "Unsupported cable data",
  "VX-EL-018": "Phase imbalance",
  "VX-EL-020": "Non-standard breaker rating",
  "VX-EL-021": "Route crosses an undeclared wall",
  "VX-EL-022": "Route outside plan bounds",
  "VX-EL-023": "Low design headroom",
  "VX-EL-024": "Equipment type does not match circuit type",
  "VX-EL-025": "Proposed routes not checked",
  "VX-EL-026": "Circuit data integrity",
};

function titleFor(ruleId: string): string {
  return RULE_TITLES[ruleId] ?? ruleId;
}

/** FNV-1a, used only to derive a stable validation id from a dedupe key. */
function hashKey(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function validationIdForKey(dedupeKey: string): string {
  return `val_${hashKey(dedupeKey)}${hashKey(`salt:${dedupeKey}`)}`;
}

function makeFinding(
  ruleId: string,
  severity: ValidationSeverity,
  entityType: FindingEntityType,
  entityId: string,
  levelId: string | null,
  message: string,
  details: Record<string, unknown> = {},
  discriminator = "",
): Finding {
  const dedupeKey = `${ruleId}:${entityType}:${entityId}${discriminator ? `:${discriminator}` : ""}`;
  return {
    ruleId,
    severity,
    dedupeKey,
    entityType,
    entityId,
    levelId,
    message,
    details,
    title: titleFor(ruleId),
  };
}

function resolveCable(typeKey: string) {
  return CABLE_TYPES.find((cable) => cable.key === typeKey);
}

function circuitVoltageDropLimit(circuit: Circuit, rules: RuleSet): number {
  if (circuit.voltageDropLimitPct !== null) return circuit.voltageDropLimitPct;
  return circuit.type === "lighting"
    ? rules.limits.voltageDropLightingPct
    : rules.limits.voltageDropOtherPct;
}

/**
 * Circuit route length used for voltage drop.
 *
 * MVP assumption: the longest recorded route assigned to the circuit represents
 * the electrically farthest point. If the circuit has several spurs, this is
 * conservative only when the longest route also carries the full circuit
 * current. The UI states that assumption next to the result.
 */
export function circuitRouteLengthMm(circuitId: string, routes: Route[]): number | null {
  const lengths = routes
    .filter((route) => route.circuitId === circuitId)
    .map((route) => route.lengthMm);
  if (lengths.length === 0) return null;
  return Math.max(...lengths);
}

export function validateElectrical(input: ValidationInput): Finding[] {
  const rules = createRuleSet(input.project);
  const conditions = input.conditions ?? DEFAULT_CONDITIONS;
  const resolve = input.resolveDefinition ?? getEquipmentDefinition;
  const findings: Finding[] = [];
  const definitions = new Map<string, EquipmentDefinition | null>();
  const definitionFor = (key: string): EquipmentDefinition | null => {
    if (definitions.has(key)) return definitions.get(key)!;
    const definition = resolve(key) ?? null;
    definitions.set(key, definition);
    return definition;
  };

  const schedule = computeLoadSchedule({
    project: input.project,
    circuits: input.circuits,
    equipment: input.equipment,
    resolveDefinition: (key) => definitionFor(key) ?? undefined,
  });

  for (const key of schedule.unknownDefinitionKeys) {
    findings.push(
      makeFinding(
        "VX-EL-026",
        "error",
        "project",
        input.project.id,
        null,
        `Equipment library key "${key}" is not available. Remove or replace the affected objects before relying on the schedule.`,
        { missingDefinitionKey: key },
        key,
      ),
    );
  }

  const boardEquipment = input.equipment.filter(
    (item) => definitionFor(item.definitionKey)?.category === "distribution_board",
  );
  if (input.circuits.length > 0 && boardEquipment.length === 0) {
    findings.push(
      makeFinding(
        "VX-EL-001",
        "error",
        "project",
        input.project.id,
        null,
        "Circuits exist but no distribution board is placed. Circuit origin and protective-device context are undefined.",
        { circuitCount: input.circuits.length },
      ),
    );
  }

  const circuitById = new Map(input.circuits.map((circuit) => [circuit.id, circuit]));
  const equipmentByCircuit = new Map<string, Equipment[]>();
  for (const item of input.equipment) {
    if (!item.circuitId) continue;
    const list = equipmentByCircuit.get(item.circuitId) ?? [];
    list.push(item);
    equipmentByCircuit.set(item.circuitId, list);
  }

  for (const item of input.equipment) {
    const definition = definitionFor(item.definitionKey);
    if (!definition) continue;
    const loadVA = item.loadVAOverride ?? definition.electrical.defaultLoadVA ?? 0;
    if (loadVA > 0 && !item.circuitId) {
      findings.push(
        makeFinding(
          "VX-EL-002",
          "warning",
          "equipment",
          item.id,
          item.levelId,
          `"${item.label}" draws load but is not assigned to a circuit.`,
          { label: item.label, definitionKey: item.definitionKey, connectedVA: loadVA },
        ),
      );
    }
    if (item.circuitId && !circuitById.has(item.circuitId)) {
      findings.push(
        makeFinding(
          "VX-EL-026",
          "error",
          "equipment",
          item.id,
          item.levelId,
          `"${item.label}" references a circuit that no longer exists.`,
          { circuitId: item.circuitId },
        ),
      );
    }

    const room = item.roomId ? input.rooms.find((r) => r.id === item.roomId) : undefined;
    if (!room && definition.category !== "distribution_board") {
      findings.push(
        makeFinding(
          "VX-EL-010",
          "warning",
          "equipment",
          item.id,
          item.levelId,
          `"${item.label}" is not assigned to a room, so its location cannot be described for installation.`,
          { label: item.label },
        ),
      );
    } else if (room && !pointInPolygon({ x: item.xMm, y: item.yMm }, room.polygon)) {
      findings.push(
        makeFinding(
          "VX-EL-010",
          "warning",
          "equipment",
          item.id,
          item.levelId,
          `"${item.label}" is assigned to ${room.name} but its position is outside that room.`,
          { label: item.label, roomId: room.id, point: { x: item.xMm, y: item.yMm } },
        ),
      );
    }

    if (
      item.mountingHeightMm < definition.mounting.minHeightMm ||
      item.mountingHeightMm > definition.mounting.maxHeightMm
    ) {
      findings.push(
        makeFinding(
          "VX-EL-011",
          "warning",
          "equipment",
          item.id,
          item.levelId,
          `"${item.label}" is mounted at ${item.mountingHeightMm} mm, outside the product's advisory range ${definition.mounting.minHeightMm}–${definition.mounting.maxHeightMm} mm.`,
          {
            mountingHeightMm: item.mountingHeightMm,
            minHeightMm: definition.mounting.minHeightMm,
            maxHeightMm: definition.mounting.maxHeightMm,
          },
        ),
      );
    }
  }

  const seenCircuitNames = new Map<string, Circuit[]>();
  for (const circuit of input.circuits) {
    const key = circuit.name.trim().toLowerCase();
    const list = seenCircuitNames.get(key) ?? [];
    list.push(circuit);
    seenCircuitNames.set(key, list);
  }
  for (const [, group] of seenCircuitNames) {
    if (group.length < 2) continue;
    for (const circuit of group) {
      findings.push(
        makeFinding(
          "VX-EL-012",
          "warning",
          "circuit",
          circuit.id,
          null,
          `Circuit name "${circuit.name}" is used by ${group.length} circuits. Unique names are required for a usable panel schedule.`,
          { name: circuit.name, circuitIds: group.map((c) => c.id) },
        ),
      );
    }
  }

  const loadById = new Map(schedule.circuits.map((load) => [load.circuitId, load]));

  for (const circuit of input.circuits) {
    const members = equipmentByCircuit.get(circuit.id) ?? [];
    const load = loadById.get(circuit.id);
    if (!load) continue;
    const levelId = members[0]?.levelId ?? null;

    if (members.length === 0) {
      findings.push(
        makeFinding(
          "VX-EL-003",
          "warning",
          "circuit",
          circuit.id,
          levelId,
          `Circuit "${circuit.name}" has no connected equipment.`,
          { circuitName: circuit.name },
        ),
      );
    }

    if (load.currentA > circuit.breakerRatingA + 1e-9) {
      findings.push(
        makeFinding(
          "VX-EL-004",
          "error",
          "circuit",
          circuit.id,
          levelId,
          `Circuit "${circuit.name}" demand current ${load.currentA.toFixed(1)} A exceeds its ${circuit.breakerRatingA} A breaker.`,
          {
            designCurrentA: Number(load.currentA.toFixed(3)),
            breakerRatingA: circuit.breakerRatingA,
            demandVA: Math.round(load.demandVA),
            demandFactor: circuit.demandFactor,
          },
        ),
      );
    }

    const cable = resolveCable(circuit.cableTypeKey);
    if (!cable) {
      findings.push(
        makeFinding(
          "VX-EL-017",
          "warning",
          "circuit",
          circuit.id,
          levelId,
          `Circuit "${circuit.name}" uses unknown cable type "${circuit.cableTypeKey}".`,
          { cableTypeKey: circuit.cableTypeKey },
        ),
      );
    } else if (cable.insulation !== "PVC") {
      findings.push(
        makeFinding(
          "VX-EL-017",
          "warning",
          "circuit",
          circuit.id,
          levelId,
          `Circuit "${circuit.name}" uses ${cable.insulation}-insulated cable. Ampacity and voltage-drop checks for this insulation are not verified in this build.`,
          { cableTypeKey: cable.key, insulation: cable.insulation },
        ),
      );
    } else {
      const loaded = circuit.phaseMode === "three_phase" ? 3 : 2;
      const ampacity = correctedAmpacity(circuit.cableSectionMm2, loaded, conditions);
      if (ampacity === null) {
        findings.push(
          makeFinding(
            "VX-EL-017",
            "warning",
            "circuit",
            circuit.id,
            levelId,
            `No verified ampacity data for ${circuit.cableSectionMm2} mm² on circuit "${circuit.name}".`,
            { cableSectionMm2: circuit.cableSectionMm2 },
          ),
        );
      } else if (ampacity + 1e-9 < circuit.breakerRatingA) {
        findings.push(
          makeFinding(
            "VX-EL-006",
            "error",
            "circuit",
            circuit.id,
            levelId,
            `Circuit "${circuit.name}": derated cable capacity ${ampacity.toFixed(1)} A is below the ${circuit.breakerRatingA} A breaker.`,
            {
              deratedAmpacityA: Number(ampacity.toFixed(2)),
              breakerRatingA: circuit.breakerRatingA,
              conditions,
              derating: deratingFactors(conditions),
            },
          ),
        );
      } else {
        const headroomThreshold =
          (rules.limits.designHeadroomWarningPct / 100) * circuit.breakerRatingA;
        if (load.currentA > headroomThreshold) {
          findings.push(
            makeFinding(
              "VX-EL-023",
              "info",
              "circuit",
              circuit.id,
              levelId,
              `Circuit "${circuit.name}" is loaded to ${((load.currentA / circuit.breakerRatingA) * 100).toFixed(0)}% of its breaker rating, above the ${rules.limits.designHeadroomWarningPct}% advisory headroom threshold.`,
              {
                designCurrentA: Number(load.currentA.toFixed(3)),
                breakerRatingA: circuit.breakerRatingA,
                utilizationPct: Number(((load.currentA / circuit.breakerRatingA) * 100).toFixed(1)),
              },
            ),
          );
        }
      }

      const routeLength = circuitRouteLengthMm(circuit.id, input.routes);
      if (routeLength !== null && routeLength > 0 && load.currentA > 0) {
        const limit = circuitVoltageDropLimit(circuit, rules);
        const drop = calculateVoltageDrop({
          phaseMode: circuit.phaseMode,
          currentA: load.currentA,
          lengthMm: routeLength,
          sectionMm2: circuit.cableSectionMm2,
          powerFactor: load.weightedPowerFactor,
          phaseVoltageV: input.project.phaseVoltageV,
          lineVoltageV: input.project.lineVoltageV,
          insulation: cable.insulation,
        });
        if (drop.percent > limit + 1e-9) {
          findings.push(
            makeFinding(
              "VX-EL-005",
              "warning",
              "circuit",
              circuit.id,
              levelId,
              `Circuit "${circuit.name}" voltage drop ${drop.percent.toFixed(2)}% exceeds the configured ${limit}% limit over ${(routeLength / 1000).toFixed(1)} m.`,
              {
                voltageDropPct: Number(drop.percent.toFixed(3)),
                voltageDropV: Number(drop.volts.toFixed(2)),
                limitPct: limit,
                lengthMm: Math.round(routeLength),
                currentA: Number(load.currentA.toFixed(3)),
                sectionMm2: circuit.cableSectionMm2,
                formula: drop.formula,
                methodVersion: drop.methodVersion,
                basis: "Longest route assigned to the circuit, at full circuit demand current.",
              },
            ),
          );
        }
      }
    }

    const socketMembers = members.filter(
      (item) => definitionFor(item.definitionKey)?.category === "socket",
    );
    const hasSocketCircuit = circuit.type === "sockets" || socketMembers.length > 0;
    if (
      hasSocketCircuit &&
      (circuit.rcdSensitivityMa === null ||
        circuit.rcdSensitivityMa > rules.limits.socketRcdSensitivityMa)
    ) {
      findings.push(
        makeFinding(
          "VX-EL-007",
          "warning",
          "circuit",
          circuit.id,
          levelId,
          `Circuit "${circuit.name}" supplies socket outlets without a recorded ≤${rules.limits.socketRcdSensitivityMa} mA RCD. Verify the protective measure for the installation.`,
          {
            rcdSensitivityMa: circuit.rcdSensitivityMa,
            advisoryLimitMa: rules.limits.socketRcdSensitivityMa,
          },
        ),
      );
    }

    if (hasSocketCircuit) {
      const socketCount = socketMembers.length;
      if (socketCount > rules.limits.maxSocketOutletsPerCircuit) {
        findings.push(
          makeFinding(
            "VX-EL-016",
            "warning",
            "circuit",
            circuit.id,
            levelId,
            `Circuit "${circuit.name}" has ${socketCount} socket outlets, above the advisory maximum of ${rules.limits.maxSocketOutletsPerCircuit}.`,
            { socketCount, advisoryMax: rules.limits.maxSocketOutletsPerCircuit },
          ),
        );
      }
      if (circuit.breakerRatingA > rules.limits.socketBreakerMaxA) {
        findings.push(
          makeFinding(
            "VX-EL-004",
            "error",
            "circuit",
            circuit.id,
            levelId,
            `Circuit "${circuit.name}" supplies sockets with a ${circuit.breakerRatingA} A breaker, above the ${rules.limits.socketBreakerMaxA} A advisory maximum for socket circuits.`,
            { breakerRatingA: circuit.breakerRatingA, advisoryMaxA: rules.limits.socketBreakerMaxA },
            "socket-breaker",
          ),
        );
      }
    }

    if (circuit.type === "lighting" && circuit.breakerRatingA > rules.limits.lightingBreakerMaxA) {
      findings.push(
        makeFinding(
          "VX-EL-008",
          "warning",
          "circuit",
          circuit.id,
          levelId,
          `Lighting circuit "${circuit.name}" uses a ${circuit.breakerRatingA} A breaker, above the advisory maximum of ${rules.limits.lightingBreakerMaxA} A.`,
          { breakerRatingA: circuit.breakerRatingA, advisoryMaxA: rules.limits.lightingBreakerMaxA },
        ),
      );
    }

    if (!(BREAKER_RATINGS_A as readonly number[]).includes(circuit.breakerRatingA)) {
      findings.push(
        makeFinding(
          "VX-EL-020",
          "info",
          "circuit",
          circuit.id,
          levelId,
          `Circuit "${circuit.name}" uses a non-standard breaker rating of ${circuit.breakerRatingA} A.`,
          { breakerRatingA: circuit.breakerRatingA },
        ),
      );
    }

    for (const member of members) {
      const definition = definitionFor(member.definitionKey);
      if (!definition) continue;
      const typical = definition.electrical.typicalCircuitType;
      if (
        typical !== "other_power" &&
        circuit.type !== "other_power" &&
        typical !== circuit.type
      ) {
        findings.push(
          makeFinding(
            "VX-EL-024",
            "warning",
            "equipment",
            member.id,
            member.levelId,
            `"${member.label}" (${definition.shortName}) is typically supplied by a ${typical.replace("_", " ")} circuit, but is assigned to "${circuit.name}" (${circuit.type.replace("_", " ")}).`,
            { definitionKey: definition.key, typicalCircuitType: typical, circuitType: circuit.type },
          ),
        );
      }
    }

    if (circuit.phaseMode === "three_phase") {
      const phase = load.phaseCurrentsA;
      const values = [phase.L1, phase.L2, phase.L3];
      const average = values.reduce((a, b) => a + b, 0) / 3;
      if (average > 0) {
        const imbalance = ((Math.max(...values) - Math.min(...values)) / average) * 100;
        if (imbalance > rules.limits.maxPhaseImbalancePct) {
          findings.push(
            makeFinding(
              "VX-EL-018",
              "warning",
              "circuit",
              circuit.id,
              levelId,
              `Circuit "${circuit.name}" phase imbalance is ${imbalance.toFixed(0)}%, above the advisory ${rules.limits.maxPhaseImbalancePct}% threshold.`,
              {
                imbalancePct: Number(imbalance.toFixed(1)),
                phaseCurrentsA: {
                  L1: Number(phase.L1.toFixed(2)),
                  L2: Number(phase.L2.toFixed(2)),
                  L3: Number(phase.L3.toFixed(2)),
                },
              },
            ),
          );
        }
      }
    }
  }

  // Earth continuity can only be judged for equipment that participates in a
  // recorded connection. Equipment with no connections at all is reported as a
  // coverage gap, not as dozens of individual false alarms.
  const terminalById = new Map(input.terminals.map((terminal) => [terminal.id, terminal]));
  const connectedTerminalIds = new Set<string>();
  for (const connection of input.connections) {
    connectedTerminalIds.add(connection.fromTerminalId);
    connectedTerminalIds.add(connection.toTerminalId);
  }
  const equipmentWithConnections = new Set<string>();
  for (const terminal of input.terminals) {
    if (connectedTerminalIds.has(terminal.id)) {
      equipmentWithConnections.add(terminal.equipmentId);
    }
  }

  if (input.equipment.length > 0 && input.connections.length === 0) {
    findings.push(
      makeFinding(
        "VX-EL-009",
        "info",
        "project",
        input.project.id,
        null,
        "No terminal connections are recorded. Earth continuity, circuit polarity and the electrical topology cannot be verified.",
        { equipmentCount: input.equipment.length },
        "no-connections",
      ),
    );
  } else {
    let unrecordedEarthCount = 0;
    for (const item of input.equipment) {
      const definition = definitionFor(item.definitionKey);
      if (!definition?.electrical.requiresEarth) continue;
      if (!equipmentWithConnections.has(item.id)) {
        unrecordedEarthCount += 1;
        continue;
      }
      const earthTerminalIds = input.terminals
        .filter(
          (terminal) =>
            terminal.equipmentId === item.id &&
            terminal.function === "earth" &&
            terminalById.has(terminal.id),
        )
        .map((terminal) => terminal.id);
      if (earthTerminalIds.length === 0) {
        findings.push(
          makeFinding(
            "VX-EL-009",
            "error",
            "equipment",
            item.id,
            item.levelId,
            `"${item.label}" requires an earth connection but has no earth terminal record.`,
            { label: item.label },
          ),
        );
        continue;
      }
      const connected = earthTerminalIds.some((id) => connectedTerminalIds.has(id));
      if (!connected) {
        findings.push(
          makeFinding(
            "VX-EL-009",
            "warning",
            "equipment",
            item.id,
            item.levelId,
            `"${item.label}" has no recorded connection to its earth terminal. Earth continuity is unverified.`,
            { label: item.label, earthTerminalIds },
          ),
        );
      }
    }
    if (unrecordedEarthCount > 0) {
      findings.push(
        makeFinding(
          "VX-EL-009",
          "info",
          "project",
          input.project.id,
          null,
          `${unrecordedEarthCount} class I device(s) have no recorded terminal connections. Topology coverage is partial.`,
          { unrecordedEquipmentCount: unrecordedEarthCount },
          "coverage-gap",
        ),
      );
    }
  }

  const routingWalls: RoutingWall[] = input.walls.map((wall) => ({
    id: wall.id,
    startX: wall.startX,
    startY: wall.startY,
    endX: wall.endX,
    endY: wall.endY,
    thicknessMm: wall.thicknessMm,
    allowPenetration: wall.allowPenetration,
  }));

  const anchors = input.equipment
    .filter((item) => {
      const category = definitionFor(item.definitionKey)?.category;
      return category === "distribution_board" || category !== undefined;
    })
    .map((item) => ({ id: item.id, point: { x: item.xMm, y: item.yMm } }));

  const bounds = (() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const room of input.rooms) {
      for (const p of room.polygon) {
        xs.push(p.x);
        ys.push(p.y);
      }
    }
    for (const wall of input.walls) {
      xs.push(wall.startX, wall.endX);
      ys.push(wall.startY, wall.endY);
    }
    for (const item of input.equipment) {
      xs.push(item.xMm);
      ys.push(item.yMm);
    }
    if (xs.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  })();

  const proposedRoutes: Route[] = [];
  for (const route of input.routes) {
    if (!route.circuitId) {
      findings.push(
        makeFinding(
          "VX-EL-013",
          "warning",
          "route",
          route.id,
          route.levelId,
          "Route is not assigned to a circuit, so it contributes to no schedule or quantity.",
          { routeId: route.id },
        ),
      );
    }
    if (route.status === "proposed" || route.status === "visual") {
      proposedRoutes.push(route);
    }

    const diagnostics = checkRouteGeometry({
      points: route.points,
      bounds,
      walls: routingWalls,
      anchors,
      anchorToleranceMm: rules.limits.anchorToleranceMm,
    });

    if (diagnostics.some((d) => d.code === "WALL_CROSSING")) {
      const crosses = diagnostics.filter((d) => d.code === "WALL_CROSSING");
      findings.push(
        makeFinding(
          "VX-EL-021",
          "warning",
          "route",
          route.id,
          route.levelId,
          `Route crosses ${crosses.length} wall(s) that are not marked as accepting a penetration.`,
          {
            walls: crosses.map((d) => d.data),
            routeId: route.id,
          },
        ),
      );
    }
    if (diagnostics.some((d) => d.code === "OUTSIDE_PLAN")) {
      findings.push(
        makeFinding(
          "VX-EL-022",
          "warning",
          "route",
          route.id,
          route.levelId,
          "Route leaves the level plan bounds.",
          { routeId: route.id },
        ),
      );
    }
    if (diagnostics.some((d) => d.code === "DANGLING_ENDPOINT")) {
      findings.push(
        makeFinding(
          "VX-EL-014",
          "warning",
          "route",
          route.id,
          route.levelId,
          `Route endpoint is not within ${rules.limits.anchorToleranceMm} mm of any equipment. Its connection is ambiguous.`,
          {
            routeId: route.id,
            endpoints: diagnostics.filter((d) => d.code === "DANGLING_ENDPOINT").map((d) => d.data),
          },
        ),
      );
    }
    if (diagnostics.some((d) => d.code === "DIAGONAL_SEGMENT")) {
      findings.push(
        makeFinding(
          "VX-EL-015",
          "warning",
          "route",
          route.id,
          route.levelId,
          "Route contains a diagonal segment. Confirm that the selected installation method permits it.",
          {
            routeId: route.id,
            segments: diagnostics.filter((d) => d.code === "DIAGONAL_SEGMENT").map((d) => d.data),
          },
        ),
      );
    }
  }

  if (proposedRoutes.length > 0) {
    findings.push(
      makeFinding(
        "VX-EL-025",
        "info",
        "project",
        input.project.id,
        null,
        `${proposedRoutes.length} route(s) are still proposed or visual. They have not been checked as installed or approved.`,
        { routeIds: proposedRoutes.map((route) => route.id) },
        "proposed-routes",
      ),
    );
  }

  return findings.sort((a, b) => {
    if (a.severity !== b.severity) {
      const order = { error: 0, warning: 1, info: 2 } as const;
      return order[a.severity] - order[b.severity];
    }
    return a.dedupeKey.localeCompare(b.dedupeKey);
  });
}

export function summarizeFindings(findings: Finding[]): {
  errors: number;
  warnings: number;
  infos: number;
} {
  return findings.reduce(
    (acc, finding) => {
      if (finding.severity === "error") acc.errors += 1;
      else if (finding.severity === "warning") acc.warnings += 1;
      else acc.infos += 1;
      return acc;
    },
    { errors: 0, warnings: 0, infos: 0 },
  );
}

export function findingKey(finding: Finding): string {
  return finding.dedupeKey;
}

export { computeLoadSchedule, calculateVoltageDrop, deratingFactors };
export type { LoadSchedule };
