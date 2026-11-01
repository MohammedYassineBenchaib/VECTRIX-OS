import { describe, expect, it } from "vitest";
import type { Equipment, Room, Route, ValidationResult } from "@vectrix/core";
import { newId } from "@vectrix/core";
import {
  clampToPlan,
  distanceMm,
  equipmentCircuit,
  findingEntityLabel,
  nearestEquipment,
  occupancyLabel,
  openFindings,
  orthogonalPoint,
  pointInPolygon,
  polygonAreaMm2,
  polygonBounds,
  roomAtPoint,
  routeLengthForCircuit,
  routeStatusLabel,
  snapToGrid,
  sortFindings,
  validationDetailRows,
  validationStatusLabel,
  wallKindLabel,
} from "@/components/workspace/helpers";

function equipment(partial: Partial<Equipment> & Pick<Equipment, "id" | "label" | "xMm" | "yMm">): Equipment {
  return {
    levelId: "lvl_test" as Equipment["levelId"],
    roomId: null,
    definitionKey: "socket-schuko-16a-2p-e",
    rotationDeg: 0,
    mountingHeightMm: 300,
    circuitId: null,
    phase: null,
    loadVAOverride: null,
    powerFactorOverride: null,
    installationState: "planned",
    source: "manual",
    notes: "",
    ...partial,
  } as Equipment;
}

function finding(partial: Partial<ValidationResult>): ValidationResult {
  return {
    id: newId("validation") as ValidationResult["id"],
    projectId: "prj_test" as ValidationResult["projectId"],
    levelId: null,
    ruleId: "VX-EL-000",
    ruleSetVersion: "test",
    severity: "info",
    status: "open",
    discipline: "electrical",
    entityType: "project",
    entityId: "prj_test",
    message: "test",
    details: {},
    createdAt: new Date("2026-01-01T00:00:00Z"),
    decidedAt: null,
    decidedBy: null,
    resolvedAt: null,
    resolvedBy: null,
    ...partial,
  };
}

const square = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 1000 },
  { x: 0, y: 1000 },
];

describe("plan geometry", () => {
  it("detects points inside, outside and on the boundary of a polygon", () => {
    expect(pointInPolygon({ x: 500, y: 500 }, square)).toBe(true);
    expect(pointInPolygon({ x: 1500, y: 500 }, square)).toBe(false);
    // A boundary point belongs to the room so wall clicks do not fall through.
    expect(pointInPolygon({ x: 0, y: 500 }, square)).toBe(true);
    expect(pointInPolygon({ x: 1000, y: 1000 }, square)).toBe(true);
    expect(pointInPolygon({ x: 1000, y: 1001 }, square)).toBe(false);
    expect(pointInPolygon({ x: -1, y: 500 }, square)).toBe(false);
  });

  it("computes polygon area from the shoelace formula regardless of winding", () => {
    expect(polygonAreaMm2(square)).toBe(1_000_000);
    expect(polygonAreaMm2([...square].reverse())).toBe(1_000_000);
    expect(polygonAreaMm2(square.slice(0, 3))).toBe(500_000);
  });

  it("returns bounds and the geometric centre", () => {
    expect(polygonBounds(square)).toMatchObject({
      minX: 0,
      minY: 0,
      maxX: 1000,
      maxY: 1000,
      width: 1000,
      height: 1000,
      center: { x: 500, y: 500 },
    });
  });

  it("selects the most recently added room when polygons overlap", () => {
    const rooms = [
      { id: "rm_old", polygon: square },
      { id: "rm_new", polygon: square },
    ] as Room[];
    expect(roomAtPoint(rooms, { x: 500, y: 500 })?.id).toBe("rm_new");
    expect(roomAtPoint(rooms, { x: 4000, y: 4000 })).toBeUndefined();
  });

  it("snaps to the 50 mm grid and clamps to the sheet", () => {
    expect(snapToGrid(123)).toBe(100);
    expect(snapToGrid(126)).toBe(150);
    expect(snapToGrid(-20)).toBe(-0);
    expect(clampToPlan({ x: -10, y: 5000 }, 11000, 8000)).toEqual({ x: 0, y: 5000 });
    expect(clampToPlan({ x: 12000, y: 9000 }, 11000, 8000)).toEqual({ x: 11000, y: 8000 });
  });

  it("measures distances and finds the nearest device within the tolerance", () => {
    expect(distanceMm({ x: 0, y: 0 }, { x: 300, y: 400 })).toBe(500);
    const devices = [
      equipment({ id: "eq_a", label: "S1", xMm: 100, yMm: 100 }),
      equipment({ id: "eq_b", label: "S2", xMm: 260, yMm: 100 }),
    ];
    expect(nearestEquipment(devices, { x: 250, y: 100 }, 300)?.id).toBe("eq_b");
    expect(nearestEquipment(devices, { x: 600, y: 600 }, 300)).toBeUndefined();
  });

  it("constrains route points to an orthogonal segment", () => {
    expect(orthogonalPoint({ x: 900, y: 300 }, { x: 100, y: 100 })).toEqual({ x: 900, y: 100 });
    expect(orthogonalPoint({ x: 150, y: 700 }, { x: 100, y: 100 })).toEqual({ x: 100, y: 700 });
    expect(orthogonalPoint({ x: 50, y: 50 }, undefined)).toEqual({ x: 50, y: 50 });
  });
});

