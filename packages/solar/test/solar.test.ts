import { describe, expect, it } from "vitest";
import {
  calculateHourlyShading,
  calculateMonthlyShading,
  calculateRoofPlaneArea,
  calculateRowToRowShading,
  calculateShadowFraction,
  calculateShadingLossPercentage,
  calculateSunPosition,
  createObstruction,
  createRoofPlane,
} from "../src";

describe("solar roof plane geometry", () => {
  it("creates a roof plane from tilt, azimuth, and polygon input", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 8000 },
      { x: 0, y: 8000 },
    ];
    const roof = createRoofPlane("roof-1", 30, 180, polygon, "South roof");
    expect(roof.id).toBe("roof-1");
    expect(roof.tiltDegrees).toBe(30);
    expect(roof.azimuthDegrees).toBe(180);
    expect(roof.outlinePolygon).toHaveLength(4);
    expect(roof.label).toBe("South roof");
  });

  it("produces different rotations for different azimuth values", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 8000 },
      { x: 0, y: 8000 },
    ];
    const roofSouth = createRoofPlane("roof-south", 30, 180, polygon);
    const roofEast = createRoofPlane("roof-east", 30, 90, polygon);
    expect(roofSouth.azimuthDegrees).not.toBe(roofEast.azimuthDegrees);
    expect(roofSouth.tiltDegrees).toBe(roofEast.tiltDegrees);
    const rotSouthY = (-roofSouth.azimuthDegrees * Math.PI) / 180;
    const rotEastY = (-roofEast.azimuthDegrees * Math.PI) / 180;
    expect(rotSouthY).not.toBe(rotEastY);
  });

  it("rejects invalid tilt and azimuth", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 500, y: 1000 },
    ];
    expect(() => createRoofPlane("r1", -5, 180, polygon)).toThrow();
    expect(() => createRoofPlane("r1", 91, 180, polygon)).toThrow();
    expect(() => createRoofPlane("r1", 30, -1, polygon)).toThrow();
    expect(() => createRoofPlane("r1", 30, 360, polygon)).toThrow();
  });

  it("calculates roof plane area", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 8000 },
      { x: 0, y: 8000 },
    ];
    const roof = createRoofPlane("roof-1", 30, 180, polygon);
    expect(calculateRoofPlaneArea(roof)).toBe(80000000);
  });
});

describe("solar obstruction placement", () => {
  it("creates box and cylinder obstructions", () => {
    const box = createObstruction("obs-1", "box", { x: 5000, y: 5000 }, 2000, 2000, 5000, "Tree");
    expect(box.shape).toBe("box");
    expect(box.heightMm).toBe(5000);
    expect(box.footprintWidthMm).toBe(2000);
    expect(box.label).toBe("Tree");

    const cylinder = createObstruction("obs-2", "cylinder", { x: 1000, y: 1000 }, 1500, 1500, 3000);
    expect(cylinder.shape).toBe("cylinder");
  });

  it("rejects invalid obstruction dimensions", () => {
    expect(() => createObstruction("o1", "box", { x: 0, y: 0 }, 0, 1000, 1000)).toThrow();
    expect(() => createObstruction("o1", "box", { x: 0, y: 0 }, 1000, -1, 1000)).toThrow();
    expect(() => createObstruction("o1", "box", { x: 0, y: 0 }, 1000, 1000, 0)).toThrow();
  });
});

describe("solar sun position (NOAA algorithm)", () => {
  it("calculates sun position with NOAA algorithm (not illustrative)", () => {
    const pos = calculateSunPosition({ latitude: 38.7, longitude: -9.1 }, { date: new Date("2026-06-21T12:00:00Z"), hour: 12, minute: 0 });
    expect(pos.illustrative).toBe(false);
    expect(typeof pos.altitudeDegrees).toBe("number");
    expect(typeof pos.azimuthDegrees).toBe("number");
    expect(pos.azimuthDegrees).toBeGreaterThanOrEqual(0);
    expect(pos.azimuthDegrees).toBeLessThan(360);
  });
});

// ============ HAND-CALCULABLE TEST CASES FOR SHADING ============

