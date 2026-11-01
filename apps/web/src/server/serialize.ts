import type {
  Building as BuildingRow,
  Circuit as CircuitRow,
  Connection as ConnectionRow,
  Equipment as EquipmentRow,
  Level as LevelRow,
  Project as ProjectRow,
  Room as RoomRow,
  Route as RouteRow,
  Terminal as TerminalRow,
  ValidationResult as ValidationRow,
  Wall as WallRow,
} from "@prisma/client";
import {
  buildingSchema,
  circuitSchema,
  connectionSchema,
  equipmentSchema,
  levelSchema,
  projectSchema,
  roomSchema,
  routeDiagnosticSchema,
  routeSchema,
  terminalSchema,
  validationResultSchema,
  wallSchema,
  pointSchema,
  type Building,
  type Circuit,
  type Connection,
  type Equipment,
  type Level,
  type Project,
  type Room,
  type Route,
  type Terminal,
  type ValidationResult,
  type Wall,
} from "@vectrix/core";
import type { z } from "zod";

/**
 * Database rows are not domain objects.
 *
 * JSON columns arrive as strings, dates as Date instances, and the database does
 * not know that a circuit's cable section must be positive. Every row therefore
 * passes through the same Zod schema that guards the API. A hand-edited row or a
 * failed migration fails loudly here instead of silently corrupting a schedule.
 */

class RowShapeError extends Error {
  constructor(entity: string, id: string, issues: z.ZodError["issues"]) {
    super(
      `Stored ${entity} "${id}" does not satisfy the domain schema: ${issues
        .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "RowShapeError";
  }
}

function parseJsonColumn(entity: string, id: string, column: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Stored ${entity} "${id}" has invalid JSON in ${column}.`);
  }
}

function parseRow<T>(schema: z.ZodType<T>, entity: string, id: string, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new RowShapeError(entity, id, parsed.error.issues);
  return parsed.data;
}

export function serializeProject(row: ProjectRow): Project {
  return parseRow(
    projectSchema,
    "project",
    row.id,
    {
      ...row,
      status: row.status,
      earthingSystem: row.earthingSystem,
    },
  );
}

export function serializeBuilding(row: BuildingRow): Building {
  return parseRow(buildingSchema, "building", row.id, row);
}

export function serializeLevel(row: LevelRow): Level {
  return parseRow(levelSchema, "level", row.id, row);
}

export function serializeRoom(row: RoomRow): Room {
  return parseRow(roomSchema, "room", row.id, {
    ...row,
    polygon: parseJsonColumn("room", row.id, "polygonJson", row.polygonJson),
  });
}

export function serializeWall(row: WallRow): Wall {
  return parseRow(wallSchema, "wall", row.id, row);
}

export function serializeEquipment(row: EquipmentRow): Equipment {
  return parseRow(equipmentSchema, "equipment", row.id, row);
}

export function serializeTerminal(row: TerminalRow): Terminal {
  return parseRow(terminalSchema, "terminal", row.id, row);
}

export function serializeConnection(row: ConnectionRow): Connection {
  return parseRow(connectionSchema, "connection", row.id, row);
}

export function serializeCircuit(row: CircuitRow): Circuit {
  return parseRow(circuitSchema, "circuit", row.id, row);
}

export function serializeRoute(row: RouteRow): Route {
  const points = parseJsonColumn("route", row.id, "pointsJson", row.pointsJson);
  const rawDiagnostics = parseJsonColumn("route", row.id, "diagnosticsJson", row.diagnosticsJson);
  if (!Array.isArray(rawDiagnostics)) {
    throw new Error(`Stored route "${row.id}" has a non-array diagnosticsJson column.`);
  }
  return parseRow(routeSchema, "route", row.id, {
    ...row,
    points,
    diagnostics: rawDiagnostics.map((item) =>
      parseRow(routeDiagnosticSchema, "route diagnostic", row.id, item),
    ),
  });
}

export function serializeValidation(row: ValidationRow): ValidationResult {
  return parseRow(validationResultSchema, "validation result", row.id, {
    ...row,
    details: parseJsonColumn("validation result", row.id, "detailsJson", row.detailsJson),
  });
}

/** Parses a stored point list without constructing a full route. */
export function parseStoredPoints(row: RouteRow) {
  const raw = parseJsonColumn("route", row.id, "pointsJson", row.pointsJson);
  const parsed = pointSchema.array().min(2).safeParse(raw);
  if (!parsed.success) throw new RowShapeError("route", row.id, parsed.error.issues);
  return parsed.data;
}
