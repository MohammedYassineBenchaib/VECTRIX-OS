import { describe, expect, it } from "vitest";
import {
  fixtureId,
  getEquipmentDefinition,
  type Terminal,
} from "@vectrix/core";
import { validateElectrical, type ValidationInput } from "../src/validation";
import { computeTakeoff, takeoffToCsv } from "../src/takeoff";
import {
  makeCircuit,
  makeConnection,
  makeEquipment,
  makeProject,
  makeRoom,
  makeRoute,
  makeWall,
  terminalsFor,
} from "./fixtures";
import { computeLoadSchedule } from "../src/loads";

const board = makeEquipment({
  id: fixtureId("equipment", "board"),
  definitionKey: "distribution-board-12way",
  label: "DB",
  xMm: 500,
  yMm: 500,
  circuitId: null,
  roomId: fixtureId("room", "living"),
});

const socket = makeEquipment({
  id: fixtureId("equipment", "s1"),
  definitionKey: "socket-schuko-16a-2p-e",
  label: "S1",
  xMm: 2000,
  yMm: 2000,
  circuitId: fixtureId("circuit", "C1"),
});

const living = makeRoom({ id: fixtureId("room", "living"), name: "Sala" });

function baseInput(overrides: Partial<ValidationInput> = {}): ValidationInput {
  return {
    project: makeProject(),
    circuits: [makeCircuit()],
    equipment: [board, socket],
    rooms: [living],
    walls: [],
    routes: [makeRoute({ id: fixtureId("route", "r1") })],
    connections: [],
    terminals: [],
    ...overrides,
  };
}

function ruleIds(input: ValidationInput): string[] {
  return validateElectrical(input).map((finding) => finding.ruleId);
}

