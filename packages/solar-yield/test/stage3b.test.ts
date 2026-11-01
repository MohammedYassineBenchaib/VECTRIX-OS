import { describe, it, expect } from "vitest";
import { computeShadingAdjustedYield } from "../src/shading-adjusted-yield";
import { createRoofPlane, createObstruction } from "@vectrix/solar";
import type { SiteLocation } from "@vectrix/solar";
import type { PvgisYieldResult } from "../src/index";

describe("Shading-adjusted yield (Stage 3b)", () => {
  const flatRoof = createRoofPlane("roof-flat", 0, 180, [
    { x: 0, y: 0 },
    { x: 10000, y: 0 },
    { x: 10000, y: 10000 },
    { x: 0, y: 10000 },
  ]);
  const baseLocation: SiteLocation = { latitude: 40, longitude: 0 };

  // Test 1: single-hour case, 0% shading (no obstructions) -> adjustedEnergy == unadjusted within FP tolerance
  it("single-hour 0% shading: adjustedEnergy equals unadjusted within FP tolerance", async () => {
    const pvgisResult: PvgisYieldResult = {
      source: "PVGIS",
      location: { latitude: 40, longitude: 0 },
      system: { peakPowerKw: 1, systemLossPercent: 14, angle: 35, aspect: 0 },
      radiationDatabase: "PVGIS-SARAH3",
      monthly: [],
      annualEnergyKwh: 0,
      annualIrradiationKwhM2: 0,
      hourly: [
        { time: "20200621:1200", G_i: 800, H_sun: 65, T2m: 25, WS10m: 2, P: 700 },
      ],
    };
    const roof35 = createRoofPlane("roof-35", 35, 0, [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 10000 },
      { x: 0, y: 10000 },
    ]);
    const result = await computeShadingAdjustedYield(pvgisResult, {
      roofPlane: roof35,
      obstructions: [],
      siteLocation: baseLocation,
      pvgisAngle: 35,
      pvgisAspect: 0,
    });
    expect(result.hourly.length).toBe(1);
    // No obstructions => shading fraction 0 => adjusted == unadjusted
    expect(result.hourly[0].obstructionShadingFraction).toBe(0);
    expect(result.hourly[0].adjustedEnergy).toBeCloseTo(result.hourly[0].unadjustedEnergy, 10);
    expect(result.hourly[0].adjustedEnergy).toBe(800);
  });

  // NEW TEST: obstruction present but positioned OUTSIDE the sun's shadow path
  // Geometric reasoning:
  // - Roof: flat 10m x 10m at (0,0)-(10000,10000), y grows south (screen convention)
  // - Sun: winter solstice noon at 40N -> azimuth ~180 (south), altitude ~26.56
  // - Obstruction: box at (5000, 15000) = SOUTH of roof (y=15000, south of roof's south edge at y=10000)
  //   footprint 2000x2000, height 10000
  // - Shadow direction: sun is SOUTH, so shadow from obstruction falls further SOUTH (away from roof)
  //   Obstruction's shadow projects southward from y=14000-16000, never reaching roof (y 0-10000)
  // - Therefore shadowFraction = 0 (obstruction present but does not shade the roof)
  // - This proves the pipeline correctly determines 0% shading, not just "no obstructions passed"
  it("obstruction present but outside shadow path: shadowFraction=0, adjustedEnergy==unadjusted", async () => {
    const southObstruction = createObstruction("obs-south", "box", { x: 5000, y: 15000 }, 2000, 2000, 10000);
    const pvgisResult: PvgisYieldResult = {
      source: "PVGIS",
      location: { latitude: 40, longitude: 0 },
      system: { peakPowerKw: 1, systemLossPercent: 14, angle: 0, aspect: 180 },
      radiationDatabase: "PVGIS-SARAH3",
      monthly: [],
      annualEnergyKwh: 0,
      annualIrradiationKwhM2: 0,
      hourly: [
        { time: "20261221:1200", G_i: 600, H_sun: 26.56, T2m: 5, WS10m: 2, P: 500 },
      ],
    };
    const result = await computeShadingAdjustedYield(pvgisResult, {
      roofPlane: flatRoof,
      obstructions: [southObstruction],
      siteLocation: baseLocation,
      pvgisAngle: 0,
      pvgisAspect: 180,
    });
    console.log("south-obstruction shadowFraction:", result.hourly[0].obstructionShadingFraction);
    console.log("adjustedEnergy:", result.hourly[0].adjustedEnergy, "unadjusted:", result.hourly[0].unadjustedEnergy);
    // Obstruction is present but shadow falls away from roof -> 0% shading
    expect(result.hourly[0].obstructionShadingFraction).toBe(0);
    expect(result.hourly[0].adjustedEnergy).toBeCloseTo(result.hourly[0].unadjustedEnergy, 10);
    expect(result.hourly[0].adjustedEnergy).toBe(600);
  });

  // Test 2: Stage 2 verified 20% shading config -> adjustedEnergy == baseline * 0.8 within +/-1%
  it("20% shading (Stage 2 verified config): adjustedEnergy == baseline * 0.8 within +/-1%", async () => {
    const obstruction = createObstruction("obs-1", "box", { x: 5000, y: -5000 }, 2000, 2000, 10000);
    const baseline = 500;
    const pvgisResult: PvgisYieldResult = {
      source: "PVGIS",
      location: { latitude: 40, longitude: 0 },
      system: { peakPowerKw: 1, systemLossPercent: 14, angle: 0, aspect: 180 },
      radiationDatabase: "PVGIS-SARAH3",
      monthly: [],
      annualEnergyKwh: 0,
      annualIrradiationKwhM2: 0,
      hourly: [
        { time: "20261221:1200", G_i: baseline, H_sun: 26.56, T2m: 5, WS10m: 2, P: 400 },
      ],
    };
    const result = await computeShadingAdjustedYield(pvgisResult, {
      roofPlane: flatRoof,
      obstructions: [obstruction],
      siteLocation: baseLocation,
      pvgisAngle: 0,
      pvgisAspect: 180,
    });
    // Hand calc: Stage 2 verified shadowFraction = 0.2 for this config at 2026-12-21 12:00 UTC.
    // adjustedEnergy = G_i * (1 - 0.2) = 500 * 0.8 = 400
    console.log("shadowFraction:", result.hourly[0].obstructionShadingFraction);
    console.log("adjustedEnergy:", result.hourly[0].adjustedEnergy, "expected:", baseline * 0.8);
    expect(result.hourly[0].obstructionShadingFraction).toBeCloseTo(0.2, 2);
    expect(result.hourly[0].adjustedEnergy).toBeCloseTo(baseline * 0.8, 1);
    // tight +/-1% check
    const pctDiff = Math.abs(result.hourly[0].adjustedEnergy - baseline * 0.8) / (baseline * 0.8);
    expect(pctDiff).toBeLessThan(0.01);
  });

  // Test 3: full aggregation - 4 hours, hand-computed expected sum
  it("aggregation: sum of hourly adjusted values matches hand-computed expected total for 4 hours", async () => {
    const pvgisResult: PvgisYieldResult = {
      source: "PVGIS",
      location: { latitude: 40, longitude: 0 },
      system: { peakPowerKw: 1, systemLossPercent: 14, angle: 35, aspect: 0 },
      radiationDatabase: "PVGIS-SARAH3",
      monthly: [],
      annualEnergyKwh: 0,
      annualIrradiationKwhM2: 0,
      hourly: [
        { time: "20200621:1000", G_i: 400, H_sun: 50, T2m: 20, WS10m: 2, P: 350 },
        { time: "20200621:1100", G_i: 600, H_sun: 55, T2m: 22, WS10m: 2, P: 520 },
        { time: "20200621:1200", G_i: 800, H_sun: 65, T2m: 25, WS10m: 2, P: 700 },
        { time: "20200621:1300", G_i: 700, H_sun: 60, T2m: 24, WS10m: 2, P: 610 },
      ],
    };
    const roof35 = createRoofPlane("roof-35", 35, 0, [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 10000 },
      { x: 0, y: 10000 },
    ]);
    const result = await computeShadingAdjustedYield(pvgisResult, {
      roofPlane: roof35,
      obstructions: [],
      siteLocation: baseLocation,
      pvgisAngle: 35,
      pvgisAspect: 0,
    });
    // Hand calc: no obstructions => shading 0 => adjusted == G_i for each hour
    // expected sum = 400 + 600 + 800 + 700 = 2500
    const expectedSum = 400 + 600 + 800 + 700;
    const actualSum = result.hourly.reduce((s, h) => s + h.adjustedEnergy, 0);
    console.log("expectedSum:", expectedSum, "actualSum:", actualSum);
    expect(actualSum).toBeCloseTo(expectedSum, 10);
    expect(result.hourly.length).toBe(4);
    // Also check monthly aggregation array
    console.log("monthlyAdjustedEnergyKwh[5] (June):", result.monthlyAdjustedEnergyKwh[5]);
  });

  // Test 4: angle-mismatch refuses to combine
  it("roof/PVGIS angle-mismatch refuses to combine", async () => {
    const pvgisResult: PvgisYieldResult = {
      source: "PVGIS",
      location: { latitude: 40, longitude: 0 },
      system: { peakPowerKw: 1, systemLossPercent: 14, angle: 35, aspect: 0 },
      radiationDatabase: "PVGIS-SARAH3",
      monthly: [],
      annualEnergyKwh: 0,
      annualIrradiationKwhM2: 0,
      hourly: [
        { time: "20200621:1200", G_i: 800, H_sun: 65, T2m: 25, WS10m: 2, P: 700 },
      ],
    };
    const roof35 = createRoofPlane("roof-35", 35, 0, [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 10000 },
      { x: 0, y: 10000 },
    ]);
    await expect(
      computeShadingAdjustedYield(pvgisResult, {
        roofPlane: roof35,
        obstructions: [],
        siteLocation: baseLocation,
        pvgisAngle: 30, // mismatch (roof is 35)
        pvgisAspect: 0,
      }),
    ).rejects.toThrow(/mismatch/i);

    // Also test azimuth mismatch
    await expect(
      computeShadingAdjustedYield(pvgisResult, {
        roofPlane: roof35,
        obstructions: [],
        siteLocation: baseLocation,
        pvgisAngle: 35,
        pvgisAspect: 90, // mismatch (roof is 0)
      }),
    ).rejects.toThrow(/mismatch/i);
  });

  // Test 5: night hour handling - G_i ~ 0, adjusted should not double-derate
  it("night hour: adjustedEnergy equals G_i (no double-derating)", async () => {
    const pvgisResult: PvgisYieldResult = {
      source: "PVGIS",
      location: { latitude: 40, longitude: 0 },
      system: { peakPowerKw: 1, systemLossPercent: 14, angle: 35, aspect: 0 },
      radiationDatabase: "PVGIS-SARAH3",
      monthly: [],
      annualEnergyKwh: 0,
      annualIrradiationKwhM2: 0,
      hourly: [
        { time: "20200621:0010", G_i: 0, H_sun: 0, T2m: 10, WS10m: 2, P: 0 },
      ],
    };
    const roof35 = createRoofPlane("roof-35", 35, 0, [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 10000 },
      { x: 0, y: 10000 },
    ]);
    const result = await computeShadingAdjustedYield(pvgisResult, {
      roofPlane: roof35,
      obstructions: [],
      siteLocation: baseLocation,
      pvgisAngle: 35,
      pvgisAspect: 0,
    });
    expect(result.hourly[0].isNight).toBe(true);
    expect(result.hourly[0].adjustedEnergy).toBe(0);
  });
});
