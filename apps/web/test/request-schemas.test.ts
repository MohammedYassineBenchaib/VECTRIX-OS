import { describe, expect, it } from "vitest";
import {
  cableSelectionSchema,
  createCircuitSchema,
  createEquipmentSchema,
  createProjectSchema,
  createRoomSchema,
  createRouteSchema,
  createWallSchema,
  loginSchema,
  updateCircuitSchema,
  updateEquipmentSchema,
  updateProjectSchema,
  updateRouteSchema,
  updateValidationSchema,
  solarYieldSchema,
} from "@/server/schemas";

function messages(result: { success: boolean; error?: { issues: Array<{ message: string }> } }): string[] {
  return result.success ? [] : (result.error?.issues ?? []).map((issue) => issue.message);
}

describe("login schema", () => {
  it("trims the email and requires a password", () => {
    expect(loginSchema.parse({ email: "  engineer@vectrix.pt ", password: "secret" })).toEqual({
      email: "engineer@vectrix.pt",
      password: "secret",
    });
    expect(loginSchema.safeParse({ email: "not-an-email", password: "secret" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "engineer@vectrix.pt", password: "" }).success).toBe(false);
  });
});

describe("project schemas", () => {
  it("applies documented project defaults", () => {
    const parsed = createProjectSchema.parse({ name: "T3 Porto", code: "VX-2026-014" });
    expect(parsed).toMatchObject({
      name: "T3 Porto",
      code: "VX-2026-014",
      clientName: "",
      address: "",
      supplyPresetKey: "PT-LV-230-400",
      jurisdiction: "PT",
      template: "empty",
      widthMm: 12_000,
      heightMm: 9_000,
    });
  });

  it("rejects lowercase or space-separated codes", () => {
    expect(createProjectSchema.safeParse({ name: "X", code: "vx-1" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: "X", code: "VX 1" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: "X", code: "-VX" }).success).toBe(false);
  });

  it("rejects unknown supply presets and out-of-range sheets", () => {
    const unknownPreset = createProjectSchema.safeParse({
      name: "X",
      code: "VX-1",
      supplyPresetKey: "MARS-LV-999",
    });
    expect(messages(unknownPreset)).toContain("Unknown supply preset");
    expect(createProjectSchema.safeParse({ name: "X", code: "VX-1", widthMm: 999 }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: "X", code: "VX-1", heightMm: 200_001 }).success).toBe(false);
  });

  it("requires at least one field on update and refuses an empty body", () => {
    expect(updateProjectSchema.safeParse({}).success).toBe(false);
    expect(updateProjectSchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
    expect(updateProjectSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });
});

describe("equipment schemas", () => {
  const base = { levelId: "lvl_ground", definitionKey: "socket-schuko-16a-2p-e", xMm: 1200, yMm: 800 };

  it("accepts catalogue keys and applies safe defaults", () => {
    const parsed = createEquipmentSchema.parse(base);
    expect(parsed.roomId).toBeUndefined();
    expect(parsed).toMatchObject({
      rotationDeg: 0,
      circuitId: null,
      phase: null,
      loadVAOverride: null,
      powerFactorOverride: null,
      notes: "",
    });
  });

  it("rejects unknown catalogue keys", () => {
    const result = createEquipmentSchema.safeParse({ ...base, definitionKey: "socket-made-up" });
    expect(messages(result)).toContain("Unknown equipment catalogue key");
  });

  it("rejects impossible geometry, rotation and load values", () => {
    expect(createEquipmentSchema.safeParse({ ...base, xMm: -1 }).success).toBe(false);
    expect(createEquipmentSchema.safeParse({ ...base, xMm: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(createEquipmentSchema.safeParse({ ...base, rotationDeg: 360 }).success).toBe(false);
    expect(createEquipmentSchema.safeParse({ ...base, powerFactorOverride: 0 }).success).toBe(false);
    expect(createEquipmentSchema.safeParse({ ...base, loadVAOverride: 500_001 }).success).toBe(false);
    expect(createEquipmentSchema.safeParse({ ...base, phase: "L4" }).success).toBe(false);
  });

  it("allows clearing optional assignments and rejects empty updates", () => {
    expect(updateEquipmentSchema.parse({ circuitId: null, phase: null, roomId: null })).toEqual({
      circuitId: null,
      phase: null,
      roomId: null,
    });
    expect(updateEquipmentSchema.safeParse({}).success).toBe(false);
    expect(updateEquipmentSchema.safeParse({ installationState: "removed" }).success).toBe(false);
  });
});

describe("circuit schemas", () => {
  it("applies schedule defaults and accepts a standard breaker", () => {
    const parsed = createCircuitSchema.parse({ name: "Kitchen sockets", type: "sockets" });
    expect(parsed).toMatchObject({
      phaseMode: "single_phase",
      breakerRatingA: 16,
      breakerCurve: "B",
      rcdSensitivityMa: 30,
      rcdRatingA: 40,
      cableTypeKey: "h07v-u",
      cableSectionMm2: 2.5,
      demandFactor: 0.2,
      color: "#4fb3ff",
      boardEquipmentId: null,
    });
  });

  it("rejects a non-standard breaker rating", () => {
    const result = createCircuitSchema.safeParse({ name: "X", type: "sockets", breakerRatingA: 17 });
    expect(messages(result)).toContain("Use a standard breaker rating");
    expect(createCircuitSchema.safeParse({ name: "X", type: "sockets", breakerRatingA: 63 }).success).toBe(true);
  });

  it("rejects unknown cable keys, malformed colours and invalid demand factors", () => {
    expect(createCircuitSchema.safeParse({ name: "X", type: "sockets", cableTypeKey: "bell-wire" }).success).toBe(false);
    expect(createCircuitSchema.safeParse({ name: "X", type: "sockets", color: "red" }).success).toBe(false);
    expect(createCircuitSchema.safeParse({ name: "X", type: "sockets", demandFactor: 0 }).success).toBe(false);
    expect(createCircuitSchema.safeParse({ name: "X", type: "sockets", demandFactor: 1.01 }).success).toBe(false);
  });

  it("keeps RCD values nullable and rejects empty updates", () => {
    expect(createCircuitSchema.parse({ name: "X", type: "lighting", rcdSensitivityMa: null }).rcdSensitivityMa).toBeNull();
    expect(updateCircuitSchema.parse({ rcdSensitivityMa: null })).toEqual({ rcdSensitivityMa: null });
    expect(updateCircuitSchema.safeParse({}).success).toBe(false);
  });
});

describe("plan geometry schemas", () => {
  it("requires at least three room vertices and applies envelope defaults", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 3000 },
    ];
    const parsed = createRoomSchema.parse({ levelId: "lvl_ground", name: "Living", polygon });
    expect(parsed).toMatchObject({ number: "", clearHeightMm: 2700, occupancy: "dry", notes: "" });
    expect(createRoomSchema.safeParse({ levelId: "lvl_ground", name: "Line", polygon: polygon.slice(0, 2) }).success).toBe(false);
    expect(createRoomSchema.safeParse({ levelId: "lvl_ground", name: "X", polygon, occupancy: "attic" }).success).toBe(false);
  });

  it("validates wall geometry and uses conservative defaults", () => {
    const parsed = createWallSchema.parse({
      levelId: "lvl_ground",
      start: { x: 0, y: 0 },
      end: { x: 5000, y: 0 },
    });
    expect(parsed).toMatchObject({
      thicknessMm: 120,
      heightMm: 2700,
      kind: "interior",
      material: "masonry",
      loadBearing: false,
      allowPenetration: true,
    });
    expect(createWallSchema.safeParse({ levelId: "lvl_ground", start: { x: "a", y: 0 }, end: { x: 1, y: 0 } }).success).toBe(false);
    expect(
      createWallSchema.safeParse({
        levelId: "lvl_ground",
        start: { x: 0, y: 0 },
        end: { x: 1, y: 0 },
        thicknessMm: 0,
      }).success,
    ).toBe(false);
  });

  it("requires two route points and a known conduit", () => {
    const parsed = createRouteSchema.parse({
      levelId: "lvl_ground",
      points: [
        { x: 0, y: 0 },
        { x: 1000, y: 0 },
      ],
    });
    expect(parsed).toMatchObject({ status: "proposed", conduitKey: "pvc-20", slackPercent: 10 });
    expect(
      createRouteSchema.safeParse({
        levelId: "lvl_ground",
        points: [{ x: 0, y: 0 }],
      }).success,
    ).toBe(false);
    expect(
      createRouteSchema.safeParse({
        levelId: "lvl_ground",
        points: [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
        ],
        conduitKey: "steel-unknown",
      }).success,
    ).toBe(false);
    expect(
      createRouteSchema.parse({
        levelId: "lvl_ground",
        points: [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
        ],
        conduitKey: null,
      }).conduitKey,
    ).toBeNull();
  });

  it("rejects unmapped route statuses and empty route updates", () => {
    expect(
      createRouteSchema.safeParse({
        levelId: "lvl_ground",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        status: "installed",
      }).success,
    ).toBe(false);
    expect(updateRouteSchema.parse({ conduitKey: null })).toEqual({ conduitKey: null });
    expect(updateRouteSchema.safeParse({}).success).toBe(false);
    expect(updateRouteSchema.safeParse({ slackPercent: 51 }).success).toBe(false);
  });
});

describe("workflow schemas", () => {
  it("only accepts the documented validation decisions", () => {
    for (const status of ["open", "acknowledged", "accepted_risk", "resolved"]) {
      expect(updateValidationSchema.safeParse({ status }).success).toBe(true);
    }
    expect(updateValidationSchema.safeParse({ status: "approved" }).success).toBe(false);
  });

  it("applies advisory cable-selection conditions", () => {
    const parsed = cableSelectionSchema.parse({ circuitId: "ckt_1" });
    expect(parsed.ambientTempC).toBe(30);
    expect(parsed.groupedCircuits).toBe(1);
    expect(parsed.thermalInsulationFactor).toBe(1);
    expect(cableSelectionSchema.safeParse({ circuitId: "ckt_1", ambientTempC: 61 }).success).toBe(false);
    expect(cableSelectionSchema.safeParse({ circuitId: "ckt_1", groupedCircuits: 0 }).success).toBe(false);
    expect(cableSelectionSchema.safeParse({ circuitId: "ckt_1", thermalInsulationFactor: 0 }).success).toBe(false);
  });
});


describe("solar yield schema", () => {
  it("accepts valid solar yield request", () => {
    const result = solarYieldSchema.safeParse({
      latitude: 38.7223,
      longitude: -9.1393,
      peakPowerKw: 5,
      systemLossPercent: 14,
      angle: 35,
      aspect: 0,
      includeHourly: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid latitude", () => {
    expect(solarYieldSchema.safeParse({ latitude: 91, longitude: 0, peakPowerKw: 1, systemLossPercent: 14 }).success).toBe(false);
    expect(solarYieldSchema.safeParse({ latitude: -91, longitude: 0, peakPowerKw: 1, systemLossPercent: 14 }).success).toBe(false);
  });

  it("rejects invalid peakPowerKw", () => {
    expect(solarYieldSchema.safeParse({ latitude: 40, longitude: 0, peakPowerKw: 0, systemLossPercent: 14 }).success).toBe(false);
    expect(solarYieldSchema.safeParse({ latitude: 40, longitude: 0, peakPowerKw: 10001, systemLossPercent: 14 }).success).toBe(false);
  });

  it("rejects invalid systemLossPercent", () => {
    expect(solarYieldSchema.safeParse({ latitude: 40, longitude: 0, peakPowerKw: 1, systemLossPercent: -1 }).success).toBe(false);
    expect(solarYieldSchema.safeParse({ latitude: 40, longitude: 0, peakPowerKw: 1, systemLossPercent: 101 }).success).toBe(false);
  });

  it("allows optional fields to be omitted", () => {
    const result = solarYieldSchema.safeParse({ latitude: 40, longitude: 0, peakPowerKw: 1, systemLossPercent: 14 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.angle).toBeUndefined();
      expect(result.data.aspect).toBeUndefined();
      expect(result.data.includeHourly).toBeUndefined();
    }
  });
});