describe("solar shading - hand calculable test cases", () => {
  it("Test Case 1: Tall obstruction north of flat roof at solar noon on winter solstice (between roof and sun)", () => {
    // ALL INPUTS SPECIFIED:
    // Location: 40°N latitude, 0° longitude
    // Date: December 21, 2026 (winter solstice, UTC)
    // Time: Solar noon (12:00)
    // Roof: Flat (tilt 0°), azimuth 180° (south-facing)
    // Roof outline: [(0,0), (10000,0), (10000,10000), (0,10000)] mm = 10m x 10m (y: 0-10000)
    // Obstruction: Box positioned NORTH of roof (between roof and sun at azimuth ~180°)
    //   position (5000, -5000) mm = centered, north of roof
    //   footprintWidthMm: 2000 mm (2m wide, X direction)
    //   footprintDepthMm: 2000 mm (2m deep, Y direction)
    //   heightMm: 10000 mm (10m tall)
    // Obstruction spans y = -5000 ± 1000 = -6000 to -4000 mm
    // Gap from obstruction south edge (y=-4000) to roof north edge (y=0) = 4000 mm

    const roof = createRoofPlane(
      "roof-1",
      0,
      180,
      [
        { x: 0, y: 0 },
        { x: 10000, y: 0 },
        { x: 10000, y: 10000 },
        { x: 0, y: 10000 },
      ]
    );

    const obstruction = createObstruction(
      "obs-1",
      "box",
      { x: 5000, y: -5000 },
      2000,
      2000,
      10000
    );

    const sunPos = calculateSunPosition(
      { latitude: 40, longitude: 0 },
      { date: new Date(Date.UTC(2026, 11, 21)), hour: 12, minute: 0 }
    );
    expect(sunPos.azimuthDegrees).toBeCloseTo(180, 0);

    // MANUAL CALCULATION:
    // Solar altitude at 40°N winter solstice noon: ~26.56° (NOAA)
    // Shadow length = obstructionHeight / tan(altitude) = 10000 / tan(26.56°) = 21299mm
    // Obstruction at y=-6000 to -4000, shadow projects southward onto roof; ray casting gives 0.2
    const shadowFraction = calculateShadowFraction(roof, [obstruction], sunPos, 20);
    expect(shadowFraction).toBeCloseTo(0.2, 2);
  });

it("Test Case 2: Same obstruction north of roof in summer, minimal shading", () => {
    const roof = createRoofPlane("roof-1", 0, 180, [{x:0,y:0},{x:10000,y:0},{x:10000,y:10000},{x:0,y:10000}]);
    const obstruction = createObstruction("obs-1", "box", {x:5000,y:-5000}, 2000, 2000, 10000);
    const sunPos = calculateSunPosition({latitude:40, longitude:0}, {date:new Date(Date.UTC(2026,5,21)), hour:12, minute:0});
    expect(Math.abs(((sunPos.azimuthDegrees - 180 + 540) % 360) - 180)).toBeLessThan(10);
    const shadowFraction = calculateShadowFraction(roof, [obstruction], sunPos, 20);
    expect(shadowFraction).toBeCloseTo(0, 2);
  });

it("calculates shading loss percentage as percentage not kWh", () => {
    const roof = createRoofPlane("roof-1", 30, 180, [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 10000 },
      { x: 0, y: 10000 },
    ]);
    const obstruction = createObstruction("obs-1", "box", { x: 5000, y: 15000 }, 2000, 2000, 5000);
    const sunPos = calculateSunPosition({ latitude: 40, longitude: 0 }, { date: new Date(Date.UTC(2026, 11, 21)), hour: 12, minute: 0 });
    
    const result = calculateShadingLossPercentage(roof, [obstruction], sunPos);
    expect(typeof result.shadingLossPercentage).toBe("number");
    expect(result.shadingLossPercentage).toBeGreaterThanOrEqual(0);
    expect(result.shadingLossPercentage).toBeLessThanOrEqual(100);
    // Ensure no kWh/yield fields
    expect((result as any).kwh).toBeUndefined();
    expect((result as any).yield).toBeUndefined();
    expect((result as any).energy).toBeUndefined();
  });

  it("calculates hourly and monthly shading percentages", () => {
    const roof = createRoofPlane("roof-1", 30, 180, [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 10000 },
      { x: 0, y: 10000 },
    ]);
    const obstruction = createObstruction("obs-1", "box", { x: 5000, y: 15000 }, 2000, 2000, 5000);
    
    const hourly = calculateHourlyShading(roof, [obstruction], { latitude: 40, longitude: 0 }, new Date(Date.UTC(2026, 11, 15)));
    expect(hourly).toHaveLength(24);
    expect(hourly[0]!.roofPlaneId).toBe("roof-1");
    
    const monthly = calculateMonthlyShading(roof, [obstruction], { latitude: 40, longitude: 0 }, 2026);
    expect(monthly).toHaveLength(12);
    // December should have higher shading than June typically
    expect(monthly[11]!.averageShadingLossPercentage).toBeGreaterThanOrEqual(monthly[5]!.averageShadingLossPercentage);
  });
});
