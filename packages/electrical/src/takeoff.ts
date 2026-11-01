/**
 * Material take-off.
 *
 * Every line declares how its quantity was obtained. "Measured" means derived
 * from recorded geometry; "inferred" adds a stated allowance; "assumed" depends
 * on a design assumption; "catalogue" is a count of placed objects. No supplier
 * price is invented by this module.
 */

import {
  type Circuit,
  type Equipment,
  type EquipmentDefinition,
  type Project,
  type Room,
  type Route,
} from "@vectrix/core";
import { polylineLength } from "@vectrix/core";

export const TAKEOFF_METHOD_VERSION = "takeoff-2026.10";

export type QuantityBasis = "measured" | "inferred" | "assumed" | "catalogue";

export interface TakeoffLine {
  key: string;
  description: string;
  category: "equipment" | "cable" | "containment" | "accessory";
  unit: "un" | "m" | "box";
  quantity: number;
  basis: QuantityBasis;
  source: string;
  note: string;
}

export interface MaterialTakeoff {
  lines: TakeoffLine[];
  assumptions: string[];
  methodVersion: string;
  totals: {
    equipmentUnits: number;
    cableMetres: number;
    containmentMetres: number;
  };
}

export interface TakeoffInput {
  project: Project;
  circuits: Circuit[];
  equipment: Equipment[];
  rooms: Room[];
  routes: Route[];
  resolveDefinition: (key: string) => EquipmentDefinition | undefined;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeTakeoff(input: TakeoffInput): MaterialTakeoff {
  const lines: TakeoffLine[] = [];
  const assumptions: string[] = [
    "Cable lengths are route lengths plus the route slack percentage plus vertical drops derived from mounting heights.",
    "No supplier price is included. Prices require a licensed price source or manual entry.",
    "Containment quantities assume one conduit per route. Shared containment must be modelled explicitly.",
    "Waste, fixings, terminations and small consumables are not included.",
  ];

  const equipmentGroups = new Map<
    string,
    { definition: EquipmentDefinition | undefined; items: Equipment[] }
  >();
  for (const item of input.equipment) {
    const group = equipmentGroups.get(item.definitionKey) ?? {
      definition: input.resolveDefinition(item.definitionKey),
      items: [],
    };
    group.items.push(item);
    equipmentGroups.set(item.definitionKey, group);
  }

  for (const [key, group] of [...equipmentGroups].sort((a, b) => a[0].localeCompare(b[0]))) {
    const definition = group.definition;
    lines.push({
      key: `equipment:${key}`,
      description: definition?.name ?? `Unknown product (${key})`,
      category: "equipment",
      unit: "un",
      quantity: group.items.length,
      basis: "catalogue",
      source: "Placed equipment instances",
      note: definition
        ? `Generic catalogue item; manufacturer reference not selected. ${group.items.length} instance(s) placed.`
        : "Unknown catalogue key — resolve before issuing a bill of materials.",
    });
  }

  const surfaceBoxCount = input.equipment.filter((item) => {
    const category = input.resolveDefinition(item.definitionKey)?.category;
    return category === "socket" || category === "switch" || category === "data_outlet";
  }).length;
  if (surfaceBoxCount > 0) {
    lines.push({
      key: "accessory:mounting-box",
      description: "Mounting box / back box for wall accessories",
      category: "accessory",
      unit: "un",
      quantity: surfaceBoxCount,
      basis: "inferred",
      source: "One box per socket, switch and data outlet",
      note: "Assumes one box per wall accessory; multi-gang frames may reduce the count.",
    });
  }

  const equipmentById = new Map(input.equipment.map((item) => [item.id, item]));
  const circuitById = new Map(input.circuits.map((circuit) => [circuit.id, circuit]));

  const cableByKey = new Map<
    string,
    { cableTypeKey: string; sectionMm2: number; metres: number; circuitNames: Set<string> }
  >();
  const containmentByKey = new Map<string, { metres: number; routeCount: number }>();

  for (const route of input.routes) {
    const from = route.fromEquipmentId ? equipmentById.get(route.fromEquipmentId) : undefined;
    const to = route.toEquipmentId ? equipmentById.get(route.toEquipmentId) : undefined;
    const verticalMm = (from?.mountingHeightMm ?? 0) + (to?.mountingHeightMm ?? 0);
    const planar = polylineLength(route.points);
    const withSlack = planar * (1 + route.slackPercent / 100);
    const totalMm = withSlack + verticalMm;

    if (route.circuitId) {
      const circuit = circuitById.get(route.circuitId);
      if (circuit) {
        const key = `${circuit.cableTypeKey}:${circuit.cableSectionMm2}`;
        const entry =
          cableByKey.get(key) ??
          {
            cableTypeKey: circuit.cableTypeKey,
            sectionMm2: circuit.cableSectionMm2,
            metres: 0,
            circuitNames: new Set<string>(),
          };
        entry.metres += totalMm / 1000;
        entry.circuitNames.add(circuit.name);
        cableByKey.set(key, entry);
      }
    }

    if (route.conduitKey) {
      const entry = containmentByKey.get(route.conduitKey) ?? { metres: 0, routeCount: 0 };
      entry.metres += totalMm / 1000;
      entry.routeCount += 1;
      containmentByKey.set(route.conduitKey, entry);
    }
  }

  for (const [key, entry] of [...cableByKey].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push({
      key: `cable:${key}`,
      description: `Cable ${entry.cableTypeKey} — ${entry.sectionMm2} mm²`,
      category: "cable",
      unit: "m",
      quantity: round2(entry.metres),
      basis: "inferred",
      source: `Routes assigned to: ${[...entry.circuitNames].join(", ")}`,
      note: "Route length × (1 + slack%) + endpoint vertical drops. Does not include waste or termination allowance.",
    });
  }

  for (const [conduitKey, entry] of [...containmentByKey].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    lines.push({
      key: `containment:${conduitKey}`,
      description: `Conduit ${conduitKey}`,
      category: "containment",
      unit: "m",
      quantity: round2(entry.metres),
      basis: "inferred",
      source: `${entry.routeCount} route(s)`,
      note: "One conduit per route; fittings and boxes are excluded.",
    });
  }

  const equipmentUnits = lines
    .filter((line) => line.category === "equipment")
    .reduce((sum, line) => sum + line.quantity, 0);
  const cableMetres = lines
    .filter((line) => line.category === "cable")
    .reduce((sum, line) => sum + line.quantity, 0);
  const containmentMetres = lines
    .filter((line) => line.category === "containment")
    .reduce((sum, line) => sum + line.quantity, 0);

  return {
    lines,
    assumptions,
    methodVersion: TAKEOFF_METHOD_VERSION,
    totals: {
      equipmentUnits,
      cableMetres: round2(cableMetres),
      containmentMetres: round2(containmentMetres),
    },
  };
}

function csvEscape(value: string): string {
  // Neutralise formula injection: prefix values that start with formula-triggering
  // characters (=, +, -, @, tab, CR) with a single quote so spreadsheet programs
  // treat them as literal text rather than formulas.
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = `'${safe}`;
  }
  if (/[",\n]/.test(safe)) return `"${safe.replaceAll('"', '""')}"`;
  return safe;
}

export function takeoffToCsv(takeoff: MaterialTakeoff, projectName: string): string {
  const rows: string[] = [];
  rows.push(`Project,${csvEscape(projectName)}`);
  rows.push(`Method,${takeoff.methodVersion}`);
  rows.push("");
  rows.push("Description,Category,Unit,Quantity,Basis,Source,Note");
  for (const line of takeoff.lines) {
    rows.push(
      [
        csvEscape(line.description),
        line.category,
        line.unit,
        String(line.quantity),
        line.basis,
        csvEscape(line.source),
        csvEscape(line.note),
      ].join(","),
    );
  }
  rows.push("");
  rows.push("Assumptions");
  for (const assumption of takeoff.assumptions) rows.push(csvEscape(assumption));
  return `${rows.join("\r\n")}\r\n`;
}
