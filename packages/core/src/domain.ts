import { z } from "zod";
import type { EntityId } from "./ids";
import {
  circuitTypeSchema,
  connectionKindSchema,
  disciplineSchema,
  earthingSystemSchema,
  memberRoleSchema,
  phaseModeSchema,
  projectStatusSchema,
  revisionStatusSchema,
  routeMethodSchema,
  routeStatusSchema,
  terminalFunctionSchema,
  validationSeveritySchema,
  validationStatusSchema,
} from "./enums";

/**
 * Canonical domain schemas.
 *
 * These are the contract between the engineering core, the API and the UI.
 * Database rows are mapped into these shapes; JSON columns are validated on the
 * way in and on the way out so a corrupted or hand-edited row cannot silently
 * poison a calculation.
 */

const ID_REGEX = /^[a-z]{2,3}_[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function idOfKind(prefix: string) {
  return z.string().regex(ID_REGEX).refine((value) => value.startsWith(`${prefix}_`), {
    message: `Expected an identifier starting with "${prefix}_"`,
  });
}

export const pointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});
export type PlanPoint = z.infer<typeof pointSchema>;

export const offsetDateSchema = z.union([z.date(), z.string().datetime()]);

export const projectSchema = z.object({
  id: idOfKind("prj"),
  orgId: idOfKind("org"),
  name: z.string().min(1).max(160),
  code: z.string().min(1).max(40),
  clientName: z.string().max(160).default(""),
  address: z.string().max(300).default(""),
  country: z.string().length(2).default("PT"),
  jurisdiction: z.string().min(2).max(40).default("PT"),
  supplyPresetKey: z.string().min(1),
  phaseVoltageV: z.number().positive(),
  lineVoltageV: z.number().positive(),
  frequencyHz: z.number().positive(),
  earthingSystem: earthingSystemSchema,
  voltageDropLimitLightingPct: z.number().positive().max(20),
  voltageDropLimitOtherPct: z.number().positive().max(20),
  status: projectStatusSchema,
  createdAt: offsetDateSchema,
  updatedAt: offsetDateSchema,
  createdBy: idOfKind("usr"),
  notes: z.string().max(2000).default(""),
});
export type Project = z.infer<typeof projectSchema>;

export const buildingSchema = z.object({
  id: idOfKind("bld"),
  projectId: idOfKind("prj"),
  name: z.string().min(1).max(120),
  address: z.string().max(300).default(""),
  createdAt: offsetDateSchema,
});
export type Building = z.infer<typeof buildingSchema>;

export const levelSchema = z.object({
  id: idOfKind("lvl"),
  buildingId: idOfKind("bld"),
  name: z.string().min(1).max(80),
  /** Elevation relative to project datum. Negative values are basements. */
  elevationMm: z.number().int(),
  planWidthMm: z.number().int().positive().max(500_000),
  planHeightMm: z.number().int().positive().max(500_000),
  sortOrder: z.number().int().nonnegative(),
  underlayUrl: z.string().max(1000).nullable().default(null),
  underlayOpacity: z.number().min(0).max(1).default(1),
  /** Calibration factor for an imported raster underlay. 1 = already to scale. */
  underlayScale: z.number().positive().default(1),
  notes: z.string().max(1000).default(""),
});
export type Level = z.infer<typeof levelSchema>;

export const wallSchema = z.object({
  id: idOfKind("wal"),
  levelId: idOfKind("lvl"),
  startX: z.number(),
  startY: z.number(),
  endX: z.number(),
  endY: z.number(),
  thicknessMm: z.number().int().positive().max(2000),
  heightMm: z.number().int().positive().max(20_000),
  kind: z.enum(["exterior", "interior", "partition", "shaft"]),
  material: z.enum(["masonry", "concrete", "drywall", "other"]).default("masonry"),
  loadBearing: z.boolean().default(false),
  /** Penetrations are explicit; a route crossing a wall without one is flagged. */
  allowPenetration: z.boolean().default(false),
});
export type Wall = z.infer<typeof wallSchema>;

