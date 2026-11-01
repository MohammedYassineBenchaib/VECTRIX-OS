import { describe, expect, it } from "vitest";
import { polylineLength } from "@vectrix/core";
import {
  checkRouteGeometry,
  routeOrthogonal,
  summarizeRoute,
  type RoutingWall,
} from "../src";

const bounds = { minX: 0, minY: 0, maxX: 8000, maxY: 6000 };

const wall = (overrides: Partial<RoutingWall> = {}): RoutingWall => ({
  id: "wal_test",
  startX: 4000,
  startY: 0,
  endX: 4000,
  endY: 4000,
  thicknessMm: 150,
  allowPenetration: false,
  ...overrides,
});

describe("orthogonal routing", () => {
  it("produces an orthogonal path in an empty plan", () => {
    const result = routeOrthogonal({
      bounds,
      walls: [],
      start: { x: 1000, y: 1000 },
      end: { x: 5000, y: 1000 },
    });
    expect(result.feasible).toBe(true);
    expect(result.points.length).toBeGreaterThanOrEqual(2);
    expect(result.lengthMm).toBeCloseTo(4000, 0);
    for (let i = 1; i < result.points.length; i += 1) {
      const a = result.points[i - 1]!;
      const b = result.points[i]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
  });

  it("starts and ends exactly at the requested anchors", () => {
    const result = routeOrthogonal({
      bounds,
      walls: [],
      start: { x: 1234, y: 987 },
      end: { x: 6234, y: 4987 },
    });
    expect(result.points[0]).toEqual({ x: 1234, y: 987 });
    expect(result.points[result.points.length - 1]).toEqual({ x: 6234, y: 4987 });
  });

  it("routes around a wall instead of crossing it", () => {
    const result = routeOrthogonal({
      bounds,
      walls: [wall()],
      start: { x: 1000, y: 1000 },
      end: { x: 6000, y: 1000 },
    });
    expect(result.feasible).toBe(true);
    expect(result.lengthMm).toBeGreaterThan(5000);
    const diagnostics = checkRouteGeometry({
      points: result.points,
      bounds,
      walls: [wall()],
      anchors: [],
      requireAnchors: false,
    });
    expect(diagnostics.some((diagnostic) => diagnostic.code === "WALL_CROSSING")).toBe(false);
  });

  it("reports no path when a wall divides the whole plan", () => {
    const result = routeOrthogonal({
      bounds,
      walls: [wall({ startY: -1000, endY: 7000, thicknessMm: 400 })],
      start: { x: 1000, y: 3000 },
      end: { x: 7000, y: 3000 },
    });
    expect(result.feasible).toBe(false);
    expect(result.diagnostics.some((d) => d.code === "NO_PATH")).toBe(true);
  });

  it("is deterministic for identical input", () => {
    const request = {
      bounds,
      walls: [wall()],
      start: { x: 1000, y: 1000 },
      end: { x: 7000, y: 5000 },
    };
    const first = routeOrthogonal(request);
    const second = routeOrthogonal(request);
    expect(first.points).toEqual(second.points);
    expect(first.lengthMm).toBe(second.lengthMm);
  });

  it("refuses an unbounded grid instead of freezing the server", () => {
    const result = routeOrthogonal({
      bounds: { minX: 0, minY: 0, maxX: 100_000, maxY: 100_000 },
      walls: [],
      start: { x: 1000, y: 1000 },
      end: { x: 90_000, y: 90_000 },
      options: { gridMm: 100, maxCells: 5000 },
    });
    expect(result.feasible).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("GRID_TOO_LARGE");
  });

  it("states its modelling assumptions", () => {
    const result = routeOrthogonal({
      bounds,
      walls: [],
      start: { x: 1000, y: 1000 },
      end: { x: 2000, y: 1000 },
    });
    expect(result.assumptions.join(" ")).toMatch(/not proof of physical constructibility/);
  });

  it("summarises a path length and turn count", () => {
    const summary = summarizeRoute([
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 500 },
    ]);
    expect(summary.lengthMm).toBe(1500);
    expect(summary.turns).toBe(1);
  });
});

describe("route geometry checks", () => {
  const anchors = [{ id: "eq_a", point: { x: 0, y: 0 } }];

  it("accepts a clean orthogonal route anchored at both ends", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: 2000 },
    ];
    const diagnostics = checkRouteGeometry({
      points,
      bounds,
      walls: [],
      anchors: [...anchors, { id: "eq_b", point: { x: 2000, y: 2000 } }],
    });
    expect(diagnostics.filter((d) => d.severity !== "info")).toEqual([]);
  });

  it("flags a diagonal segment", () => {
    const diagnostics = checkRouteGeometry({
      points: [
        { x: 0, y: 0 },
        { x: 2000, y: 2000 },
      ],
      bounds,
      walls: [],
      anchors: [...anchors, { id: "eq_b", point: { x: 2000, y: 2000 } }],
    });
    expect(diagnostics.some((d) => d.code === "DIAGONAL_SEGMENT")).toBe(true);
  });

  it("flags an undeclared wall crossing and reports a declared penetration as information", () => {
    const crossingPoints = [
      { x: 1000, y: 1000 },
      { x: 5000, y: 1000 },
    ];
    const undeclared = checkRouteGeometry({
      points: crossingPoints,
      bounds,
      walls: [wall()],
      anchors: [],
      requireAnchors: false,
    });
    expect(undeclared.some((d) => d.code === "WALL_CROSSING" && d.severity === "warning")).toBe(
      true,
    );

    const declared = checkRouteGeometry({
      points: crossingPoints,
      bounds,
      walls: [wall({ allowPenetration: true })],
      anchors: [],
      requireAnchors: false,
    });
    expect(declared.some((d) => d.code === "PENETRATION_DECLARED")).toBe(true);
    expect(declared.some((d) => d.code === "WALL_CROSSING")).toBe(false);
  });

  it("flags an endpoint that is not near any equipment", () => {
    const diagnostics = checkRouteGeometry({
      points: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
      ],
      bounds,
      walls: [],
      anchors: [{ id: "eq_far", point: { x: 6000, y: 6000 } }],
    });
    expect(diagnostics.some((d) => d.code === "DANGLING_ENDPOINT")).toBe(true);
  });

  it("flags a route leaving the plan", () => {
    const diagnostics = checkRouteGeometry({
      points: [
        { x: 0, y: 0 },
        { x: 20_000, y: 0 },
      ],
      bounds,
      walls: [],
      anchors: [],
      requireAnchors: false,
    });
    expect(diagnostics.some((d) => d.code === "OUTSIDE_PLAN")).toBe(true);
  });

  it("computes the true polyline length, not the bounding box", () => {
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 3000, y: 0 },
        { x: 3000, y: 4000 },
      ]),
    ).toBe(7000);
  });
});