describe("schedule and finding helpers", () => {
  it("sums only routes assigned to the requested circuit", () => {
    const routes = [
      { circuitId: "ckt_a", lengthMm: 1000 },
      { circuitId: "ckt_a", lengthMm: 500 },
      { circuitId: "ckt_b", lengthMm: 9000 },
      { circuitId: null, lengthMm: 400 },
    ] as Route[];
    expect(routeLengthForCircuit(routes, "ckt_a")).toBe(1500);
    expect(routeLengthForCircuit(routes, "ckt_missing")).toBe(0);
  });

  it("looks up a circuit only when the device is assigned", () => {
    const map = new Map([["ckt_a", { id: "ckt_a", name: "Sockets" }]]);
    expect(equipmentCircuit(equipment({ id: "eq_a", label: "S1", xMm: 0, yMm: 0, circuitId: "ckt_a" }), map as never)?.name).toBe("Sockets");
    expect(equipmentCircuit(equipment({ id: "eq_b", label: "S2", xMm: 0, yMm: 0 }), map as never)).toBeUndefined();
  });

  it("sorts findings by severity then rule id", () => {
    const rows = [
      finding({ ruleId: "VX-EL-030", severity: "info" }),
      finding({ ruleId: "VX-EL-010", severity: "error" }),
      finding({ ruleId: "VX-EL-002", severity: "warning" }),
      finding({ ruleId: "VX-EL-005", severity: "error" }),
    ];
    expect(sortFindings(rows).map((row) => row.ruleId)).toEqual([
      "VX-EL-005",
      "VX-EL-010",
      "VX-EL-002",
      "VX-EL-030",
    ]);
    expect(openFindings([...rows, finding({ severity: "warning", status: "resolved" })])).toHaveLength(4);
  });

  it("exposes human labels and entity names, with safe fallbacks", () => {
    expect(routeStatusLabel("proposed")).toBe("Proposed");
    expect(routeStatusLabel("unmapped")).toBe("unmapped");
    expect(occupancyLabel("bathroom")).toBe("Bathroom");
    expect(validationStatusLabel("accepted_risk")).toBe("Accepted risk");
    expect(wallKindLabel("partition")).toBe("Partition");
    expect(findingEntityLabel(finding({ entityType: "connection" }))).toBe("Connection");
    expect(findingEntityLabel(finding({ entityType: "project" }))).toBe("Project");
  });

  it("renders detail values without losing nested evidence", () => {
    expect(
      validationDetailRows(
        finding({
          details: { currentA: 16.8, breakerA: 16, nested: { a: 1 }, missing: null },
        }),
      ),
    ).toEqual([
      ["currentA", "16.8"],
      ["breakerA", "16"],
      ["nested", '{"a":1}'],
      ["missing", "null"],
    ]);
  });
});
