import type { Prisma } from "@prisma/client";
import {
  getEquipmentDefinition,
  newId,
  polylineLength,
  type Equipment,
  type Route,
  type RouteDiagnostic,
  type Terminal,
} from "@vectrix/core";
import {
  checkRouteGeometry,
  createRuleSet,
  routeOrthogonal,
  type RoutingWall,
} from "@vectrix/electrical";
import { prisma } from "./db";
import { ApiError } from "./api";
import {
  serializeCircuit,
  serializeEquipment,
  serializeProject,
  serializeRoom,
  serializeRoute,
  serializeTerminal,
  serializeWall,
} from "./serialize";
import type {
  CreateCircuitInput,
  CreateEquipmentInput,
  CreateRouteInput,
} from "./schemas";
import type { z } from "zod";
import type {
  createRoomSchema,
  createWallSchema,
  updateCircuitSchema,
  updateEquipmentSchema,
  updateRouteSchema,
} from "./schemas";

export interface MutationContext {
  projectId: string;
  orgId: string;
  actorId: string;
}

async function audit(
  tx: Prisma.TransactionClient,
  ctx: MutationContext,
  action: string,
  entityType: string,
  entityId: string,
  payload: Record<string, unknown>,
) {
  await tx.auditEvent.create({
    data: {
      id: newId("audit"),
      orgId: ctx.orgId,
      projectId: ctx.projectId,
      actorId: ctx.actorId,
      action,
      entityType,
      entityId,
      payloadJson: JSON.stringify(payload),
    },
  });
}

async function requireLevel(projectId: string, levelId: string) {
  const level = await prisma.level.findFirst({
    where: { id: levelId, building: { projectId } },
    include: { building: true },
  });
  if (!level) throw new ApiError(404, "LEVEL_NOT_FOUND", "Level not found in this project.");
  return level;
}

async function requireCircuit(projectId: string, circuitId: string) {
  const circuit = await prisma.circuit.findFirst({ where: { id: circuitId, projectId } });
  if (!circuit) throw new ApiError(404, "CIRCUIT_NOT_FOUND", "Circuit not found in this project.");
  return circuit;
}

async function requireEquipment(projectId: string, equipmentId: string) {
  const equipment = await prisma.equipment.findFirst({
    where: { id: equipmentId, level: { building: { projectId } } },
    include: { level: true },
  });
  if (!equipment) {
    throw new ApiError(404, "EQUIPMENT_NOT_FOUND", "Equipment not found in this project.");
  }
  return equipment;
}

function assertInsidePlan(
  level: { planWidthMm: number; planHeightMm: number },
  x: number,
  y: number,
) {
  if (x < 0 || y < 0 || x > level.planWidthMm || y > level.planHeightMm) {
    throw new ApiError(
      422,
      "OUTSIDE_PLAN",
      `Position ${x}, ${y} mm is outside the ${level.planWidthMm} × ${level.planHeightMm} mm plan.`,
    );
  }
}

function toRoutingWalls(
  walls: Array<{
    id: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    thicknessMm: number;
    allowPenetration: boolean;
  }>,
): RoutingWall[] {
  return walls.map((wall) => ({
    id: wall.id,
    startX: wall.startX,
    startY: wall.startY,
    endX: wall.endX,
    endY: wall.endY,
    thicknessMm: wall.thicknessMm,
    allowPenetration: wall.allowPenetration,
  }));
}

const BLOCKING_ROUTE_DIAGNOSTICS = new Set([
  "WALL_CROSSING",
  "OUTSIDE_PLAN",
  "DANGLING_ENDPOINT",
  "ROUTE_TOO_SHORT",
  "ZERO_LENGTH_SEGMENT",
  "NO_PATH",
  "GRID_TOO_LARGE",
  "GRID_TOO_FINE",
]);

function blocking(diagnostics: RouteDiagnostic[]) {
  return diagnostics.filter((item) => BLOCKING_ROUTE_DIAGNOSTICS.has(item.code));
}