export const roomSchema = z.object({
  id: idOfKind("rm"),
  levelId: idOfKind("lvl"),
  name: z.string().min(1).max(80),
  number: z.string().max(20).default(""),
  polygon: z.array(pointSchema).min(3).max(256),
  clearHeightMm: z.number().int().positive().max(20_000),
  occupancy: z.enum(["dry", "kitchen", "bathroom", "laundry", "garage", "outdoor", "technical"]),
  notes: z.string().max(1000).default(""),
});
export type Room = z.infer<typeof roomSchema>;

export const phaseSchema = z.enum(["L1", "L2", "L3"]);
export type Phase = z.infer<typeof phaseSchema>;

export const equipmentSchema = z.object({
  id: idOfKind("eq"),
  levelId: idOfKind("lvl"),
  roomId: idOfKind("rm").nullable(),
  definitionKey: z.string().min(1),
  label: z.string().min(1).max(40),
  xMm: z.number(),
  yMm: z.number(),
  rotationDeg: z.number().min(0).max(359).default(0),
  mountingHeightMm: z.number().int().nonnegative().max(20_000),
  circuitId: idOfKind("ckt").nullable(),
  phase: phaseSchema.nullable(),
  /** Overrides the catalogue default; both null means "use the catalogue value". */
  loadVAOverride: z.number().nonnegative().nullable().default(null),
  powerFactorOverride: z.number().gt(0).max(1).nullable().default(null),
  installationState: z
    .enum(["planned", "installed", "verified", "issue"])
    .default("planned"),
  source: z.enum(["manual", "import", "ai"]).default("manual"),
  notes: z.string().max(1000).default(""),
  createdAt: offsetDateSchema,
  updatedAt: offsetDateSchema,
});
export type Equipment = z.infer<typeof equipmentSchema>;

export const terminalSchema = z.object({
  id: idOfKind("trm"),
  equipmentId: idOfKind("eq"),
  designation: z.string().min(1).max(12),
  function: terminalFunctionSchema,
  capacity: z.number().int().positive().max(8),
});
export type Terminal = z.infer<typeof terminalSchema>;

export const connectionSchema = z.object({
  id: idOfKind("cn"),
  fromTerminalId: idOfKind("trm"),
  toTerminalId: idOfKind("trm"),
  kind: connectionKindSchema,
  notes: z.string().max(500).default(""),
  createdAt: offsetDateSchema,
});
export type Connection = z.infer<typeof connectionSchema>;

export const circuitSchema = z.object({
  id: idOfKind("ckt"),
  projectId: idOfKind("prj"),
  boardEquipmentId: idOfKind("eq").nullable(),
  name: z.string().min(1).max(40),
  description: z.string().max(300).default(""),
  type: circuitTypeSchema,
  phaseMode: phaseModeSchema,
  breakerRatingA: z.number().positive().max(630),
  breakerCurve: z.enum(["B", "C", "D"]),
  rcdSensitivityMa: z.number().int().positive().max(1000).nullable(),
  rcdRatingA: z.number().positive().max(630).nullable(),
  cableTypeKey: z.string().min(1),
  cableSectionMm2: z.number().positive().max(300),
  /** Fraction of connected load expected to run simultaneously. Explicit assumption. */
  demandFactor: z.number().gt(0).max(1),
  voltageDropLimitPct: z.number().positive().max(20).nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  notes: z.string().max(1000).default(""),
  createdAt: offsetDateSchema,
  updatedAt: offsetDateSchema,
});
export type Circuit = z.infer<typeof circuitSchema>;

