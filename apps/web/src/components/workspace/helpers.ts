import type { Circuit, Equipment, Room, Route, ValidationResult } from "@vectrix/core";

export const CIRCUIT_TYPE_LABEL: Record<string, string> = {
  lighting: "Lighting",
  sockets: "Sockets",
  cooker: "Cooker",
  water_heater: "Water heater",
  hvac: "HVAC",
  ev_charging: "EV charging",
  other_power: "Other power",
  data: "Data",
};

export const ROUTE_STATUS_LABEL: Record<string, string> = {
  visual: "Visual",
  proposed: "Proposed",
  validated: "Validated",
  installed: "Installed",
};

export const OCCUPANCY_LABEL: Record<string, string> = {
  dry: "Dry interior",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  laundry: "Laundry",
  garage: "Garage",
  outdoor: "Outdoor",
  technical: "Technical",
};

export const VALIDATION_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  accepted_risk: "Accepted risk",
  resolved: "Resolved",
};

export const EQUIPMENT_STATE_LABEL: Record<string, string> = {
  planned: "Planned",
  installed: "Installed",
  verified: "Verified",
  issue: "Issue",
};

export const WALL_KIND_LABEL: Record<string, string> = {
  exterior: "Exterior",
  interior: "Interior",
  partition: "Partition",
  shaft: "Shaft",
};

export const ROUTE_TRANSITIONS: Record<string, Route["status"][]> = {
  visual: ["proposed"],
  proposed: ["validated", "visual"],
  validated: ["installed", "proposed"],
  installed: [],
};

export function circuitTypeLabel(type: string): string {
  return CIRCUIT_TYPE_LABEL[type] ?? type;
}

export function routeStatusLabel(status: string): string {
  return ROUTE_STATUS_LABEL[status] ?? status;
}

export function occupancyLabel(value: string): string {
  return OCCUPANCY_LABEL[value] ?? value;
}

export function validationStatusLabel(value: string): string {
  return VALIDATION_STATUS_LABEL[value] ?? value;
}

export function equipmentStateLabel(value: string): string {
  return EQUIPMENT_STATE_LABEL[value] ?? value;
}

export function wallKindLabel(value: string): string {
  return WALL_KIND_LABEL[value] ?? value;
}

export function severityTone(severity: ValidationResult["severity"]): "error" | "warning" | "info" {
  return severity;
}

export function severityRank(severity: ValidationResult["severity"]): number {
  return severity === "error" ? 0 : severity === "warning" ? 1 : 2;
}

export function sortFindings(rows: ValidationResult[]): ValidationResult[] {
  return [...rows].sort((a, b) => {
    const bySeverity = severityRank(a.severity) - severityRank(b.severity);
    if (bySeverity !== 0) return bySeverity;
    return a.ruleId.localeCompare(b.ruleId);
  });
}

export function openFindings(rows: ValidationResult[]): ValidationResult[] {
  return sortFindings(rows.filter((row) => row.status !== "resolved"));
}

export function pointOnSegment(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > 1e-6) return false;
  return (
    point.x >= Math.min(a.x, b.x) - 1e-6 &&
    point.x <= Math.max(a.x, b.x) + 1e-6 &&
    point.y >= Math.min(a.y, b.y) - 1e-6 &&
    point.y <= Math.max(a.y, b.y) + 1e-6
  );
}

export function pointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
  // Boundary points count as inside: clicking a shared wall selects the room
  // instead of falling through to no room at all.
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (pointOnSegment(point, a, b)) return true;
    const intersects =
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || Number.EPSILON) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function polygonAreaMm2(polygon: Array<{ x: number; y: number }>): number {
  return (
    Math.abs(
      polygon.reduce((sum, point, index) => {
        const next = polygon[(index + 1) % polygon.length]!;
        return sum + point.x * next.y - next.x * point.y;
      }, 0),
    ) / 2
  );
}

export function polygonBounds(polygon: Array<{ x: number; y: number }>) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

export function roomAtPoint(
  rooms: Room[],
  point: { x: number; y: number },
): Room | undefined {
  // Iterated in reverse so the most recently created room wins an overlap.
  for (let index = rooms.length - 1; index >= 0; index -= 1) {
    const room = rooms[index]!;
    if (pointInPolygon(point, room.polygon)) return room;
  }
  return undefined;
}

export function distanceMm(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function nearestEquipment(
  equipment: Equipment[],
  point: { x: number; y: number },
  toleranceMm: number,
): Equipment | undefined {
  let best: Equipment | undefined;
  let bestDistance = toleranceMm;
  for (const item of equipment) {
    const distance = distanceMm(point, { x: item.xMm, y: item.yMm });
    if (distance <= bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }
  return best;
}

export function snapToGrid(value: number, stepMm = 50): number {
  return Math.round(value / stepMm) * stepMm;
}

export function clampToPlan(
  point: { x: number; y: number },
  widthMm: number,
  heightMm: number,
): { x: number; y: number } {
  return {
    x: Math.min(widthMm, Math.max(0, point.x)),
    y: Math.min(heightMm, Math.max(0, point.y)),
  };
}

export function orthogonalPoint(
  point: { x: number; y: number },
  previous: { x: number; y: number } | undefined,
): { x: number; y: number } {
  if (!previous) return point;
  const dx = Math.abs(point.x - previous.x);
  const dy = Math.abs(point.y - previous.y);
  return dx >= dy ? { x: point.x, y: previous.y } : { x: previous.x, y: point.y };
}

export function equipmentCircuit(
  equipment: Equipment,
  circuitsById: Map<string, Circuit>,
): Circuit | undefined {
  return equipment.circuitId ? circuitsById.get(equipment.circuitId) : undefined;
}

export function routeCircuit(route: Route, circuitsById: Map<string, Circuit>): Circuit | undefined {
  return route.circuitId ? circuitsById.get(route.circuitId) : undefined;
}

export function routeLengthForCircuit(routes: Route[], circuitId: string): number {
  return routes
    .filter((route) => route.circuitId === circuitId)
    .reduce((sum, route) => sum + route.lengthMm, 0);
}

export function findingEntityLabel(finding: ValidationResult): string {
  const type = finding.entityType;
  if (type === "equipment") return "Equipment";
  if (type === "route") return "Route";
  if (type === "circuit") return "Circuit";
  if (type === "room") return "Room";
  if (type === "connection") return "Connection";
  return "Project";
}

export function validationDetailRows(finding: ValidationResult): Array<[string, string]> {
  return Object.entries(finding.details).map(([key, value]) => {
    let text: string;
    if (value === null) text = "null";
    else if (typeof value === "object") text = JSON.stringify(value);
    else text = String(value);
    return [key, text];
  });
}

export function downloadUrl(path: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = path;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
