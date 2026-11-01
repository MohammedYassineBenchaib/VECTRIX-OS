import type { Prisma } from "@prisma/client";
import {
  getEquipmentDefinition,
  newId,
  polylineLength,
  type EquipmentDefinition,
} from "@vectrix/core";
import { checkRouteGeometry } from "@vectrix/electrical";
import { DEMO_LAYOUT, type DemoLayout } from "./demo-layout";

/**
 * Creates a complete design from a declarative layout.
 *
 * Everything is inserted inside the caller's transaction, so a project is either
 * fully materialised or not created at all. Equipment ids are generated first
 * and terminals are inserted in bulk; the connection map is then resolved from
 * those deterministic-in-this-run ids instead of relying on database order.
 */

export interface MaterializeOptions {
  orgId: string;
  userId: string;
  projectId: string;
  name?: string;
  code?: string;
  clientName?: string;
  address?: string;
}

export interface MaterializedProject {
  buildingId: string;
  levelId: string;
  roomIds: Map<string, string>;
  equipmentIds: Map<string, string>;
}

function routeDiagnostics(
  layout: DemoLayout,
  equipmentIds: Map<string, string>,
  equipmentPoints: Array<{ id: string; point: { x: number; y: number } }>,
) {
  const walls = layout.walls.map((wall, index) => ({
    id: `wal_preview_${index}`,
    startX: wall.start.x,
    startY: wall.start.y,
    endX: wall.end.x,
    endY: wall.end.y,
    thicknessMm: wall.thicknessMm,
    allowPenetration: wall.allowPenetration,
  }));

  return new Map(
    layout.routes.map((route) => [
      route.key,
      checkRouteGeometry({
        points: route.points,
        bounds: { minX: 0, minY: 0, maxX: layout.widthMm, maxY: layout.heightMm },
        walls,
        anchors: equipmentPoints,
        anchorToleranceMm: 300,
      }),
    ]),
  );
}

