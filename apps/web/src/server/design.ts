import type {
  Circuit as CircuitRow,
  Prisma,
  Project as ProjectRow,
  ValidationResult as ValidationRow,
} from "@prisma/client";
import {
  CABLE_TYPES,
  findEquipmentDefinition,
  type Building,
  type Circuit,
  type Connection,
  type Equipment,
  type Level,
  type LevelWorkspace,
  type Project,
  type Room,
  type Route,
  type Terminal,
  type ValidationResult,
  type Wall,
} from "@vectrix/core";
import {
  computeLoadSchedule,
  computeTakeoff,
  createRuleSet,
  DEFAULT_CONDITIONS,
  selectCable,
  type CableSelectionResult,
  type InstallationConditions,
  type LoadSchedule,
  type MaterialTakeoff,
  validateElectrical,
  validationIdForKey,
} from "@vectrix/electrical";
import { prisma } from "./db";
import {
  serializeBuilding,
  serializeCircuit,
  serializeConnection,
  serializeEquipment,
  serializeLevel,
  serializeProject,
  serializeRoom,
  serializeRoute,
  serializeTerminal,
  serializeValidation,
  serializeWall,
} from "./serialize";

export interface DesignScope {
  project: Project;
  circuits: Circuit[];
  equipment: Equipment[];
  rooms: Room[];
  walls: Wall[];
  routes: Route[];
  terminals: Terminal[];
  connections: Connection[];
  circuitsById: Map<string, Circuit>;
  equipmentById: Map<string, Equipment>;
  roomsById: Map<string, Room>;
}

export interface ProjectDashboard {
  project: Project;
  buildings: Building[];
  levels: Level[];
  counts: {
    buildings: number;
    levels: number;
    rooms: number;
    walls: number;
    equipment: number;
    circuits: number;
    routes: number;
    connections: number;
    validationsOpen: number;
  };
  findings: { errors: number; warnings: number; infos: number };
  totals: {
    connectedVA: number;
    demandVA: number;
    cableMetres: number;
    equipmentUnits: number;
    containmentMetres: number;
  };
}

export interface WorkspacePayload {
  workspace: LevelWorkspace;
  levels: Array<Pick<Level, "id" | "name" | "elevationMm" | "sortOrder">>;
  stats: {
    rooms: number;
    walls: number;
    equipment: number;
    circuits: number;
    routes: number;
    connections: number;
    errors: number;
    warnings: number;
    infos: number;
    connectedVA: number;
    demandVA: number;
    installedRoutes: number;
    validatedRoutes: number;
  };
  loadSchedule: LoadSchedule;
  takeoff: MaterialTakeoff;
  advisory: {
    ruleSetVersion: string;
    jurisdiction: string;
    notice: string;
  };
}