export async function createEquipment(
  ctx: MutationContext,
  input: CreateEquipmentInput,
): Promise<{ equipment: Equipment; terminals: Terminal[] }> {
  const level = await requireLevel(ctx.projectId, input.levelId);
  assertInsidePlan(level, input.xMm, input.yMm);
  const definition = getEquipmentDefinition(input.definitionKey);

  if (input.roomId) {
    const room = await prisma.room.findFirst({
      where: { id: input.roomId, levelId: input.levelId },
    });
    if (!room) throw new ApiError(404, "ROOM_NOT_FOUND", "Room not found on this level.");
  }
  if (input.circuitId) await requireCircuit(ctx.projectId, input.circuitId);

  const existingLabels = await prisma.equipment.findMany({
    where: { levelId: input.levelId, definitionKey: input.definitionKey },
    select: { label: true },
  });
  const used = new Set(existingLabels.map((row) => row.label));
  let label = input.label;
  if (!label) {
    let index = existingLabels.length + 1;
    while (used.has(`${definition.defaultLabelPrefix}${index}`)) index += 1;
    label = `${definition.defaultLabelPrefix}${index}`;
  }

  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.equipment.create({
      data: {
        id: newId("equipment"),
        levelId: input.levelId,
        roomId: input.roomId ?? null,
        definitionKey: definition.key,
        label,
        xMm: input.xMm,
        yMm: input.yMm,
        rotationDeg: input.rotationDeg,
        mountingHeightMm: input.mountingHeightMm ?? definition.mounting.defaultHeightMm,
        circuitId: input.circuitId,
        phase: input.phase,
        loadVAOverride: input.loadVAOverride,
        powerFactorOverride: input.powerFactorOverride,
        installationState: "planned",
        source: "manual",
        notes: input.notes,
      },
    });

    const terminalRows = definition.terminals.map((terminal) => ({
      id: newId("terminal"),
      equipmentId: row.id,
      designation: terminal.designation,
      function: terminal.function,
      capacity: Math.min(8, terminal.capacity),
    }));
    if (terminalRows.length > 0) await tx.terminal.createMany({ data: terminalRows });

    const terminalRecords = await tx.terminal.findMany({ where: { equipmentId: row.id } });

    await audit(tx, ctx, "equipment.create", "equipment", row.id, {
      definitionKey: definition.key,
      label,
      xMm: input.xMm,
      yMm: input.yMm,
      circuitId: input.circuitId,
    });

    return { row, terminalRecords };
  });

  return {
    equipment: serializeEquipment(result.row),
    terminals: result.terminalRecords.map(serializeTerminal),
  };
}

export async function updateEquipment(
  ctx: MutationContext,
  equipmentId: string,
  input: z.infer<typeof updateEquipmentSchema>,
): Promise<Equipment> {
  const existing = await requireEquipment(ctx.projectId, equipmentId);
  if (input.xMm !== undefined || input.yMm !== undefined) {
    assertInsidePlan(existing.level, input.xMm ?? existing.xMm, input.yMm ?? existing.yMm);
  }
  if (input.roomId) {
    const room = await prisma.room.findFirst({
      where: { id: input.roomId, levelId: existing.levelId },
    });
    if (!room) throw new ApiError(404, "ROOM_NOT_FOUND", "Room not found on this level.");
  }
  if (input.circuitId) await requireCircuit(ctx.projectId, input.circuitId);

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.equipment.update({
      where: { id: equipmentId },
      data: input,
    });
    await audit(tx, ctx, "equipment.update", "equipment", equipmentId, input as Record<string, unknown>);
    return updated;
  });

  return serializeEquipment(row);
}

