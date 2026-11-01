import { z } from "zod";

/** Discipline identifiers. Only `electrical` is implemented in the MVP. */
export const disciplineSchema = z.enum(["electrical", "telecom", "solar", "hvac", "plumbing"]);
export type Discipline = z.infer<typeof disciplineSchema>;

export const equipmentCategorySchema = z.enum([
  "socket",
  "switch",
  "light_point",
  "junction_box",
  "distribution_board",
  "protective_device",
  "sensor",
  "data_outlet",
  "network_device",
  "camera",
  "hvac_unit",
  "water_heater",
  "cooker",
  "ev_charger",
  "other",
]);
export type EquipmentCategory = z.infer<typeof equipmentCategorySchema>;

/**
 * Circuit archetypes drive advisory rules. They are engineering classes, not
 * legal categories, and never imply that a design is compliant.
 */
export const circuitTypeSchema = z.enum([
  "lighting",
  "sockets",
  "cooker",
  "water_heater",
  "hvac",
  "ev_charging",
  "other_power",
  "data",
]);
export type CircuitType = z.infer<typeof circuitTypeSchema>;

export const phaseModeSchema = z.enum(["single_phase", "three_phase"]);
export type PhaseMode = z.infer<typeof phaseModeSchema>;

export const earthingSystemSchema = z.enum(["TN-S", "TN-C-S", "TT", "IT"]);
export type EarthingSystem = z.infer<typeof earthingSystemSchema>;

export const mountingMethodSchema = z.enum([
  "wall",
  "ceiling",
  "floor",
  "din_rail",
  "recessed",
  "surface",
]);
export type MountingMethod = z.infer<typeof mountingMethodSchema>;

export const terminalFunctionSchema = z.enum([
  "line",
  "neutral",
  "earth",
  "switched_line",
  "signal",
]);
export type TerminalFunction = z.infer<typeof terminalFunctionSchema>;

export const connectionKindSchema = z.enum([
  "line",
  "neutral",
  "earth",
  "switched_line",
  "data",
]);
export type ConnectionKind = z.infer<typeof connectionKindSchema>;

/**
 * Route lifecycle. A geometric line is never silently promoted to an installed
 * fact: each state requires an explicit action, and `validated` means "the
 * engine checked its constraints", not "a qualified person approved it".
 */
export const routeStatusSchema = z.enum(["visual", "proposed", "validated", "installed"]);
export type RouteStatus = z.infer<typeof routeStatusSchema>;

export const routeMethodSchema = z.enum([
  "conduit_recessed",
  "conduit_surface",
  "cable_tray",
  "direct_buried",
  "cable_free_air",
  "existing_containment",
]);
export type RouteMethod = z.infer<typeof routeMethodSchema>;

export const validationSeveritySchema = z.enum(["info", "warning", "error"]);
export type ValidationSeverity = z.infer<typeof validationSeveritySchema>;

export const validationStatusSchema = z.enum([
  "open",
  "acknowledged",
  "accepted_risk",
  "resolved",
]);
export type ValidationStatus = z.infer<typeof validationStatusSchema>;

export const memberRoleSchema = z.enum(["owner", "admin", "engineer", "technician", "viewer"]);
export type MemberRole = z.infer<typeof memberRoleSchema>;

export const projectStatusSchema = z.enum(["draft", "design", "issued", "as_built", "archived"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const revisionStatusSchema = z.enum(["draft", "issued", "superseded"]);
export type RevisionStatus = z.infer<typeof revisionStatusSchema>;

export const installationTaskStatusSchema = z.enum([
  "pending",
  "in_progress",
  "blocked",
  "completed",
  "verified",
]);
export type InstallationTaskStatus = z.infer<typeof installationTaskStatusSchema>;

export const SEVERITY_ORDER: Record<ValidationSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};