async function loadScope(projectId: string): Promise<DesignScope | null> {
  const projectRow = await prisma.project.findUnique({ where: { id: projectId } });
  if (!projectRow) return null;

  const [circuitRows, equipmentRows, roomRows, wallRows, routeRows, connectionRows] =
    await Promise.all([
      prisma.circuit.findMany({ where: { projectId }, orderBy: { name: "asc" } }),
      prisma.equipment.findMany({
        where: { level: { building: { projectId } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.room.findMany({
        where: { level: { building: { projectId } } },
        orderBy: { number: "asc" },
      }),
      prisma.wall.findMany({ where: { level: { building: { projectId } } } }),
      prisma.route.findMany({ where: { projectId }, orderBy: { createdAt: "asc" } }),
      prisma.connection.findMany({ where: { projectId } }),
    ]);

  const equipmentIds = equipmentRows.map((row) => row.id);
  const terminalRows =
    equipmentIds.length > 0
      ? await prisma.terminal.findMany({ where: { equipmentId: { in: equipmentIds } } })
      : [];

  const project = serializeProject(projectRow);
  const circuits = circuitRows.map(serializeCircuit);
  const equipment = equipmentRows.map(serializeEquipment);
  const rooms = roomRows.map(serializeRoom);
  const walls = wallRows.map(serializeWall);
  const routes = routeRows.map(serializeRoute);
  const terminals = terminalRows.map(serializeTerminal);
  const connections = connectionRows.map(serializeConnection);

  return {
    project,
    circuits,
    equipment,
    rooms,
    walls,
    routes,
    terminals,
    connections,
    circuitsById: new Map(circuits.map((circuit) => [circuit.id, circuit])),
    equipmentById: new Map(equipment.map((item) => [item.id, item])),
    roomsById: new Map(rooms.map((room) => [room.id, room])),
  };
}

export { loadScope };

function summarize(rows: ValidationRow[]) {
  const open = rows.filter((row) => row.status !== "resolved");
  return {
    errors: open.filter((row) => row.severity === "error").length,
    warnings: open.filter((row) => row.severity === "warning").length,
    infos: open.filter((row) => row.severity === "info").length,
  };
}

/**
 * Recomputes the rule set and persists findings.
 *
 * Acknowledgements and accepted risks survive a re-run. A finding that had been
 * resolved is reopened if it reappears, and a finding that no longer exists is
 * marked resolved instead of being deleted, so the project keeps an audit trail.
 */
export async function refreshValidations(
  projectId: string,
  actorId?: string,
): Promise<{ validations: ValidationResult[]; summary: ReturnType<typeof summarize> }> {
  const scope = await loadScope(projectId);
  if (!scope) throw new Error(`Project ${projectId} was not found while refreshing validations.`);

  const ruleSet = createRuleSet(scope.project);
  const findings = validateElectrical({
    project: scope.project,
    circuits: scope.circuits,
    equipment: scope.equipment,
    rooms: scope.rooms,
    walls: scope.walls,
    routes: scope.routes,
    connections: scope.connections,
    terminals: scope.terminals,
    conditions: DEFAULT_CONDITIONS,
  });

  const existing = await prisma.validationResult.findMany({ where: { projectId } });
  const existingByKey = new Map(existing.map((row) => [row.dedupeKey, row]));
  const findingKeys = new Set(findings.map((finding) => finding.dedupeKey));
  const now = new Date();

  const operations: Array<Prisma.PrismaPromise<unknown>> = [];
  for (const finding of findings) {
    const previous = existingByKey.get(finding.dedupeKey);
    const id = previous?.id ?? validationIdForKey(finding.dedupeKey);
    const reopening = previous?.status === "resolved";
    const data = {
      levelId: finding.levelId,
      ruleId: finding.ruleId,
      ruleSetVersion: ruleSet.version,
      severity: finding.severity,
      status: reopening ? "open" : (previous?.status ?? "open"),
      discipline: "electrical" as const,
      entityType: finding.entityType,
      entityId: finding.entityId,
      message: finding.message,
      detailsJson: JSON.stringify(finding.details),
      decidedAt: reopening ? null : (previous?.decidedAt ?? null),
      decidedBy: reopening ? null : (previous?.decidedBy ?? null),
      resolvedAt: reopening ? null : (previous?.resolvedAt ?? null),
      resolvedBy: reopening ? null : (previous?.resolvedBy ?? null),
    };

    if (previous) {
      operations.push(
        prisma.validationResult.update({ where: { id: previous.id }, data }),
      );
    } else {
      operations.push(
        prisma.validationResult.create({
          data: {
            id,
            projectId,
            dedupeKey: finding.dedupeKey,
            ...data,
          },
        }),
      );
    }
  }

  for (const previous of existing) {
    if (findingKeys.has(previous.dedupeKey)) continue;
    if (previous.status === "resolved") continue;
    operations.push(
      prisma.validationResult.update({
        where: { id: previous.id },
        data: {
          status: "resolved",
          decidedAt: now,
          decidedBy: actorId ?? null,
          resolvedAt: now,
          resolvedBy: actorId ?? null,
        },
      }),
    );
  }

  if (operations.length > 0) await prisma.$transaction(operations);

  const rows = await prisma.validationResult.findMany({
    where: { projectId },
    orderBy: [{ status: "asc" }, { severity: "asc" }, { ruleId: "asc" }, { entityId: "asc" }],
  });

  return {
    validations: rows.map(serializeValidation),
    summary: summarize(rows),
  };
}

export async function loadProjectDashboard(
  projectId: string,
): Promise<ProjectDashboard | null> {
  const scope = await loadScope(projectId);
  if (!scope) return null;
  const projectRow = await prisma.project.findUnique({ where: { id: projectId } });
  if (!projectRow) return null;

  const [buildingRows, levelRows, validationRows, counts] = await Promise.all([
    prisma.building.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: { levels: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.level.findMany({
      where: { building: { projectId } },
      orderBy: [{ buildingId: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.validationResult.findMany({ where: { projectId } }),
    Promise.all([
      prisma.room.count({ where: { level: { building: { projectId } } } }),
      prisma.wall.count({ where: { level: { building: { projectId } } } }),
      prisma.connection.count({ where: { projectId } }),
    ]),
  ]);

  const schedule = computeLoadSchedule({
    project: scope.project,
    circuits: scope.circuits,
    equipment: scope.equipment,
    resolveDefinition: findEquipmentDefinition,
  });
  const takeoff = computeTakeoff({
    project: scope.project,
    circuits: scope.circuits,
    equipment: scope.equipment,
    rooms: scope.rooms,
    routes: scope.routes,
    resolveDefinition: resolveDefinitionSafe,
  });

  return {
    project: scope.project,
    buildings: buildingRows.map((row) => ({
      ...serializeBuilding(row),
      levels: row.levels.map(serializeLevel),
    })),
    levels: levelRows.map(serializeLevel),
    counts: {
      buildings: buildingRows.length,
      levels: levelRows.length,
      rooms: counts[0],
      walls: counts[1],
      equipment: scope.equipment.length,
      circuits: scope.circuits.length,
      routes: scope.routes.length,
      connections: counts[2],
      validationsOpen: validationRows.filter((row) => row.status !== "resolved").length,
    },
    findings: summarize(validationRows),
    totals: {
      connectedVA: schedule.totalConnectedVA,
      demandVA: schedule.totalDemandVA,
      cableMetres: takeoff.totals.cableMetres,
      equipmentUnits: takeoff.totals.equipmentUnits,
      containmentMetres: takeoff.totals.containmentMetres,
    },
  };
}

function resolveDefinitionSafe(key: string) {
  return findEquipmentDefinition(key);
}

export async function loadWorkspace(
  projectId: string,
  levelId?: string,
): Promise<WorkspacePayload | null> {
  const scope = await loadScope(projectId);
  if (!scope) return null;

  const levels = await prisma.level.findMany({
    where: { building: { projectId } },
    orderBy: [{ buildingId: "asc" }, { sortOrder: "asc" }],
  });
  if (levels.length === 0) return null;

  const chosen = levelId ? levels.find((level) => level.id === levelId) : levels[0];
  if (!chosen) return null;
  const levelRow = await prisma.level.findUnique({
    where: { id: chosen.id },
    include: { building: true },
  });
  if (!levelRow) return null;

  const levelEquipment = scope.equipment.filter((item) => item.levelId === chosen.id);
  const levelEquipmentIds = new Set(levelEquipment.map((item) => item.id));
  const levelRooms = scope.rooms.filter((room) => room.levelId === chosen.id);
  const levelWalls = scope.walls.filter((wall) => wall.levelId === chosen.id);
  const levelRoutes = scope.routes.filter((route) => route.levelId === chosen.id);
  const levelTerminals = scope.terminals.filter((terminal) =>
    levelEquipmentIds.has(terminal.equipmentId),
  );
  const levelTerminalIds = new Set(levelTerminals.map((terminal) => terminal.id));
  const levelConnections = scope.connections.filter(
    (connection) =>
      levelTerminalIds.has(connection.fromTerminalId) ||
      levelTerminalIds.has(connection.toTerminalId),
  );

  const validationRows = await prisma.validationResult.findMany({
    where: { projectId },
    orderBy: [{ status: "asc" }, { severity: "asc" }, { ruleId: "asc" }],
  });
  const validations = validationRows.map(serializeValidation);

  const schedule = computeLoadSchedule({
    project: scope.project,
    circuits: scope.circuits,
    equipment: scope.equipment,
    resolveDefinition: resolveDefinitionSafe,
  });
  const takeoff = computeTakeoff({
    project: scope.project,
    circuits: scope.circuits,
    equipment: scope.equipment,
    rooms: scope.rooms,
    routes: scope.routes,
    resolveDefinition: resolveDefinitionSafe,
  });

  const workspace: LevelWorkspace = {
    project: scope.project,
    building: serializeBuilding(levelRow.building),
    level: serializeLevel(levelRow),
    rooms: levelRooms,
    walls: levelWalls,
    equipment: levelEquipment,
    terminals: levelTerminals,
    connections: levelConnections,
    circuits: scope.circuits,
    routes: levelRoutes,
    validations,
  };

  const summary = summarize(validationRows);
  const ruleSet = createRuleSet(scope.project);

  return {
    workspace,
    levels: levels.map((level) => ({
      id: level.id,
      name: level.name,
      elevationMm: level.elevationMm,
      sortOrder: level.sortOrder,
    })),
    stats: {
      rooms: levelRooms.length,
      walls: levelWalls.length,
      equipment: levelEquipment.length,
      circuits: scope.circuits.length,
      routes: levelRoutes.length,
      connections: levelConnections.length,
      errors: summary.errors,
      warnings: summary.warnings,
      infos: summary.infos,
      connectedVA: schedule.totalConnectedVA,
      demandVA: schedule.totalDemandVA,
      installedRoutes: levelRoutes.filter((route) => route.status === "installed").length,
      validatedRoutes: levelRoutes.filter((route) => route.status === "validated").length,
    },
    loadSchedule: schedule,
    takeoff,
    advisory: {
      ruleSetVersion: ruleSet.version,
      jurisdiction: ruleSet.jurisdiction,
      notice: ruleSet.advisoryNotice,
    },
  };
}

export async function loadCableSelection(
  projectId: string,
  circuitId: string,
  conditions: InstallationConditions = DEFAULT_CONDITIONS,
): Promise<CableSelectionResult | null> {
  const scope = await loadScope(projectId);
  if (!scope) return null;
  const circuit = scope.circuitsById.get(circuitId);
  if (!circuit) return null;

  const schedule = computeLoadSchedule({
    project: scope.project,
    circuits: scope.circuits,
    equipment: scope.equipment,
    resolveDefinition: resolveDefinitionSafe,
  });
  const load = schedule.circuits.find((item) => item.circuitId === circuitId);
  const routeLengths = scope.routes
    .filter((route) => route.circuitId === circuitId)
    .map((route) => route.lengthMm);
  const lengthMm = routeLengths.length > 0 ? Math.max(...routeLengths) : 0;
  const limit =
    circuit.voltageDropLimitPct ??
    (circuit.type === "lighting"
      ? scope.project.voltageDropLimitLightingPct
      : scope.project.voltageDropLimitOtherPct);

  const cable = CABLE_TYPES.find((entry) => entry.key === circuit.cableTypeKey);
  if (!cable) return null;

  return selectCable({
    designCurrentA: load?.currentA ?? 0,
    breakerRatingA: circuit.breakerRatingA,
    phaseMode: circuit.phaseMode,
    lengthMm,
    powerFactor: load?.weightedPowerFactor ?? 1,
    maxVoltageDropPct: limit,
    conditions,
    insulation: cable.insulation,
    phaseVoltageV: scope.project.phaseVoltageV,
    lineVoltageV: scope.project.lineVoltageV,
    minimumSectionMm2: 1.5,
  });
}

export async function getProjectRow(projectId: string): Promise<ProjectRow | null> {
  return prisma.project.findUnique({ where: { id: projectId } });
}

export type { CircuitRow };
