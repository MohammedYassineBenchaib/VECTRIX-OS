/**
 * Cable data and ampacity correction.
 *
 * IMPORTANT — provenance and limits:
 *  - The conductor resistance values are the maximum DC conductor resistances
 *    for plain copper conductors from IEC 60228 (class 1/2), expressed in Ω/km
 *    at 20 °C. They are widely reproduced reference values, not copied tables
 *    from a paid standard document.
 *  - The current-carrying capacities are indicative values for copper
 *    conductors with PVC insulation, reference method C (single-core cables in
 *    conduit on a wall), 30 °C ambient, one circuit. They are used to produce
 *    *advisory engineering output*. They have NOT yet been verified against a
 *    licensed copy of IEC 60364-5-52, and the UI must say so.
 *  - Only PVC-insulated copper conductors, reference method C, are supported in
 *    this build. Unsupported combinations return an explicit error instead of a
 *    silently wrong answer.
 */

export const AMPACITY_METHOD_VERSION = "ampacity-2026.10-refC-pvc";

export type Insulation = "PVC" | "XLPE";
export type LoadedConductors = 2 | 3;

export interface AmpacityRow {
  sectionMm2: number;
  resistance20OhmPerKm: number;
  capacityA: Record<LoadedConductors, number>;
}

/** Ω/km at 20 °C per IEC 60228 (Cu class 1/2), with indicative Ref-C PVC ampacity. */
export const PVC_COPPER_REF_C: readonly AmpacityRow[] = Object.freeze([
  { sectionMm2: 1.5, resistance20OhmPerKm: 12.1, capacityA: { 2: 19.5, 3: 17.5 } },
  { sectionMm2: 2.5, resistance20OhmPerKm: 7.41, capacityA: { 2: 27, 3: 24 } },
  { sectionMm2: 4, resistance20OhmPerKm: 4.61, capacityA: { 2: 36, 3: 32 } },
  { sectionMm2: 6, resistance20OhmPerKm: 3.08, capacityA: { 2: 46, 3: 41 } },
  { sectionMm2: 10, resistance20OhmPerKm: 1.83, capacityA: { 2: 63, 3: 57 } },
  { sectionMm2: 16, resistance20OhmPerKm: 1.15, capacityA: { 2: 85, 3: 76 } },
  { sectionMm2: 25, resistance20OhmPerKm: 0.727, capacityA: { 2: 112, 3: 96 } },
  { sectionMm2: 35, resistance20OhmPerKm: 0.524, capacityA: { 2: 138, 3: 119 } },
  { sectionMm2: 50, resistance20OhmPerKm: 0.387, capacityA: { 2: 168, 3: 144 } },
  { sectionMm2: 70, resistance20OhmPerKm: 0.268, capacityA: { 2: 213, 3: 184 } },
  { sectionMm2: 95, resistance20OhmPerKm: 0.193, capacityA: { 2: 258, 3: 223 } },
  { sectionMm2: 120, resistance20OhmPerKm: 0.153, capacityA: { 2: 299, 3: 259 } },
  { sectionMm2: 150, resistance20OhmPerKm: 0.124, capacityA: { 2: 344, 3: 299 } },
  { sectionMm2: 185, resistance20OhmPerKm: 0.0991, capacityA: { 2: 392, 3: 341 } },
  { sectionMm2: 240, resistance20OhmPerKm: 0.0754, capacityA: { 2: 461, 3: 403 } },
  { sectionMm2: 300, resistance20OhmPerKm: 0.0601, capacityA: { 2: 530, 3: 464 } },
]);

export const SUPPORTED_SECTIONS_MM2 = PVC_COPPER_REF_C.map((row) => row.sectionMm2);

export const STANDARD_SECTIONS_MM2 = [
  1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300,
] as const;

export function getAmpacityRow(sectionMm2: number): AmpacityRow | undefined {
  return PVC_COPPER_REF_C.find((row) => row.sectionMm2 === sectionMm2);
}

const AMBIENT_FACTORS_PVC: ReadonlyArray<{ maxTempC: number; factor: number }> = [
  { maxTempC: 25, factor: 1.03 },
  { maxTempC: 30, factor: 1.0 },
  { maxTempC: 35, factor: 0.94 },
  { maxTempC: 40, factor: 0.87 },
  { maxTempC: 45, factor: 0.79 },
  { maxTempC: 50, factor: 0.71 },
  { maxTempC: 55, factor: 0.61 },
  { maxTempC: 60, factor: 0.5 },
];

const GROUPING_FACTORS: ReadonlyArray<{ circuits: number; factor: number }> = [
  { circuits: 1, factor: 1.0 },
  { circuits: 2, factor: 0.8 },
  { circuits: 3, factor: 0.7 },
  { circuits: 4, factor: 0.6 },
  { circuits: 5, factor: 0.55 },
  { circuits: 6, factor: 0.5 },
];

export interface InstallationConditions {
  ambientTempC: number;
  /** Number of circuits bunched together in the same conduit/trunking. */
  groupedCircuits: number;
  /** 1 = no additional thermal insulation; 0.75 is a common conservative factor. */
  thermalInsulationFactor: number;
}

export const DEFAULT_CONDITIONS: InstallationConditions = {
  ambientTempC: 30,
  groupedCircuits: 1,
  thermalInsulationFactor: 1,
};

export interface DeratingResult {
  ambientFactor: number;
  groupingFactor: number;
  insulationFactor: number;
  totalFactor: number;
  notes: string[];
}

export function deratingFactors(conditions: InstallationConditions): DeratingResult {
  const ambient =
    AMBIENT_FACTORS_PVC.find((entry) => conditions.ambientTempC <= entry.maxTempC) ??
    AMBIENT_FACTORS_PVC[AMBIENT_FACTORS_PVC.length - 1]!;
  if (conditions.ambientTempC > 60) {
    return {
      ambientFactor: 0,
      groupingFactor: 0,
      insulationFactor: 0,
      totalFactor: 0,
      notes: ["Ambient temperature above 60 °C is outside the supported PVC table."],
    };
  }
  const grouped =
    GROUPING_FACTORS.find((entry) => conditions.groupedCircuits <= entry.circuits) ??
    GROUPING_FACTORS[GROUPING_FACTORS.length - 1]!;
  const insulation = Math.min(1, Math.max(0.5, conditions.thermalInsulationFactor));
  return {
    ambientFactor: ambient.factor,
    groupingFactor: grouped.factor,
    insulationFactor: insulation,
    totalFactor: ambient.factor * grouped.factor * insulation,
    notes: [
      "Indicative correction factors for PVC, reference method C. Confirm against the licensed standard for the actual installation method.",
    ],
  };
}

export function correctedAmpacity(sectionMm2: number, loaded: LoadedConductors, conditions: InstallationConditions): number | null {
  const row = getAmpacityRow(sectionMm2);
  if (!row) return null;
  const { totalFactor } = deratingFactors(conditions);
  return row.capacityA[loaded] * totalFactor;
}
