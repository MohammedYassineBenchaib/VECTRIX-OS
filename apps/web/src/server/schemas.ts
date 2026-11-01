import { z } from "zod";
import {
  BREAKER_RATINGS_A,
  CABLE_TYPES,
  CONDUIT_TYPES,
  EQUIPMENT_CATALOG,
  getSupplyPreset,
  pointSchema,
} from "@vectrix/core";
import { DEFAULT_CONDITIONS } from "@vectrix/electrical";

const equipmentKeys = new Set(EQUIPMENT_CATALOG.map((definition) => definition.key));
const cableKeys = new Set(CABLE_TYPES.map((cable) => cable.key));
const conduitKeys = new Set(CONDUIT_TYPES.map((conduit) => conduit.key));

export const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export const routeStatusSchema = z.object({
  status: z.enum(["visual", "proposed", "validated", "installed"]),
});

const equipmentKeySchema = z
  .string()
  .min(1)
  .refine((key) => equipmentKeys.has(key), { message: "Unknown equipment catalogue key" });

const cableKeySchema = z
  .string()
  .min(1)
  .refine((key) => cableKeys.has(key), { message: "Unknown cable type key" });

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9][A-Z0-9-]*$/, "Use uppercase letters, digits and hyphens"),
  clientName: z.string().trim().max(160).default(""),
  address: z.string().trim().max(300).default(""),
  supplyPresetKey: z
    .string()
    .default("PT-LV-230-400")
    .refine((key) => {
      try {
        getSupplyPreset(key);
        return true;
      } catch {
        return false;
      }
    }, "Unknown supply preset"),
  jurisdiction: z.string().trim().min(2).max(40).default("PT"),
  template: z.enum(["demo", "empty"]).default("empty"),
  widthMm: z.number().int().min(1000).max(200_000).default(12_000),
  heightMm: z.number().int().min(1000).max(200_000).default(9_000),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    clientName: z.string().trim().max(160).optional(),
    address: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(2000).optional(),
    status: z.enum(["draft", "design", "issued", "as_built", "archived"]).optional(),
    voltageDropLimitLightingPct: z.number().positive().max(20).optional(),
    voltageDropLimitOtherPct: z.number().positive().max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields to update" });

export const createEquipmentSchema = z.object({
  levelId: z.string().min(1),
  roomId: z.string().min(1).nullable().optional(),
  definitionKey: equipmentKeySchema,
  label: z.string().trim().min(1).max(40).optional(),
  xMm: z.number().finite().min(0),
  yMm: z.number().finite().min(0),
  rotationDeg: z.number().min(0).max(359).default(0),
  mountingHeightMm: z.number().int().min(0).max(20_000).optional(),
  circuitId: z.string().min(1).nullable().default(null),
  phase: z.enum(["L1", "L2", "L3"]).nullable().default(null),
  loadVAOverride: z.number().nonnegative().max(500_000).nullable().default(null),
  powerFactorOverride: z.number().gt(0).max(1).nullable().default(null),
  notes: z.string().max(1000).default(""),
});
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;

