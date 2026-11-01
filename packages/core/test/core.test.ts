import { describe, expect, it } from "vitest";
import {
  assertEntityId,
  distance,
  fixtureId,
  isEntityId,
  newId,
  pointInPolygon,
  polygonAreaMm2,
  polylineLength,
  rectPolygon,
  simplifyPolyline,
  snapPointToGrid,
  isOrthogonalPolyline,
  segmentsIntersect,
  segmentIntersection,
  simplifyPointsRdp,
  getEquipmentDefinition,
  EQUIPMENT_CATALOG,
  SUPPLY_PRESETS,
  circuitTypeSchema,
  equipmentDefinitionSchema,
} from "../src";

describe("identifiers", () => {
  it("creates prefixed ids that round-trip through the guard", () => {
    const id = newId("equipment");
    expect(id.startsWith("eq_")).toBe(true);
    expect(isEntityId(id, "equipment")).toBe(true);
    expect(isEntityId(id, "circuit")).toBe(false);
  });

  it("rejects an id of the wrong kind", () => {
    const circuitId = fixtureId("circuit", "C1");
    expect(() => assertEntityId(circuitId, "equipment")).toThrow(/Expected a equipment id/);
  });

  it("rejects ids that are not prefixed", () => {
    expect(isEntityId("12345")).toBe(false);
    expect(isEntityId("eq_")).toBe(false);
    expect(isEntityId("EQ_abc")).toBe(false);
  });

  it("normalises fixture slugs", () => {
    expect(fixtureId("room", "Living / Dining")).toBe("rm_living-dining");
  });
});

describe("planar geometry", () => {
  it("computes the area of a 5 x 4 m rectangle", () => {
    const rect = rectPolygon(0, 0, 5000, 4000);
    expect(polygonAreaMm2(rect)).toBe(20_000_000);
  });

  it("computes area regardless of winding order", () => {
    const rect = rectPolygon(1000, 1000, 3000, 2000);
    const reversed = [...rect].reverse();
    expect(polygonAreaMm2(reversed)).toBe(polygonAreaMm2(rect));
  });

  it("treats a point on the boundary as inside", () => {
    const room = rectPolygon(0, 0, 4000, 3000);
    expect(pointInPolygon({ x: 2000, y: 1500 }, room)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 1500 }, room)).toBe(true);
    expect(pointInPolygon({ x: 4000, y: 3000 }, room)).toBe(true);
    expect(pointInPolygon({ x: 4001, y: 1500 }, room)).toBe(false);
  });

  it("measures a polyline and ignores zero-length duplicates", () => {
    expect(polylineLength([{ x: 0, y: 0 }, { x: 3000, y: 0 }, { x: 3000, y: 4000 }])).toBe(7000);
    const simplified = simplifyPolyline([
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: 2000 },
    ]);
    expect(simplified).toEqual([
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: 2000 },
    ]);
  });

  it("detects orthogonal polylines within tolerance", () => {
    expect(
      isOrthogonalPolyline([
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
        { x: 1000, y: 1000 },
      ]),
    ).toBe(true);
    expect(
      isOrthogonalPolyline([
        { x: 0, y: 0 },
        { x: 1000, y: 1000 },
      ]),
    ).toBe(false);
  });

  it("detects segment intersections, including collinear overlap", () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: -500 }, { x: 500, y: 500 }),
    ).toBe(true);
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 0 }, { x: 500, y: 0 }),
    ).toBe(true);
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 500, y: 100 }, { x: 500, y: 500 }),
    ).toBe(false);
  });

  it("returns the intersection point for crossing segments", () => {
    const intersection = segmentIntersection(
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 500, y: -500 },
      { x: 500, y: 500 },
    );
    expect(intersection).toEqual({ x: 500, y: 0 });
  });

  it("snaps to the construction grid", () => {
    expect(snapPointToGrid({ x: 1127, y: 488 }, 250)).toEqual({ x: 1250, y: 500 });
  });

  it("reduces imported geometry with Douglas–Peucker", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 500, y: 10 },
      { x: 1000, y: 0 },
      { x: 1500, y: 500 },
    ];
    expect(simplifyPointsRdp(points, 50)).toEqual([
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1500, y: 500 },
    ]);
  });

  it("computes euclidean distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3000, y: 4000 })).toBe(5000);
  });
});

describe("equipment catalog", () => {
  it("validates every definition against its schema", () => {
    for (const definition of EQUIPMENT_CATALOG) {
      expect(() => equipmentDefinitionSchema.parse(definition)).not.toThrow();
    }
  });

  it("has unique keys", () => {
    const keys = EQUIPMENT_CATALOG.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every class I product an earth terminal", () => {
    for (const definition of EQUIPMENT_CATALOG) {
      if (definition.electrical.requiresEarth && definition.electrical.protectionClass === "I") {
        expect(definition.terminals.some((terminal) => terminal.function === "earth")).toBe(true);
      }
    }
  });

  it("keeps the socket load as its rated maximum, not a predicted simultaneous load", () => {
    const socket = getEquipmentDefinition("socket-schuko-16a-2p-e");
    expect(socket.electrical.defaultLoadVA).toBe(3680);
    expect(socket.terminals.map((terminal) => terminal.function)).toContain("earth");
  });

  it("fails loudly for an unknown product key", () => {
    expect(() => getEquipmentDefinition("does-not-exist")).toThrow(/Unknown equipment key/);
  });

  it("offers a Portuguese supply preset with configurable frequency", () => {
    const preset = SUPPLY_PRESETS.find((item) => item.key === "PT-LV-230-400");
    expect(preset).toMatchObject({ phaseVoltageV: 230, lineVoltageV: 400, frequencyHz: 50 });
  });

  it("rejects an equipment definition that claims earth without a PE terminal", () => {
    const invalid = {
      ...getEquipmentDefinition("socket-schuko-16a-2p-e"),
      key: "socket-broken",
      terminals: getEquipmentDefinition("socket-schuko-16a-2p-e").terminals.filter(
        (terminal) => terminal.function !== "earth",
      ),
    };
    expect(() => equipmentDefinitionSchema.parse(invalid)).toThrow(/earth terminal/);
  });

  it("knows the MVP circuit types", () => {
    expect(circuitTypeSchema.options).toContain("sockets");
    expect(circuitTypeSchema.options).toContain("lighting");
  });
});
