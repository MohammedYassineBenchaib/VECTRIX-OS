/**
 * Voltage drop.
 *
 * Method: ΔU = k · I · L · (R·cosφ + X·sinφ)
 *   k = 2 for single-phase (out and back), √3 for balanced three-phase.
 *   R is the conductor resistance corrected to the conductor operating
 *   temperature (70 °C for PVC, 90 °C for XLPE).
 *   X = 0.08 Ω/km is a conservative generic reactance for LV cables; for small
 *   domestic circuits its effect is negligible, but it is included so the
 *   method remains applicable to larger feeders.
 *
 * The result is the voltage drop of the circuit conductor only. It does not
 * include the supply transformer, service cable or upstream distribution
 * losses. Those must be added by the designer when the limit applies to the
 * whole installation.
 */

import { getAmpacityRow, type Insulation } from "./ampacity";

export const VOLTAGE_DROP_METHOD_VERSION = "vd-2026.10";
export const GENERIC_REACTANCE_OHM_PER_KM = 0.08;

export const INSULATION_OPERATING_TEMP_C: Record<Insulation, number> = {
  PVC: 70,
  XLPE: 90,
};

const TEMP_COEFFICIENT_COPPER = 0.00393;

export interface VoltageDropInput {
  phaseMode: "single_phase" | "three_phase";
  currentA: number;
  lengthMm: number;
  sectionMm2: number;
  powerFactor: number;
  phaseVoltageV: number;
  lineVoltageV: number;
  insulation: Insulation;
}

export interface VoltageDropResult {
  volts: number;
  percent: number;
  resistanceOhmPerKm: number;
  reactanceOhmPerKm: number;
  operatingTempC: number;
  formula: string;
  methodVersion: string;
}

export class UnsupportedConductorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedConductorError";
  }
}

export function conductorResistanceAtTemp(
  sectionMm2: number,
  insulation: Insulation,
): number {
  const row = getAmpacityRow(sectionMm2);
  if (!row) {
    throw new UnsupportedConductorError(
      `No conductor resistance data for ${sectionMm2} mm² copper. Supported range: 1.5–300 mm².`,
    );
  }
  const operatingTempC = INSULATION_OPERATING_TEMP_C[insulation];
  const alpha = insulation === "PVC" ? TEMP_COEFFICIENT_COPPER : TEMP_COEFFICIENT_COPPER;
  return row.resistance20OhmPerKm * (1 + alpha * (operatingTempC - 20));
}

export function calculateVoltageDrop(input: VoltageDropInput): VoltageDropResult {
  if (input.currentA < 0) throw new Error("Current cannot be negative.");
  if (input.lengthMm < 0) throw new Error("Length cannot be negative.");
  if (input.powerFactor <= 0 || input.powerFactor > 1) {
    throw new Error("Power factor must be in (0, 1].");
  }
  const resistanceOhmPerKm = conductorResistanceAtTemp(input.sectionMm2, input.insulation);
  const reactanceOhmPerKm = GENERIC_REACTANCE_OHM_PER_KM;
  const lengthKm = input.lengthMm / 1_000_000;
  const sinPhi = Math.sqrt(Math.max(0, 1 - input.powerFactor ** 2));
  const impedanceDrop =
    resistanceOhmPerKm * input.powerFactor + reactanceOhmPerKm * sinPhi;
  const k = input.phaseMode === "three_phase" ? Math.sqrt(3) : 2;
  const volts = k * input.currentA * lengthKm * impedanceDrop;
  const referenceVoltage =
    input.phaseMode === "three_phase" ? input.lineVoltageV : input.phaseVoltageV;
  const percent = referenceVoltage > 0 ? (volts / referenceVoltage) * 100 : 0;
  return {
    volts,
    percent,
    resistanceOhmPerKm,
    reactanceOhmPerKm,
    operatingTempC: INSULATION_OPERATING_TEMP_C[input.insulation],
    formula:
      input.phaseMode === "three_phase"
        ? "ΔU = √3 · I · L · (R·cosφ + X·sinφ)"
        : "ΔU = 2 · I · L · (R·cosφ + X·sinφ)",
    methodVersion: VOLTAGE_DROP_METHOD_VERSION,
  };
}