export const updateEquipmentSchema = z
  .object({
    label: z.string().trim().min(1).max(40).optional(),
    roomId: z.string().min(1).nullable().optional(),
    xMm: z.number().finite().min(0).optional(),
    yMm: z.number().finite().min(0).optional(),
    rotationDeg: z.number().min(0).max(359).optional(),
    mountingHeightMm: z.number().int().min(0).max(20_000).optional(),
    circuitId: z.string().min(1).nullable().optional(),
    phase: z.enum(["L1", "L2", "L3"]).nullable().optional(),
    loadVAOverride: z.number().nonnegative().max(500_000).nullable().optional(),
    powerFactorOverride: z.number().gt(0).max(1).nullable().optional(),
    installationState: z.enum(["planned", "installed", "verified", "issue"]).optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields to update" });

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const createCircuitSchema = z.object({
  name: z.string().trim().min(1).max(40),
  description: z.string().trim().max(300).default(""),
  type: z.enum([
    "lighting",
    "sockets",
    "cooker",
    "water_heater",
    "hvac",
    "ev_charging",
    "other_power",
    "data",
  ]),
  phaseMode: z.enum(["single_phase", "three_phase"]).default("single_phase"),
  breakerRatingA: z
    .number()
    .positive()
    .max(630)
    .default(16)
    .refine(
      (value) => (BREAKER_RATINGS_A as readonly number[]).includes(value),
      "Use a standard breaker rating",
    ),
  breakerCurve: z.enum(["B", "C", "D"]).default("B"),
  rcdSensitivityMa: z.number().int().positive().max(1000).nullable().default(30),
  rcdRatingA: z.number().positive().max(630).nullable().default(40),
  cableTypeKey: cableKeySchema.default("h07v-u"),
  cableSectionMm2: z.number().positive().max(300).default(2.5),
  demandFactor: z.number().gt(0).max(1).default(0.2),
  voltageDropLimitPct: z.number().positive().max(20).nullable().default(null),
  color: colorSchema.default("#4fb3ff"),
  notes: z.string().max(1000).default(""),
  boardEquipmentId: z.string().min(1).nullable().default(null),
});
export type CreateCircuitInput = z.infer<typeof createCircuitSchema>;

export const updateCircuitSchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    description: z.string().trim().max(300).optional(),
    breakerRatingA: z.number().positive().max(630).optional(),
    breakerCurve: z.enum(["B", "C", "D"]).optional(),
    rcdSensitivityMa: z.number().int().positive().max(1000).nullable().optional(),
    rcdRatingA: z.number().positive().max(630).nullable().optional(),
    cableTypeKey: cableKeySchema.optional(),
    cableSectionMm2: z.number().positive().max(300).optional(),
    demandFactor: z.number().gt(0).max(1).optional(),
    voltageDropLimitPct: z.number().positive().max(20).nullable().optional(),
    color: colorSchema.optional(),
    notes: z.string().max(1000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields to update" });

export const createRoomSchema = z.object({
  levelId: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  number: z.string().trim().max(20).default(""),
  polygon: z.array(pointSchema).min(3).max(256),
  clearHeightMm: z.number().int().positive().max(20_000).default(2700),
  occupancy: z
    .enum(["dry", "kitchen", "bathroom", "laundry", "garage", "outdoor", "technical"])
    .default("dry"),
  notes: z.string().max(1000).default(""),
});

export const createWallSchema = z.object({
  levelId: z.string().min(1),
  start: pointSchema,
  end: pointSchema,
  thicknessMm: z.number().int().positive().max(2000).default(120),
  heightMm: z.number().int().positive().max(20_000).default(2700),
  kind: z.enum(["exterior", "interior", "partition", "shaft"]).default("interior"),
  material: z.enum(["masonry", "concrete", "drywall", "other"]).default("masonry"),
  loadBearing: z.boolean().default(false),
  allowPenetration: z.boolean().default(true),
});

export const createRouteSchema = z.object({
  levelId: z.string().min(1),
  circuitId: z.string().min(1).nullable().default(null),
  fromEquipmentId: z.string().min(1).nullable().default(null),
  toEquipmentId: z.string().min(1).nullable().default(null),
  points: z.array(pointSchema).min(2).max(512).optional(),
  status: z.enum(["visual", "proposed"]).default("proposed"),
  conduitKey: z
    .string()
    .nullable()
    .default("pvc-20")
    .refine((key) => key === null || conduitKeys.has(key), "Unknown conduit key"),
  notes: z.string().max(1000).default(""),
  slackPercent: z.number().min(0).max(50).default(10),
});
export type CreateRouteInput = z.infer<typeof createRouteSchema>;

export const updateRouteSchema = z
  .object({
    circuitId: z.string().min(1).nullable().optional(),
    conduitKey: z
      .string()
      .nullable()
      .optional()
      .refine((key) => key === undefined || key === null || conduitKeys.has(key), "Unknown conduit key"),
    points: z.array(pointSchema).min(2).max(512).optional(),
    notes: z.string().max(1000).optional(),
    slackPercent: z.number().min(0).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields to update" });

export const updateValidationSchema = z.object({
  status: z.enum(["open", "acknowledged", "accepted_risk", "resolved"]),
});

export const cableSelectionSchema = z.object({
  circuitId: z.string().min(1),
  ambientTempC: z.number().min(-10).max(60).default(DEFAULT_CONDITIONS.ambientTempC),
  groupedCircuits: z.number().int().min(1).max(20).default(DEFAULT_CONDITIONS.groupedCircuits),
  thermalInsulationFactor: z
    .number()
    .gt(0)
    .max(1)
    .default(DEFAULT_CONDITIONS.thermalInsulationFactor),
});

export const levelQuerySchema = z.object({
  levelId: z.string().min(1).optional(),
});


export const solarYieldSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  peakPowerKw: z.number().positive().max(10000),
  systemLossPercent: z.number().min(0).max(100),
  angle: z.number().min(0).max(90).optional(),
  aspect: z.number().min(-180).max(180).optional(),
  includeHourly: z.boolean().optional(),
});