describe("electrical validation", () => {
  it("accepts a coherent socket circuit with only advisory information", () => {
    const findings = validateElectrical(baseInput());
    const blocking = findings.filter((finding) => finding.severity !== "info");
    expect(blocking).toEqual([]);
    expect(findings.some((finding) => finding.ruleId === "VX-EL-025")).toBe(true);
    expect(findings.some((finding) => finding.ruleId === "VX-EL-009")).toBe(true);
  });

  it("reports a missing distribution board", () => {
    expect(ruleIds(baseInput({ equipment: [socket] }))).toContain("VX-EL-001");
  });

  it("reports a breaker that is undersized for the demand current", () => {
    const heavy = makeEquipment({
      id: fixtureId("equipment", "cooker"),
      definitionKey: "cooker-32a",
      xMm: 2500,
      yMm: 2000,
      loadVAOverride: 5000,
      circuitId: fixtureId("circuit", "C1"),
    });
    const findings = validateElectrical(baseInput({ equipment: [board, heavy] }));
    const undersized = findings.find((finding) => finding.ruleId === "VX-EL-004");
    expect(undersized?.severity).toBe("error");
    expect(undersized?.details.designCurrentA).toBeGreaterThan(16);
  });

  it("reports insufficient derated cable ampacity", () => {
    const findings = validateElectrical(
      baseInput({
        circuits: [makeCircuit({ cableSectionMm2: 1.5 })],
        conditions: { ambientTempC: 40, groupedCircuits: 2, thermalInsulationFactor: 1 },
      }),
    );
    const finding = findings.find((item) => item.ruleId === "VX-EL-006");
    expect(finding?.severity).toBe("error");
    expect(Number(finding?.details.deratedAmpacityA)).toBeLessThan(16);
  });

  it("reports voltage drop over the project limit", () => {
    const longRoute = makeRoute({
      id: fixtureId("route", "long"),
      points: [
        { x: 500, y: 500 },
        { x: 500, y: 2000 },
        { x: 2000, y: 2000 },
      ],
      lengthMm: 60_000,
    });
    const findings = validateElectrical(baseInput({ routes: [longRoute] }));
    const finding = findings.find((item) => item.ruleId === "VX-EL-005");
    expect(finding?.severity).toBe("warning");
    expect(Number(finding?.details.voltageDropPct)).toBeGreaterThan(5);
  });

  it("reports a socket circuit without a 30 mA RCD", () => {
    const findings = validateElectrical(
      baseInput({ circuits: [makeCircuit({ rcdSensitivityMa: null })] }),
    );
    expect(findings.some((finding) => finding.ruleId === "VX-EL-007")).toBe(true);
  });

  it("reports equipment that is outside its assigned room", () => {
    const outside = { ...socket, xMm: 8000, yMm: 8000 };
    const findings = validateElectrical(baseInput({ equipment: [board, outside] }));
    const finding = findings.find((item) => item.ruleId === "VX-EL-010");
    expect(finding?.message).toContain("outside that room");
  });

  it("reports load-bearing equipment without a circuit", () => {
    const findings = validateElectrical(
      baseInput({ equipment: [board, { ...socket, circuitId: null }] }),
    );
    expect(findings.some((finding) => finding.ruleId === "VX-EL-002")).toBe(true);
  });

  it("reports a mounting height outside the product's advisory range", () => {
    const findings = validateElectrical(
      baseInput({ equipment: [board, { ...socket, mountingHeightMm: 1600 }] }),
    );
    expect(findings.some((finding) => finding.ruleId === "VX-EL-011")).toBe(true);
  });

  it("reports duplicate circuit names", () => {
    const findings = validateElectrical(
      baseInput({
        circuits: [
          makeCircuit(),
          makeCircuit({ id: fixtureId("circuit", "C2"), name: "C1 — Tomadas sala" }),
        ],
      }),
    );
    expect(findings.filter((finding) => finding.ruleId === "VX-EL-012")).toHaveLength(2);
  });

  it("reports an earth terminal that has no recorded connection", () => {
    const boardTerminals = terminalsFor(board);
    const socketTerminals = terminalsFor(socket);
    const boardL = boardTerminals.find((terminal) => terminal.designation === "L1")!;
    const socketL = socketTerminals.find((terminal) => terminal.designation === "L")!;
    const socketN = socketTerminals.find((terminal) => terminal.designation === "N")!;
    const boardN = boardTerminals.find((terminal) => terminal.designation === "N")!;
    const findings = validateElectrical(
      baseInput({
        terminals: [...boardTerminals, ...socketTerminals],
        connections: [makeConnection(socketL.id, boardL.id), makeConnection(socketN.id, boardN.id)],
      }),
    );
    const earth = findings.find(
      (finding) => finding.ruleId === "VX-EL-009" && finding.entityId === socket.id,
    );
    expect(earth?.severity).toBe("warning");
    expect(earth?.message).toContain("Earth continuity");
  });

  it("treats earth continuity as satisfied when the PE terminal is connected", () => {
    const boardTerminals = terminalsFor(board);
    const socketTerminals = terminalsFor(socket);
    const connect = (a: Terminal[], da: string, b: Terminal[], db: string) =>
      makeConnection(
        a.find((terminal) => terminal.designation === da)!.id,
        b.find((terminal) => terminal.designation === db)!.id,
      );
    const connections = [
      connect(socketTerminals, "L", boardTerminals, "L1"),
      connect(socketTerminals, "N", boardTerminals, "N"),
      connect(socketTerminals, "PE", boardTerminals, "PE"),
    ];
    const findings = validateElectrical(
      baseInput({ terminals: [...boardTerminals, ...socketTerminals], connections }),
    );
    expect(
      findings.some(
        (finding) => finding.ruleId === "VX-EL-009" && finding.entityId === socket.id,
      ),
    ).toBe(false);
  });

  it("reports an undeclared wall crossing", () => {
    const distantSocket = makeEquipment({
      id: fixtureId("equipment", "s2"),
      definitionKey: "socket-schuko-16a-2p-e",
      xMm: 4500,
      yMm: 2000,
    });
    const crossing = makeRoute({
      id: fixtureId("route", "crossing"),
      toEquipmentId: distantSocket.id,
      points: [
        { x: 500, y: 500 },
        { x: 4500, y: 500 },
        { x: 4500, y: 2000 },
      ],
    });
    const findings = validateElectrical(
      baseInput({
        equipment: [board, distantSocket],
        routes: [crossing],
        walls: [
          makeWall({
            id: fixtureId("wall", "w1"),
            startX: 3000,
            startY: 0,
            endX: 3000,
            endY: 4000,
          }),
        ],
      }),
    );
    expect(findings.some((finding) => finding.ruleId === "VX-EL-021")).toBe(true);
  });

  it("reports a dangling route endpoint", () => {
    const findings = validateElectrical(
      baseInput({
        routes: [
          makeRoute({
            id: fixtureId("route", "dangling"),
            points: [
              { x: 500, y: 500 },
              { x: 4000, y: 3000 },
            ],
          }),
        ],
      }),
    );
    expect(findings.some((finding) => finding.ruleId === "VX-EL-014")).toBe(true);
  });

  it("reports three-phase phase imbalance", () => {
    const sockets = [1, 2, 3].map((index) =>
      makeEquipment({
        id: fixtureId("equipment", `p${index}`),
        definitionKey: "socket-schuko-16a-2p-e",
        xMm: 1000 + index * 400,
        yMm: 2000,
        phase: "L1",
      }),
    );
    const findings = validateElectrical(
      baseInput({
        equipment: [board, ...sockets],
        circuits: [
          makeCircuit({ phaseMode: "three_phase", breakerRatingA: 20, cableSectionMm2: 2.5 }),
        ],
      }),
    );
    const finding = findings.find((item) => item.ruleId === "VX-EL-018");
    expect(finding?.severity).toBe("warning");
    expect(Number(finding?.details.imbalancePct)).toBeGreaterThan(30);
  });

  it("flags equipment whose catalogue circuit type does not match its circuit", () => {
    const findings = validateElectrical(
      baseInput({
        circuits: [makeCircuit({ type: "lighting", breakerRatingA: 10 })],
        equipment: [board, socket],
      }),
    );
    expect(findings.some((finding) => finding.ruleId === "VX-EL-024")).toBe(true);
  });

  it("produces stable dedupe keys across runs", () => {
    const a = validateElectrical(baseInput());
    const b = validateElectrical(baseInput());
    expect(a.map((f) => f.dedupeKey)).toEqual(b.map((f) => f.dedupeKey));
  });
});

