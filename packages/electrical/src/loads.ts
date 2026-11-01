/**
 * Load schedule.
 *
 * Connected load is not demand. For every circuit VECTRIX keeps the two
 * separate, applies an explicit demand factor, and never hides the resulting
 * assumption in a totals row.
 */

import type {
  Circuit,
  Equipment,
  EquipmentDefinition,
  Phase,
  Project,
} from "@vectrix/core";

export const LOAD_SCHEDULE_METHOD_VERSION = "load-2026.10";

export interface CircuitLoad {
  circuitId: string;
  circuitName: string;
  circuitType: Circuit["type"];
  phaseMode: Circuit["phaseMode"];
  equipmentCount: number;
  connectedVA: number;
  demandFactor: number;
  demandVA: number;
  currentA: number;
  phaseCurrentsA: Record<Phase, number>;
  weightedPowerFactor: number;
}

export interface EquipmentLoad {
  equipmentId: string;
  circuitId: string | null;
  label: string;
  definitionKey: string;
  connectedVA: number;
  powerFactor: number;
  phase: Phase | null;
  loadBasis: "catalogue" | "override" | "none";
}

export interface LoadSchedule {
  circuits: CircuitLoad[];
  equipment: EquipmentLoad[];
  unassignedEquipment: EquipmentLoad[];
  phaseTotalsA: Record<Phase, number>;
  totalConnectedVA: number;
  totalDemandVA: number;
  unknownDefinitionKeys: string[];
  assumptions: string[];
  methodVersion: string;
}

export interface LoadScheduleInput {
  project: Project;
  circuits: Circuit[];
  equipment: Equipment[];
  resolveDefinition: (key: string) => EquipmentDefinition | undefined;
}

function resolveLoad(
  equipment: Equipment,
  definition: EquipmentDefinition | undefined,
): { connectedVA: number; powerFactor: number; basis: EquipmentLoad["loadBasis"] } {
  if (!definition) {
    return { connectedVA: 0, powerFactor: 1, basis: "none" };
  }
  const catalogueVA = definition.electrical.defaultLoadVA;
  const cataloguePf = definition.electrical.powerFactor;
  if (equipment.loadVAOverride !== null) {
    return {
      connectedVA: equipment.loadVAOverride,
      powerFactor: equipment.powerFactorOverride ?? cataloguePf,
      basis: "override",
    };
  }
  if (catalogueVA === null) {
    return { connectedVA: 0, powerFactor: cataloguePf, basis: "none" };
  }
  return {
    connectedVA: catalogueVA,
    powerFactor: equipment.powerFactorOverride ?? cataloguePf,
    basis: "catalogue",
  };
}

export function computeLoadSchedule(input: LoadScheduleInput): LoadSchedule {
  const { project, circuits, equipment } = input;
  const unknownDefinitionKeys = new Set<string>();
  const equipmentLoads: EquipmentLoad[] = [];

  for (const item of equipment) {
    const definition = input.resolveDefinition(item.definitionKey);
    if (!definition) unknownDefinitionKeys.add(item.definitionKey);
    const resolved = resolveLoad(item, definition);
    equipmentLoads.push({
      equipmentId: item.id,
      circuitId: item.circuitId,
      label: item.label,
      definitionKey: item.definitionKey,
      connectedVA: resolved.connectedVA,
      powerFactor: resolved.powerFactor,
      phase: item.phase,
      loadBasis: resolved.basis,
    });
  }

  const circuitLoads: CircuitLoad[] = circuits.map((circuit) => {
    const members = equipmentLoads.filter((item) => item.circuitId === circuit.id);
    const connectedVA = members.reduce((sum, item) => sum + item.connectedVA, 0);
    const demandVA = connectedVA * circuit.demandFactor;
    const weightedPfBase = members.reduce(
      (sum, item) => sum + item.connectedVA * item.powerFactor,
      0,
    );
    const weightedPowerFactor =
      connectedVA > 0 ? Math.min(1, Math.max(0.01, weightedPfBase / connectedVA)) : 1;

    const phaseCurrentsA: Record<Phase, number> = { L1: 0, L2: 0, L3: 0 };
    if (circuit.phaseMode === "single_phase") {
      const phase = (members.find((item) => item.phase !== null)?.phase ?? "L1") as Phase;
      const current = demandVA / project.phaseVoltageV;
      phaseCurrentsA[phase] += current;
    } else {
      const assigned = members.filter((member) => member.phase !== null);
      const assignedVA = assigned.reduce((sum, item) => sum + item.connectedVA, 0);
      const unassignedVA = Math.max(0, connectedVA - assignedVA);
      for (const member of assigned) {
        phaseCurrentsA[member.phase as Phase] +=
          (member.connectedVA * circuit.demandFactor) / project.phaseVoltageV;
      }
      if (unassignedVA > 0) {
        const perPhase = (unassignedVA * circuit.demandFactor) / 3 / project.phaseVoltageV;
        phaseCurrentsA.L1 += perPhase;
        phaseCurrentsA.L2 += perPhase;
        phaseCurrentsA.L3 += perPhase;
      }
    }

    const currentA =
      circuit.phaseMode === "three_phase"
        ? demandVA / (Math.sqrt(3) * project.lineVoltageV)
        : phaseCurrentsA.L1 + phaseCurrentsA.L2 + phaseCurrentsA.L3;

    return {
      circuitId: circuit.id,
      circuitName: circuit.name,
      circuitType: circuit.type,
      phaseMode: circuit.phaseMode,
      equipmentCount: members.filter((item) => item.connectedVA > 0).length,
      connectedVA,
      demandFactor: circuit.demandFactor,
      demandVA,
      currentA,
      phaseCurrentsA,
      weightedPowerFactor,
    };
  });

  const totalConnectedVA = circuitLoads.reduce((sum, item) => sum + item.connectedVA, 0);
  const totalDemandVA = circuitLoads.reduce((sum, item) => sum + item.demandVA, 0);

  const phaseTotalsA: Record<Phase, number> = { L1: 0, L2: 0, L3: 0 };
  for (const load of circuitLoads) {
    phaseTotalsA.L1 += load.phaseCurrentsA.L1;
    phaseTotalsA.L2 += load.phaseCurrentsA.L2;
    phaseTotalsA.L3 += load.phaseCurrentsA.L3;
  }

  return {
    circuits: circuitLoads,
    equipment: equipmentLoads,
    unassignedEquipment: equipmentLoads.filter(
      (item) => item.circuitId === null && item.connectedVA > 0,
    ),
    phaseTotalsA,
    totalConnectedVA,
    totalDemandVA,
    unknownDefinitionKeys: [...unknownDefinitionKeys].sort(),
    assumptions: [
      "Connected load uses catalogue defaults or explicit instance overrides; it is not a measured load.",
      `Demand factor is applied per circuit. Three-phase unassigned load is assumed balanced (deviation is reported separately).`,
      "Board totals are the sum of circuit demands; they do not include diversity between circuits beyond the per-circuit demand factor.",
    ],
    methodVersion: LOAD_SCHEDULE_METHOD_VERSION,
  };
}