export async function deleteEquipment(ctx: MutationContext, equipmentId: string): Promise<void> {
  await requireEquipment(ctx.projectId, equipmentId);
  const [routeCount, connectionCount] = await Promise.all([
    prisma.route.count({
      where: { OR: [{ fromEquipmentId: equipmentId }, { toEquipmentId: equipmentId }] },
    }),
    prisma.connection.count({
      where: {
        OR: [
          { fromTerminal: { equipmentId } },
          { toTerminal: { equipmentId } },
        ],
      },
    }),
  ]);
  if (routeCount > 0 || connectionCount > 0) {
    throw new ApiError(
      409,
      "EQUIPMENT_IN_USE",
      `Equipment is referenced by ${routeCount} route(s) and ${connectionCount} connection(s). Remove those references before deleting it.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.equipment.delete({ where: { id: equipmentId } });
    await audit(tx, ctx, "equipment.delete", "equipment", equipmentId, {});
  });
}

export async function createCircuit(ctx: MutationContext, input: CreateCircuitInput) {
  if (input.boardEquipmentId) {
    const board = await requireEquipment(ctx.projectId, input.boardEquipmentId);
    const definition = getEquipmentDefinition(board.definitionKey);
    if (definition.category !== "distribution_board") {
      throw new ApiError(422, "NOT_A_BOARD", "The selected equipment is not a distribution board.");
    }
  }
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.circuit.create({
      data: {
        id: newId("circuit"),
        projectId: ctx.projectId,
        boardEquipmentId: input.boardEquipmentId,
        name: input.name,
        description: input.description,
        type: input.type,
        phaseMode: input.phaseMode,
        breakerRatingA: input.breakerRatingA,
        breakerCurve: input.breakerCurve,
        rcdSensitivityMa: input.rcdSensitivityMa,
        rcdRatingA: input.rcdRatingA,
        cableTypeKey: input.cableTypeKey,
        cableSectionMm2: input.cableSectionMm2,
        demandFactor: input.demandFactor,
        voltageDropLimitPct: input.voltageDropLimitPct,
        color: input.color,
        notes: input.notes,
      },
    });
    await audit(tx, ctx, "circuit.create", "circuit", created.id, {
      name: input.name,
      type: input.type,
      breakerRatingA: input.breakerRatingA,
    });
    return created;
  });
  return serializeCircuit(row);
}

export async function updateCircuit(
  ctx: MutationContext,
  circuitId: string,
  input: z.infer<typeof updateCircuitSchema>,
) {
  await requireCircuit(ctx.projectId, circuitId);
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.circuit.update({ where: { id: circuitId }, data: input });
    await audit(tx, ctx, "circuit.update", "circuit", circuitId, input as Record<string, unknown>);
    return updated;
  });
  return serializeCircuit(row);
}

export async function createRoom(
  ctx: MutationContext,
  input: z.infer<typeof createRoomSchema>,
) {
  const level = await requireLevel(ctx.projectId, input.levelId);
  for (const point of input.polygon) assertInsidePlan(level, point.x, point.y);
  const area =
    Math.abs(
      input.polygon.reduce((sum, point, index) => {
        const next = input.polygon[(index + 1) % input.polygon.length]!;
        return sum + point.x * next.y - next.x * point.y;
      }, 0),
    ) / 2;
  if (area < 100_000) {
    throw new ApiError(422, "ROOM_TOO_SMALL", "Room area must be at least 0.1 m².");
  }

  const roomCount = await prisma.room.count({ where: { levelId: input.levelId } });
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.room.create({
      data: {
        id: newId("room"),
        levelId: input.levelId,
        name: input.name,
        number: input.number || String(roomCount + 1).padStart(2, "0"),
        polygonJson: JSON.stringify(input.polygon),
        clearHeightMm: input.clearHeightMm,
        occupancy: input.occupancy,
        notes: input.notes,
      },
    });
    await audit(tx, ctx, "room.create", "room", created.id, {
      name: input.name,
      areaMm2: Math.round(area),
    });
    return created;
  });
  return serializeRoom(row);
}

export async function createWall(
  ctx: MutationContext,
  input: z.infer<typeof createWallSchema>,
) {
  const level = await requireLevel(ctx.projectId, input.levelId);
  assertInsidePlan(level, input.start.x, input.start.y);
  assertInsidePlan(level, input.end.x, input.end.y);
  if (input.start.x === input.end.x && input.start.y === input.end.y) {
    throw new ApiError(422, "ZERO_LENGTH_WALL", "A wall needs two distinct endpoints.");
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.wall.create({
      data: {
        id: newId("wall"),
        levelId: input.levelId,
        startX: input.start.x,
        startY: input.start.y,
        endX: input.end.x,
        endY: input.end.y,
        thicknessMm: input.thicknessMm,
        heightMm: input.heightMm,
        kind: input.kind,
        material: input.material,
        loadBearing: input.loadBearing,
        allowPenetration: input.allowPenetration,
      },
    });
    await audit(tx, ctx, "wall.create", "wall", created.id, {
      start: input.start,
      end: input.end,
      thicknessMm: input.thicknessMm,
      allowPenetration: input.allowPenetration,
    });
    return created;
  });
  return serializeWall(row);
}

async function levelContext(projectId: string, levelId: string) {
  const level = await requireLevel(projectId, levelId);
  const [walls, equipment] = await Promise.all([
    prisma.wall.findMany({ where: { levelId } }),
    prisma.equipment.findMany({ where: { levelId } }),
  ]);
  return { level, walls, equipment };
}

export async function createRoute(
  ctx: MutationContext,
  input: CreateRouteInput,
): Promise<Route> {
  const context = await levelContext(ctx.projectId, input.levelId);
  if (input.circuitId) await requireCircuit(ctx.projectId, input.circuitId);

  let from = null as Awaited<ReturnType<typeof requireEquipment>> | null;
  let to = null as Awaited<ReturnType<typeof requireEquipment>> | null;
  if (input.fromEquipmentId) from = await requireEquipment(ctx.projectId, input.fromEquipmentId);
  if (input.toEquipmentId) to = await requireEquipment(ctx.projectId, input.toEquipmentId);
  if (from && from.levelId !== input.levelId) {
    throw new ApiError(422, "CROSS_LEVEL_ROUTE", "Route endpoints must be on the same level.");
  }
  if (to && to.levelId !== input.levelId) {
    throw new ApiError(422, "CROSS_LEVEL_ROUTE", "Route endpoints must be on the same level.");
  }

  let points = input.points;
  if (!points) {
    if (!from || !to) {
      throw new ApiError(
        422,
        "ROUTE_ENDPOINTS_REQUIRED",
        "Provide route points or both a source and destination equipment.",
      );
    }
    const routing = routeOrthogonal({
      bounds: {
        minX: 0,
        minY: 0,
        maxX: context.level.planWidthMm,
        maxY: context.level.planHeightMm,
      },
      walls: toRoutingWalls(context.walls),
      start: { x: from.xMm, y: from.yMm },
      end: { x: to.xMm, y: to.yMm },
      options: { gridMm: 250, clearanceMm: 50, turnPenaltyMm: 400, maxCells: 120_000 },
    });
    if (!routing.feasible) {
      throw new ApiError(
        422,
        "ROUTE_INFEASIBLE",
        "No orthogonal path was found at the configured clearance. Draw the route manually or revise the walls.",
        routing.diagnostics,
      );
    }
    points = routing.points;
  }

  const anchors = context.equipment.map((item) => ({
    id: item.id,
    point: { x: item.xMm, y: item.yMm },
  }));
  const diagnostics = checkRouteGeometry({
    points,
    bounds: {
      minX: 0,
      minY: 0,
      maxX: context.level.planWidthMm,
      maxY: context.level.planHeightMm,
    },
    walls: toRoutingWalls(context.walls),
    anchors,
    anchorToleranceMm: 300,
  });
  if (blocking(diagnostics).length > 0) {
    throw new ApiError(
      422,
      "ROUTE_NOT_ACCEPTABLE",
      "The route does not satisfy the geometric constraints. Review the diagnostics before saving it.",
      diagnostics,
    );
  }

  const circuit = input.circuitId ? await requireCircuit(ctx.projectId, input.circuitId) : null;
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.route.create({
      data: {
        id: newId("route"),
        projectId: ctx.projectId,
        levelId: input.levelId,
        circuitId: input.circuitId,
        fromEquipmentId: input.fromEquipmentId,
        toEquipmentId: input.toEquipmentId,
        status: input.status,
        method: "conduit_recessed",
        conduitKey: input.conduitKey,
        cableTypeKey: circuit?.cableTypeKey ?? null,
        pointsJson: JSON.stringify(points),
        lengthMm: polylineLength(points),
        slackPercent: input.slackPercent,
        diagnosticsJson: JSON.stringify(diagnostics),
        notes: input.notes,
        createdBy: ctx.actorId,
      },
    });
    await audit(tx, ctx, "route.create", "route", created.id, {
      circuitId: input.circuitId,
      status: input.status,
      points: points.length,
      lengthMm: Math.round(polylineLength(points)),
    });
    return created;
  });

  return serializeRoute(row);
}

export async function updateRoute(
  ctx: MutationContext,
  routeId: string,
  input: z.infer<typeof updateRouteSchema>,
): Promise<Route> {
  const existing = await prisma.route.findFirst({
    where: { id: routeId, projectId: ctx.projectId },
  });
  if (!existing) throw new ApiError(404, "ROUTE_NOT_FOUND", "Route not found in this project.");
  if (input.circuitId) await requireCircuit(ctx.projectId, input.circuitId);

  const level = await requireLevel(ctx.projectId, existing.levelId);
  const [walls, equipment] = await Promise.all([
    prisma.wall.findMany({ where: { levelId: existing.levelId } }),
    prisma.equipment.findMany({ where: { levelId: existing.levelId } }),
  ]);

  const points = input.points;
  let diagnostics: RouteDiagnostic[] | undefined;
  if (points) {
    diagnostics = checkRouteGeometry({
      points,
      bounds: { minX: 0, minY: 0, maxX: level.planWidthMm, maxY: level.planHeightMm },
      walls: toRoutingWalls(walls),
      anchors: equipment.map((item) => ({
        id: item.id,
        point: { x: item.xMm, y: item.yMm },
      })),
      anchorToleranceMm: 300,
    });
    if (blocking(diagnostics).length > 0) {
      throw new ApiError(
        422,
        "ROUTE_NOT_ACCEPTABLE",
        "The edited route does not satisfy the geometric constraints.",
        diagnostics,
      );
    }
  }

  const geometryChanged = Boolean(points);
  const status =
    geometryChanged && (existing.status === "validated" || existing.status === "installed")
      ? "proposed"
      : existing.status;
  const circuit = input.circuitId ? await requireCircuit(ctx.projectId, input.circuitId) : null;

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.route.update({
      where: { id: routeId },
      data: {
        ...input,
        ...(points
          ? {
              pointsJson: JSON.stringify(points),
              lengthMm: polylineLength(points),
              diagnosticsJson: JSON.stringify(diagnostics ?? []),
              validatedAt: null,
              validatedRuleSetVersion: null,
            }
          : {}),
        ...(input.circuitId !== undefined ? { cableTypeKey: circuit?.cableTypeKey ?? null } : {}),
        ...(geometryChanged ? { status } : {}),
      },
    });
    await audit(tx, ctx, "route.update", "route", routeId, {
      ...input,
      points: points?.length,
      demotedToProposed: geometryChanged && existing.status !== "proposed",
    });
    return updated;
  });

  return serializeRoute(row);
}

const ROUTE_TRANSITIONS: Record<string, string[]> = {
  visual: ["visual", "proposed"],
  proposed: ["proposed", "visual", "validated"],
  validated: ["validated", "proposed", "installed"],
  installed: ["installed"],
};

export async function setRouteStatus(
  ctx: MutationContext,
  routeId: string,
  target: "visual" | "proposed" | "validated" | "installed",
): Promise<Route> {
  const existing = await prisma.route.findFirst({
    where: { id: routeId, projectId: ctx.projectId },
    include: { circuit: true },
  });
  if (!existing) throw new ApiError(404, "ROUTE_NOT_FOUND", "Route not found in this project.");
  if (!ROUTE_TRANSITIONS[existing.status]?.includes(target)) {
    throw new ApiError(
      409,
      "INVALID_ROUTE_TRANSITION",
      `A route cannot move from ${existing.status} to ${target}.`,
    );
  }

  let diagnostics: RouteDiagnostic[] | null = null;
  if (target === "validated") {
    const level = await requireLevel(ctx.projectId, existing.levelId);
    const [walls, equipment, projectRow] = await Promise.all([
      prisma.wall.findMany({ where: { levelId: existing.levelId } }),
      prisma.equipment.findMany({ where: { levelId: existing.levelId } }),
      prisma.project.findUniqueOrThrow({ where: { id: ctx.projectId } }),
    ]);
    const points = JSON.parse(existing.pointsJson) as Array<{ x: number; y: number }>;
    diagnostics = checkRouteGeometry({
      points,
      bounds: { minX: 0, minY: 0, maxX: level.planWidthMm, maxY: level.planHeightMm },
      walls: toRoutingWalls(walls),
      anchors: equipment.map((item) => ({
        id: item.id,
        point: { x: item.xMm, y: item.yMm },
      })),
      anchorToleranceMm: 300,
    });
    const blockers = blocking(diagnostics);
    if (blockers.length > 0) {
      throw new ApiError(
        422,
        "ROUTE_VALIDATION_FAILED",
        "The route cannot be marked validated because its geometry has blocking diagnostics.",
        blockers,
      );
    }
    if (!existing.circuitId) {
      throw new ApiError(
        422,
        "ROUTE_WITHOUT_CIRCUIT",
        "Assign the route to a circuit before marking it validated.",
      );
    }
    const ruleSet = createRuleSet(serializeProject(projectRow));
    const routeDiagnostics = diagnostics;

    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.route.update({
        where: { id: routeId },
        data: {
          status: target,
          validatedAt: new Date(),
          validatedRuleSetVersion: ruleSet.version,
          diagnosticsJson: JSON.stringify(routeDiagnostics),
        },
      });
      await audit(tx, ctx, "route.validate", "route", routeId, {
        ruleSetVersion: ruleSet.version,
        diagnostics: routeDiagnostics.length,
      });
      return updated;
    });
    return serializeRoute(row);
  }

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.route.update({
      where: { id: routeId },
      data: {
        status: target,
        ...(target === "proposed"
          ? { validatedAt: null, validatedRuleSetVersion: null }
          : {}),
        ...(target === "installed" ? { status: "installed" } : {}),
      },
    });
    await audit(tx, ctx, "route.status", "route", routeId, { from: existing.status, to: target });
    return updated;
  });
  return serializeRoute(row);
}

export async function resolveValidation(
  ctx: MutationContext,
  validationId: string,
  status: "open" | "acknowledged" | "accepted_risk" | "resolved",
) {
  const existing = await prisma.validationResult.findFirst({
    where: { id: validationId, projectId: ctx.projectId },
  });
  if (!existing) {
    throw new ApiError(404, "VALIDATION_NOT_FOUND", "Validation result not found in this project.");
  }
  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.validationResult.update({
      where: { id: validationId },
      data: {
        status,
        decidedAt: status === "open" ? null : new Date(),
        decidedBy: status === "open" ? null : ctx.actorId,
        resolvedAt: status === "resolved" ? new Date() : null,
        resolvedBy: status === "resolved" ? ctx.actorId : null,
      },
    });
    await audit(tx, ctx, "validation.status", "validation", validationId, {
      from: existing.status,
      to: status,
      ruleId: existing.ruleId,
    });
    return updated;
  });
  return row;
}
