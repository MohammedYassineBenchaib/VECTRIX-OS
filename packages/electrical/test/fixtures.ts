import {
  fixtureId,
  getEquipmentDefinition,
  type Circuit,
  type Connection,
  type Equipment,
  type Project,
  type Room,
  type Route,
  type Terminal,
  type Wall,
  rectPolygon,
} from "@vectrix/core";

export const TEST_DATE = new Date("2026-10-01T09:00:00.000Z");

export function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: fixtureId("project", "test-project"),
    orgId: fixtureId("organization", "test-org"),
    name: "Apartamento T2 — Rua das Flores",
    code: "VX-001",
    clientName: "Cliente de teste",
    address: "Lisboa",
    country: "PT",
    jurisdiction: "PT",
    supplyPresetKey: "PT-LV-230-400",
    phaseVoltageV: 230,
    lineVoltageV: 400,
    frequencyHz: 50,
    earthingSystem: "TT",
    voltageDropLimitLightingPct: 3,
    voltageDropLimitOtherPct: 5,
    status: "design",
    createdAt: TEST_DATE,
    updatedAt: TEST_DATE,
    createdBy: fixtureId("user", "engineer"),
    notes: "",
    ...overrides,
  };
}

export function makeRoom(overrides: Partial<Room> & Pick<Room, "id">): Room {
  return {
    levelId: fixtureId("level", "level-0"),
    name: "Sala",
    number: "01",
    polygon: rectPolygon(0, 0, 5000, 4000),
    clearHeightMm: 2700,
    occupancy: "dry",
    notes: "",
    ...overrides,
  };
}

export function makeCircuit(overrides: Partial<Circuit> = {}): Circuit {
  return {
    id: fixtureId("circuit", "C1"),
    projectId: fixtureId("project", "test-project"),
    boardEquipmentId: fixtureId("equipment", "board"),
    name: "C1 — Tomadas sala",
    description: "",
    type: "sockets",
    phaseMode: "single_phase",
    breakerRatingA: 16,
    breakerCurve: "C",
    rcdSensitivityMa: 30,
    rcdRatingA: 40,
    cableTypeKey: "h07v-u",
    cableSectionMm2: 2.5,
    demandFactor: 1,
    voltageDropLimitPct: null,
    color: "#4f8cff",
    notes: "",
    createdAt: TEST_DATE,
    updatedAt: TEST_DATE,
    ...overrides,
  };
}

export function makeEquipment(overrides: Partial<Equipment> & Pick<Equipment, "id">): Equipment {
  const definitionKey = overrides.definitionKey ?? "socket-schuko-16a-2p-e";
  return {
    levelId: fixtureId("level", "level-0"),
    roomId: fixtureId("room", "living"),
    definitionKey,
    label: overrides.id.replace(/^eq_/, "").toUpperCase(),
    xMm: 2000,
    yMm: 2000,
    rotationDeg: 0,
    mountingHeightMm: getEquipmentDefinition(definitionKey).mounting.defaultHeightMm,
    circuitId: fixtureId("circuit", "C1"),
    phase: null,
    loadVAOverride: null,
    powerFactorOverride: null,
    installationState: "planned",
    source: "manual",
    notes: "",
    createdAt: TEST_DATE,
    updatedAt: TEST_DATE,
    ...overrides,
  };
}

export function terminalsFor(equipment: Equipment): Terminal[] {
  const definition = getEquipmentDefinition(equipment.definitionKey);
  return definition.terminals.map((terminal) => ({
    id: fixtureId("terminal", `${equipment.id}-${terminal.designation}`),
    equipmentId: equipment.id,
    designation: terminal.designation,
    function: terminal.function,
    capacity: terminal.capacity,
  }));
}

export function makeConnection(
  fromTerminalId: string,
  toTerminalId: string,
  overrides: Partial<Connection> = {},
): Connection {
  return {
    id: fixtureId("connection", `${fromTerminalId}-${toTerminalId}`),
    fromTerminalId,
    toTerminalId,
    kind: "line",
    notes: "",
    createdAt: TEST_DATE,
    ...overrides,
  };
}

export function makeWall(overrides: Partial<Wall> & Pick<Wall, "id">): Wall {
  return {
    levelId: fixtureId("level", "level-0"),
    startX: 0,
    startY: 0,
    endX: 5000,
    endY: 0,
    thicknessMm: 150,
    heightMm: 2700,
    kind: "interior",
    material: "masonry",
    loadBearing: false,
    allowPenetration: false,
    ...overrides,
  };
}

export function makeRoute(overrides: Partial<Route> & Pick<Route, "id">): Route {
  const points = overrides.points ?? [
    { x: 500, y: 500 },
    { x: 2000, y: 500 },
    { x: 2000, y: 2000 },
  ];
  return {
    levelId: fixtureId("level", "level-0"),
    circuitId: fixtureId("circuit", "C1"),
    fromEquipmentId: fixtureId("equipment", "board"),
    toEquipmentId: fixtureId("equipment", "s1"),
    status: "proposed",
    method: "conduit_recessed",
    conduitKey: "pvc-20",
    cableTypeKey: "h07v-u",
    points,
    lengthMm:
      points.reduce((sum, point, index) => {
        if (index === 0) return 0;
        const previous = points[index - 1]!;
        return sum + Math.hypot(point.x - previous.x, point.y - previous.y);
      }, 0) || 0,
    slackPercent: 10,
    diagnostics: [],
    notes: "",
    createdAt: TEST_DATE,
    createdBy: fixtureId("user", "engineer"),
    validatedAt: null,
    validatedRuleSetVersion: null,
    ...overrides,
  };
}
