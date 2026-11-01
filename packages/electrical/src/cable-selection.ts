import {
  type InstallationConditions,
  type Insulation,
  correctedAmpacity,
  deratingFactors,
  getAmpacityRow,
  PVC_COPPER_REF_C,
  type LoadedConductors,
} from "./ampacity";
import { calculateVoltageDrop, type VoltageDropResult } from "./voltage-drop";

export const CABLE_SELECTION_METHOD_VERSION = "cable-2026.10";

export interface CableCandidate {
  sectionMm2: number;
  deratedAmpacityA: number;
  ampacityOk: boolean;
  voltageDropPercent: number;
  voltageDropOk: boolean;
  accepted: boolean;
  rejectedBecause: string | null;
}

export interface CableSelectionInput {
  designCurrentA: number;
  breakerRatingA: number;
  phaseMode: "single_phase" | "three_phase";
  lengthMm: number;
  powerFactor: number;
  maxVoltageDropPct: number;
  conditions: InstallationConditions;
  insulation: Insulation;
  phaseVoltageV: number;
  lineVoltageV: number;
  minimumSectionMm2?: number;
}

export interface CableSelectionResult {
  selectedSectionMm2: number | null;
  candidates: CableCandidate[];
  finalAmpacityA: number | null;
  voltageDrop: VoltageDropResult | null;
  reason: string;
  methodVersion: string;
  assumptions: string[];
}

export class UnsupportedInstallationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedInstallationError";
  }
}

export function selectCable(input: CableSelectionInput): CableSelectionResult {
  if (input.insulation !== "PVC") {
    throw new UnsupportedInstallationError(
      "Cable selection in this build supports PVC-insulated copper conductors (reference method C) only. " +
        "XLPE and other installation methods require verified tabulated data before they can be offered.",
    );
  }
  if (input.designCurrentA < 0) throw new Error("Design current cannot be negative.");
  if (input.breakerRatingA <= 0) throw new Error("Breaker rating must be positive.");

  const loaded: LoadedConductors = input.phaseMode === "three_phase" ? 3 : 2;
  const conditions = input.conditions;
  const derating = deratingFactors(conditions);
  const minimumSection = input.minimumSectionMm2 ?? 1.5;

  const candidates: CableCandidate[] = [];
  let selected: CableCandidate | null = null;
  let selectedVoltageDrop: VoltageDropResult | null = null;
  let selectedAmpacity: number | null = null;

  for (const row of PVC_COPPER_REF_C) {
    if (row.sectionMm2 < minimumSection) continue;
    const deratedAmpacity = correctedAmpacity(row.sectionMm2, loaded, conditions) ?? 0;
    const ampacityOk = deratedAmpacity + 1e-9 >= input.breakerRatingA;
    const voltageDrop = calculateVoltageDrop({
      phaseMode: input.phaseMode,
      currentA: input.designCurrentA,
      lengthMm: input.lengthMm,
      sectionMm2: row.sectionMm2,
      powerFactor: input.powerFactor,
      phaseVoltageV: input.phaseVoltageV,
      lineVoltageV: input.lineVoltageV,
      insulation: input.insulation,
    });
    const voltageDropOk = voltageDrop.percent <= input.maxVoltageDropPct + 1e-9;
    const accepted = ampacityOk && voltageDropOk;

    const reasons: string[] = [];
    if (!ampacityOk)
      reasons.push(
        `derated capacity ${deratedAmpacity.toFixed(1)} A is below breaker rating ${input.breakerRatingA} A`,
      );
    if (!voltageDropOk)
      reasons.push(
        `voltage drop ${voltageDrop.percent.toFixed(2)}% exceeds limit ${input.maxVoltageDropPct}%`,
      );

    const candidate: CableCandidate = {
      sectionMm2: row.sectionMm2,
      deratedAmpacityA: deratedAmpacity,
      ampacityOk,
      voltageDropPercent: voltageDrop.percent,
      voltageDropOk,
      accepted,
      rejectedBecause: reasons.length > 0 ? reasons.join("; ") : null,
    };
    candidates.push(candidate);
    if (accepted && !selected) {
      selected = candidate;
      selectedVoltageDrop = voltageDrop;
      selectedAmpacity = deratedAmpacity;
    }
  }

  const assumptions = [
    `Indicative PVC copper reference-method-C ampacity, ambient ${conditions.ambientTempC} °C, ${conditions.groupedCircuits} grouped circuit(s), insulation factor ${conditions.thermalInsulationFactor}.`,
    `Voltage drop computed at the design current (${input.designCurrentA.toFixed(2)} A) over ${(input.lengthMm / 1000).toFixed(2)} m.`,
    "Selection checks In ≤ Iz and ΔU ≤ limit. It does not verify fault-loop impedance, disconnection time, thermal withstand or selectivity.",
    ...derating.notes,
  ];

  if (!selected) {
    return {
      selectedSectionMm2: null,
      candidates,
      finalAmpacityA: null,
      voltageDrop: null,
      reason:
        "No supported section satisfies both the protective-device and voltage-drop constraints. Review the circuit length, load, breaker rating or the installation method.",
      methodVersion: CABLE_SELECTION_METHOD_VERSION,
      assumptions,
    };
  }

  return {
    selectedSectionMm2: selected.sectionMm2,
    candidates,
    finalAmpacityA: selectedAmpacity,
    voltageDrop: selectedVoltageDrop,
    reason: `Selected ${selected.sectionMm2} mm²: derated Iz ${selected.deratedAmpacityA.toFixed(1)} A ≥ In ${input.breakerRatingA} A and ΔU ${selected.voltageDropPercent.toFixed(2)}% ≤ ${input.maxVoltageDropPct}%.`,
    methodVersion: CABLE_SELECTION_METHOD_VERSION,
    assumptions,
  };
}

export function ampacityFor(sectionMm2: number, phaseMode: "single_phase" | "three_phase", conditions: InstallationConditions): number | null {
  return correctedAmpacity(sectionMm2, phaseMode === "three_phase" ? 3 : 2, conditions);
}

export { getAmpacityRow };