export async function materializeDemoProject(
  tx: Prisma.TransactionClient,
  options: MaterializeOptions,
): Promise<MaterializedProject> {
  const layout = DEMO_LAYOUT;
  const buildingId = newId("building");
  const levelId = newId("level");

  await tx.building.create({
    data: {
      id: buildingId,
      projectId: options.projectId,
      name: "Edifício principal",
      address: options.address ?? layout.address,
    },
  });

  await tx.level.create({
    data: {
      id: levelId,
      buildingId,
      name: "Piso 0",
      elevationMm: 0,
      planWidthMm: layout.widthMm,
      planHeightMm: layout.heightMm,
      sortOrder: 0,
      notes: "Plano de demonstração. Cotas em milímetros.",
    },
  });

  const roomIds = new Map<string, string>();
  await tx.room.createMany({
    data: layout.rooms.map((room) => {
      const id = newId("room");
      roomIds.set(room.key, id);
      return {
        id,
        levelId,
        name: room.name,
        number: room.number,
        polygonJson: JSON.stringify(room.polygon),
        clearHeightMm: room.clearHeightMm,
        occupancy: room.occupancy,
      };
    }),
  });

  await tx.wall.createMany({
    data: layout.walls.map((wall) => ({
      id: newId("wall"),
      levelId,
      startX: wall.start.x,
      startY: wall.start.y,
      endX: wall.end.x,
      endY: wall.end.y,
      thicknessMm: wall.thicknessMm,
      heightMm: wall.heightMm,
      kind: wall.kind,
      material: wall.material,
      loadBearing: wall.loadBearing,
      allowPenetration: wall.allowPenetration,
    })),
  });

  const circuitIds = new Map<string, string>();
  await tx.circuit.createMany({
    data: layout.circuits.map((circuit) => {
      const id = newId("circuit");
      circuitIds.set(circuit.key, id);
      return {
        id,
        projectId: options.projectId,
        name: circuit.name,
        description: circuit.description,
        type: circuit.type,
        phaseMode: circuit.phaseMode,
        breakerRatingA: circuit.breakerRatingA,
        breakerCurve: circuit.breakerCurve,
        rcdSensitivityMa: circuit.rcdSensitivityMa,
        rcdRatingA: circuit.rcdRatingA,
        cableTypeKey: circuit.cableTypeKey,
        cableSectionMm2: circuit.cableSectionMm2,
        demandFactor: circuit.demandFactor,
        voltageDropLimitPct: circuit.voltageDropLimitPct,
        color: circuit.color,
        notes: circuit.notes,
      };
    }),
  });

  const board = layout.equipment.find((item) => item.key === "board");
  if (!board) throw new Error("Demo layout is missing its distribution board.");
  const boardId = newId("equipment");
  const equipmentIds = new Map<string, string>([[board.key, boardId]]);

  const equipmentRows: Prisma.EquipmentCreateManyInput[] = [
    {
      id: boardId,
      levelId,
      roomId: roomIds.get(board.roomKey) ?? null,
      definitionKey: board.definitionKey,
      label: board.label,
      xMm: board.xMm,
      yMm: board.yMm,
      rotationDeg: board.rotationDeg ?? 0,
      mountingHeightMm: board.mountingHeightMm,
      circuitId: null,
      phase: null,
      installationState: "planned",
      source: "manual",
      notes: "Board position is a schematic origin, not a construction setting-out point.",
    },
  ];

  for (const item of layout.equipment) {
    if (item.key === "board") continue;
    const id = newId("equipment");
    equipmentIds.set(item.key, id);
    equipmentRows.push({
      id,
      levelId,
      roomId: roomIds.get(item.roomKey) ?? null,
      definitionKey: item.definitionKey,
      label: item.label,
      xMm: item.xMm,
      yMm: item.yMm,
      rotationDeg: item.rotationDeg ?? 0,
      mountingHeightMm: item.mountingHeightMm,
      circuitId: item.circuitKey ? (circuitIds.get(item.circuitKey) ?? null) : null,
      phase: item.phase ?? (item.circuitKey ? "L1" : null),
      installationState: "planned",
      source: "manual",
      notes: "",
    });
  }

  await tx.equipment.createMany({ data: equipmentRows });

  // Board references exist before circuits can point at it.
  for (const circuit of layout.circuits) {
    await tx.circuit.update({
      where: { id: circuitIds.get(circuit.key)! },
      data: { boardEquipmentId: boardId },
    });
  }

  const terminalRows: Prisma.TerminalCreateManyInput[] = [];
  const terminalIds = new Map<string, string>();
  for (const item of layout.equipment) {
    const equipmentId = equipmentIds.get(item.key);
    if (!equipmentId) continue;
    let definition: EquipmentDefinition;
    try {
      definition = getEquipmentDefinition(item.definitionKey);
    } catch {
      continue;
    }
    for (const terminal of definition.terminals) {
      const id = newId("terminal");
      terminalIds.set(`${item.key}:${terminal.designation}`, id);
      terminalRows.push({
        id,
        equipmentId,
        designation: terminal.designation,
        function: terminal.function,
        capacity: Math.min(8, terminal.capacity),
      });
    }
  }
  await tx.terminal.createMany({ data: terminalRows });

  const connectionRows: Prisma.ConnectionCreateManyInput[] = layout.connections.map(
    (connection) => {
      const from = terminalIds.get(
        `${connection.fromEquipmentKey}:${connection.fromDesignation}`,
      );
      const to = terminalIds.get(`${connection.toEquipmentKey}:${connection.toDesignation}`);
      if (!from || !to) {
        throw new Error(
          `Demo connection references an unknown terminal: ${connection.fromEquipmentKey}:${connection.fromDesignation} → ${connection.toEquipmentKey}:${connection.toDesignation}`,
        );
      }
      return {
        id: newId("connection"),
        projectId: options.projectId,
        fromTerminalId: from,
        toTerminalId: to,
        kind: connection.kind,
        notes: "Recorded during demo materialisation; topology coverage is intentionally partial.",
      };
    },
  );
  if (connectionRows.length > 0) await tx.connection.createMany({ data: connectionRows });

  const equipmentPoints = layout.equipment.map((item) => ({
    id: equipmentIds.get(item.key)!,
    point: { x: item.xMm, y: item.yMm },
  }));
  const diagnosticsByRoute = routeDiagnostics(layout, equipmentIds, equipmentPoints);

  await tx.route.createMany({
    data: layout.routes.map((route) => ({
      id: newId("route"),
      projectId: options.projectId,
      levelId,
      circuitId: route.circuitKey ? (circuitIds.get(route.circuitKey) ?? null) : null,
      fromEquipmentId: boardId,
      toEquipmentId: equipmentIds.get(route.toEquipmentKey) ?? null,
      status: route.status,
      method: "conduit_recessed",
      conduitKey: route.conduitKey,
      cableTypeKey:
        layout.circuits.find((circuit) => circuit.key === route.circuitKey)?.cableTypeKey ?? null,
      pointsJson: JSON.stringify(route.points),
      lengthMm: polylineLength(route.points),
      slackPercent: route.slackPercent,
      diagnosticsJson: JSON.stringify(diagnosticsByRoute.get(route.key) ?? []),
      notes: route.notes,
      createdBy: options.userId,
    })),
  });

  return { buildingId, levelId, roomIds, equipmentIds };
}

export async function materializeEmptyProject(
  tx: Prisma.TransactionClient,
  options: MaterializeOptions,
  plan: { widthMm: number; heightMm: number } = { widthMm: 12_000, heightMm: 9_000 },
) {
  const buildingId = newId("building");
  const levelId = newId("level");
  await tx.building.create({
    data: {
      id: buildingId,
      projectId: options.projectId,
      name: "Edifício principal",
      address: options.address ?? "",
    },
  });
  await tx.level.create({
    data: {
      id: levelId,
      buildingId,
      name: "Piso 0",
      elevationMm: 0,
      planWidthMm: plan.widthMm,
      planHeightMm: plan.heightMm,
      sortOrder: 0,
      notes: "Plano vazio. Defina salas e paredes antes de calcular.",
    },
  });
  return { buildingId, levelId, roomIds: new Map(), equipmentIds: new Map() };
}