export const routeDiagnosticSchema = z.object({
  code: z.string().min(1).max(40),
  severity: validationSeveritySchema,
  message: z.string().min(1).max(500),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type RouteDiagnostic = z.infer<typeof routeDiagnosticSchema>;

export const routeSchema = z.object({
  id: idOfKind("rte"),
  levelId: idOfKind("lvl"),
  circuitId: idOfKind("ckt").nullable(),
  fromEquipmentId: idOfKind("eq").nullable(),
  toEquipmentId: idOfKind("eq").nullable(),
  status: routeStatusSchema,
  method: routeMethodSchema,
  conduitKey: z.string().nullable().default(null),
  cableTypeKey: z.string().nullable().default(null),
  points: z.array(pointSchema).min(2).max(512),
  lengthMm: z.number().nonnegative(),
  /** Installation slack added when converting route length to ordered cable length. */
  slackPercent: z.number().min(0).max(50).default(10),
  diagnostics: z.array(routeDiagnosticSchema).default([]),
  notes: z.string().max(1000).default(""),
  createdAt: offsetDateSchema,
  createdBy: idOfKind("usr"),
  validatedAt: offsetDateSchema.nullable().default(null),
  validatedRuleSetVersion: z.string().nullable().default(null),
});
export type Route = z.infer<typeof routeSchema>;

export const validationResultSchema = z.object({
  id: idOfKind("val"),
  projectId: idOfKind("prj"),
  levelId: idOfKind("lvl").nullable(),
  ruleId: z.string().min(1).max(40),
  ruleSetVersion: z.string().min(1).max(40),
  severity: validationSeveritySchema,
  status: validationStatusSchema,
  discipline: disciplineSchema,
  entityType: z.enum(["project", "circuit", "equipment", "route", "room", "connection"]),
  entityId: z.string().min(1),
  message: z.string().min(1).max(1000),
  /** Assumptions and measured values that produced this result. */
  details: z.record(z.string(), z.unknown()).default({}),
  createdAt: offsetDateSchema,
  /** When the most recent acknowledgement, risk acceptance or resolution was recorded. */
  decidedAt: offsetDateSchema.nullable().default(null),
  decidedBy: idOfKind("usr").nullable().default(null),
  resolvedAt: offsetDateSchema.nullable().default(null),
  resolvedBy: idOfKind("usr").nullable().default(null),
});
export type ValidationResult = z.infer<typeof validationResultSchema>;

export const calculationSchema = z.object({
  id: idOfKind("calc"),
  projectId: idOfKind("prj"),
  circuitId: idOfKind("ckt").nullable(),
  type: z.enum(["load_schedule", "voltage_drop", "cable_selection", "takeoff"]),
  methodVersion: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()),
  createdAt: offsetDateSchema,
});
export type Calculation = z.infer<typeof calculationSchema>;

export const auditEventSchema = z.object({
  id: idOfKind("aud"),
  orgId: idOfKind("org"),
  projectId: idOfKind("prj").nullable(),
  actorId: idOfKind("usr"),
  action: z.string().min(1).max(80),
  entityType: z.string().min(1).max(40),
  entityId: z.string().min(1).max(80),
  payload: z.record(z.string(), z.unknown()).default({}),
  createdAt: offsetDateSchema,
});
export type AuditEvent = z.infer<typeof auditEventSchema>;

export const revisionSchema = z.object({
  id: idOfKind("rev"),
  projectId: idOfKind("prj"),
  label: z.string().min(1).max(80),
  status: revisionStatusSchema,
  snapshot: z.record(z.string(), z.unknown()),
  createdAt: offsetDateSchema,
  createdBy: idOfKind("usr"),
  note: z.string().max(1000).default(""),
});
export type Revision = z.infer<typeof revisionSchema>;

export const organizationSchema = z.object({
  id: idOfKind("org"),
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  createdAt: offsetDateSchema,
});
export type Organization = z.infer<typeof organizationSchema>;

export const userSchema = z.object({
  id: idOfKind("usr"),
  email: z.string().email().max(200),
  name: z.string().min(1).max(120),
  createdAt: offsetDateSchema,
});
export type User = z.infer<typeof userSchema>;

export const membershipSchema = z.object({
  id: idOfKind("mem"),
  orgId: idOfKind("org"),
  userId: idOfKind("usr"),
  role: memberRoleSchema,
  createdAt: offsetDateSchema,
});
export type Membership = z.infer<typeof membershipSchema>;

/**
 * Everything the plan workspace needs in one consistent read. Passing one
 * aggregate prevents the UI from combining objects from different revisions.
 */
export const levelWorkspaceSchema = z.object({
  project: projectSchema,
  building: buildingSchema,
  level: levelSchema,
  rooms: z.array(roomSchema),
  walls: z.array(wallSchema),
  equipment: z.array(equipmentSchema),
  terminals: z.array(terminalSchema),
  connections: z.array(connectionSchema),
  circuits: z.array(circuitSchema),
  routes: z.array(routeSchema),
  validations: z.array(validationResultSchema),
});
export type LevelWorkspace = z.infer<typeof levelWorkspaceSchema>;

export type EntityIdOf<T extends { id: string }> = T["id"] & EntityId;