describe("load schedule", () => {
  it("separates connected load from demand and computes current", () => {
    const schedule = computeLoadSchedule({
      project: makeProject(),
      circuits: [makeCircuit({ demandFactor: 0.5 })],
      equipment: [socket],
      resolveDefinition: (key) => getEquipmentDefinition(key),
    });
    const load = schedule.circuits[0]!;
    expect(load.connectedVA).toBe(3680);
    expect(load.demandVA).toBe(1840);
    expect(load.currentA).toBeCloseTo(8, 3);
    expect(schedule.totalConnectedVA).toBe(3680);
    expect(schedule.totalDemandVA).toBe(1840);
  });

  it("keeps unassigned equipment visible instead of dropping it", () => {
    const schedule = computeLoadSchedule({
      project: makeProject(),
      circuits: [makeCircuit()],
      equipment: [{ ...socket, circuitId: null }],
      resolveDefinition: (key) => getEquipmentDefinition(key),
    });
    expect(schedule.unassignedEquipment).toHaveLength(1);
    expect(schedule.totalConnectedVA).toBe(0);
  });
});

describe("material take-off", () => {
  const input = {
    project: makeProject(),
    circuits: [makeCircuit()],
    equipment: [board, socket],
    rooms: [living],
    routes: [makeRoute({ id: fixtureId("route", "r1") })],
    resolveDefinition: ((key: string) =>
      getEquipmentDefinition(key)) as typeof getEquipmentDefinition,
  };

  it("counts equipment and computes cable from route plus slack and verticals", () => {
    const takeoff = computeTakeoff(input);
    expect(takeoff.totals.equipmentUnits).toBe(2);
    // Route = 3000 mm; +10% = 3300; verticals 1400 + 300 = 1700; total 5.0 m.
    const cable = takeoff.lines.find((line) => line.category === "cable");
    expect(cable?.quantity).toBeCloseTo(5, 6);
    expect(cable?.basis).toBe("inferred");
    expect(takeoff.lines.some((line) => line.key === "accessory:mounting-box")).toBe(true);
  });

  it("marks each quantity with its basis and never invents a price", () => {
    const takeoff = computeTakeoff(input);
    for (const line of takeoff.lines) {
      expect(["measured", "inferred", "assumed", "catalogue"]).toContain(line.basis);
    }
    expect(JSON.stringify(takeoff)).not.toMatch(/"price"\s*:/i);
  });

  it("exports deterministic CSV with assumptions", () => {
    const takeoff = computeTakeoff(input);
    const csv = takeoffToCsv(takeoff, "Test project");
    expect(csv).toContain("Project,Test project");
    expect(csv).toContain("Assumptions");
    expect(csv.split("\r\n").length).toBeGreaterThan(5);
  });
});
