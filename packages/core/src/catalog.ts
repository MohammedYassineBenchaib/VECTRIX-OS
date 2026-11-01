import { z } from "zod";
import {
  circuitTypeSchema,
  disciplineSchema,
  equipmentCategorySchema,
  mountingMethodSchema,
  phaseModeSchema,
  terminalFunctionSchema,
  type Discipline,
  type EquipmentCategory,
} from "./enums";

/**
 * The equipment library is VECTRIX-authored generic data.
 *
 * It deliberately contains no manufacturer part numbers, proprietary symbols or
 * copied catalogue tables. Manufacturer products will be linked later through a
 * licensed catalogue adapter; until then the library describes *behaviour and
 * interfaces*, not purchasable articles.
 *
 * Every value here is an engineering default that the user can override on an
 * instance. Defaults are assumptions, and the UI labels them as such.
 */

const terminalSpecSchema = z.object({
  designation: z.string().min(1).max(12),
  function: terminalFunctionSchema,
  required: z.boolean(),
  /** Max number of conductors the terminal accepts in this generic model. */
  capacity: z.number().int().positive().max(64).default(2),
});

export type TerminalSpec = z.infer<typeof terminalSpecSchema>;

const electricalSpecSchema = z.object({
  ratedVoltageV: z.number().positive(),
  ratedCurrentA: z.number().positive().nullable(),
  /** Default connected load, in volt-amperes. `null` means the device does not consume power. */
  defaultLoadVA: z.number().nonnegative().nullable(),
  powerFactor: z.number().gt(0).max(1),
  /** How the load behaves; used for advisory guidance only. */
  loadBehaviour: z.enum(["resistive", "inductive", "electronic", "none"]),
  requiresEarth: z.boolean(),
  rcdRecommended: z.boolean(),
  typicalCircuitType: circuitTypeSchema,
  phaseMode: phaseModeSchema,
  /** Class I / II / III per IEC 61140 where applicable. */
  protectionClass: z.enum(["I", "II", "III", "n/a"]),
});

const mountingSpecSchema = z.object({
  method: mountingMethodSchema,
  defaultHeightMm: z.number().int().nonnegative(),
  minHeightMm: z.number().int().nonnegative(),
  maxHeightMm: z.number().int().positive(),
});

export const equipmentDefinitionSchema = z
  .object({
    key: z.string().regex(/^[a-z0-9][a-z0-9-]{2,63}$/),
    name: z.string().min(2).max(120),
    shortName: z.string().min(1).max(40),
    description: z.string().min(10).max(600),
    category: equipmentCategorySchema,
    discipline: disciplineSchema,
    /** Symbol key consumed by the 2D renderer and printed legend. */
    symbol: z.string().min(1).max(40),
    terminals: z.array(terminalSpecSchema).min(0),
    electrical: electricalSpecSchema,
    mounting: mountingSpecSchema,
    dimensionsMm: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      depth: z.number().int().positive(),
    }),
    ipRating: z.string().min(2).max(10),
    defaultLabelPrefix: z.string().min(1).max(12),
    notes: z.string().max(600).default(""),
  })
  .superRefine((definition, ctx) => {
    if (definition.mounting.minHeightMm > definition.mounting.defaultHeightMm) {
      ctx.addIssue({
        code: "custom",
        path: ["mounting", "defaultHeightMm"],
        message: "default mounting height is below the minimum for this product",
      });
    }
    if (definition.mounting.maxHeightMm < definition.mounting.defaultHeightMm) {
      ctx.addIssue({
        code: "custom",
        path: ["mounting", "defaultHeightMm"],
        message: "default mounting height is above the maximum for this product",
      });
    }
    if (definition.electrical.requiresEarth) {
      const hasEarth = definition.terminals.some((t) => t.function === "earth");
      if (!hasEarth) {
        ctx.addIssue({
          code: "custom",
          path: ["terminals"],
          message: "equipment requiring an earth connection must expose an earth terminal",
        });
      }
    }
    if (definition.electrical.defaultLoadVA && definition.terminals.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["terminals"],
        message: "a load-bearing device must expose terminals",
      });
    }
    const designations = definition.terminals.map((t) => t.designation);
    if (new Set(designations).size !== designations.length) {
      ctx.addIssue({
        code: "custom",
        path: ["terminals"],
        message: "terminal designations must be unique within a product",
      });
    }
  });

export type EquipmentDefinition = z.infer<typeof equipmentDefinitionSchema>;

const load = (
  partial: Partial<z.infer<typeof electricalSpecSchema>> &
    Pick<z.infer<typeof electricalSpecSchema>, "typicalCircuitType" | "defaultLoadVA">,
): z.infer<typeof electricalSpecSchema> => ({
  ratedVoltageV: 230,
  ratedCurrentA: null,
  powerFactor: 1,
  loadBehaviour: "resistive",
  requiresEarth: true,
  rcdRecommended: true,
  phaseMode: "single_phase",
  protectionClass: "I",
  ...partial,
});

const noLoad = (
  partial: Partial<z.infer<typeof electricalSpecSchema>> &
    Pick<z.infer<typeof electricalSpecSchema>, "typicalCircuitType">,
): z.infer<typeof electricalSpecSchema> =>
  load({ defaultLoadVA: null, powerFactor: 1, loadBehaviour: "none", ...partial });

const socketTerminals: TerminalSpec[] = [
  { designation: "L", function: "line", required: true, capacity: 2 },
  { designation: "N", function: "neutral", required: true, capacity: 2 },
  { designation: "PE", function: "earth", required: true, capacity: 2 },
];

const rawDefinitions: Array<z.input<typeof equipmentDefinitionSchema>> = [
  {
    key: "socket-schuko-16a-2p-e",
    name: "Schuko socket outlet 16 A, 2P+E, IP20",
    shortName: "Socket 16A",
    description:
      "Single socket outlet with protective earth for residential dry interiors. 16 A nominal, 250 V, surface or flush mounted.",
    category: "socket",
    discipline: "electrical",
    symbol: "socket",
    terminals: socketTerminals,
    electrical: load({
      defaultLoadVA: 3680,
      ratedCurrentA: 16,
      ratedVoltageV: 250,
      typicalCircuitType: "sockets",
      protectionClass: "I",
    }),
    mounting: { method: "wall", defaultHeightMm: 300, minHeightMm: 150, maxHeightMm: 1200 },
    dimensionsMm: { width: 80, height: 80, depth: 40 },
    ipRating: "IP20",
    defaultLabelPrefix: "S",
    notes:
      "The 3680 VA value is the outlet's rated maximum, not an expected simultaneous load. The load schedule applies the circuit demand factor.",
  },
  {
    key: "socket-schuko-16a-ip44",
    name: "Schuko socket outlet 16 A, 2P+E, IP44",
    shortName: "Socket 16A IP44",
    description:
      "Single socket outlet with protective earth and splash protection for kitchens, utility rooms and covered outdoor areas.",
    category: "socket",
    discipline: "electrical",
    symbol: "socket-ip44",
    terminals: socketTerminals,
    electrical: load({
      defaultLoadVA: 3680,
      ratedCurrentA: 16,
      ratedVoltageV: 250,
      typicalCircuitType: "sockets",
    }),
    mounting: { method: "wall", defaultHeightMm: 300, minHeightMm: 150, maxHeightMm: 1200 },
    dimensionsMm: { width: 80, height: 80, depth: 50 },
    ipRating: "IP44",
    defaultLabelPrefix: "S",
    notes: "IP44 does not make the outlet suitable for wet-zone locations without a zone assessment.",
  },
  {
    key: "socket-double-16a-2p-e",
    name: "Double socket outlet 16 A, 2P+E",
    shortName: "Double socket",
    description: "Two 16 A outlets in a single frame, sharing L/N/PE terminals.",
    category: "socket",
    discipline: "electrical",
    symbol: "socket-double",
    terminals: socketTerminals,
    electrical: load({
      defaultLoadVA: 3680,
      ratedCurrentA: 16,
      ratedVoltageV: 250,
      typicalCircuitType: "sockets",
    }),
    mounting: { method: "wall", defaultHeightMm: 300, minHeightMm: 150, maxHeightMm: 1200 },
    dimensionsMm: { width: 150, height: 80, depth: 40 },
    ipRating: "IP20",
    defaultLabelPrefix: "S",
    notes: "Treated as one connection point; the two outlets are not separately protected.",
  },
  {
    key: "switch-1g-10a",
    name: "One-gang switch, 10 A",
    shortName: "Switch",
    description: "One-way wall switch for lighting control.",
    category: "switch",
    discipline: "electrical",
    symbol: "switch",
    terminals: [
      { designation: "L", function: "line", required: true, capacity: 2 },
      { designation: "L1", function: "switched_line", required: true, capacity: 2 },
    ],
    electrical: noLoad({
      typicalCircuitType: "lighting",
      requiresEarth: false,
      rcdRecommended: false,
      protectionClass: "II",
      ratedCurrentA: 10,
      ratedVoltageV: 250,
    }),
    mounting: { method: "wall", defaultHeightMm: 1050, minHeightMm: 900, maxHeightMm: 1300 },
    dimensionsMm: { width: 80, height: 80, depth: 35 },
    ipRating: "IP20",
    defaultLabelPrefix: "SW",
    notes: "Control device: no connected load of its own. Switching relationships are modelled as control links.",
  },
  {
    key: "switch-2g-10a",
    name: "Two-gang switch, 10 A",
    shortName: "Switch 2G",
    description: "Two independent one-way switches in a single frame.",
    category: "switch",
    discipline: "electrical",
    symbol: "switch-2g",
    terminals: [
      { designation: "L", function: "line", required: true, capacity: 2 },
      { designation: "L1", function: "switched_line", required: true, capacity: 2 },
      { designation: "L2", function: "switched_line", required: true, capacity: 2 },
    ],
    electrical: noLoad({
      typicalCircuitType: "lighting",
      requiresEarth: false,
      rcdRecommended: false,
      protectionClass: "II",
      ratedCurrentA: 10,
      ratedVoltageV: 250,
    }),
    mounting: { method: "wall", defaultHeightMm: 1050, minHeightMm: 900, maxHeightMm: 1300 },
    dimensionsMm: { width: 150, height: 80, depth: 35 },
    ipRating: "IP20",
    defaultLabelPrefix: "SW",
  },
  {
    key: "light-led-downlight-20w",
    name: "LED downlight 20 W",
    shortName: "Downlight",
    description: "Generic ceiling LED luminaire, 20 W, represented as a lighting point with L/N/PE terminals.",
    category: "light_point",
    discipline: "electrical",
    symbol: "light",
    terminals: [
      { designation: "L", function: "line", required: true, capacity: 2 },
      { designation: "N", function: "neutral", required: true, capacity: 2 },
      { designation: "PE", function: "earth", required: true, capacity: 2 },
    ],
    electrical: load({
      defaultLoadVA: 22,
      powerFactor: 0.9,
      loadBehaviour: "electronic",
      typicalCircuitType: "lighting",
      ratedVoltageV: 230,
      protectionClass: "I",
    }),
    mounting: { method: "ceiling", defaultHeightMm: 2500, minHeightMm: 2200, maxHeightMm: 6000 },
    dimensionsMm: { width: 110, height: 110, depth: 40 },
    ipRating: "IP20",
    defaultLabelPrefix: "L",
    notes: "Generic 20 W LED. Luminaire efficacy, colour rendering and glare are outside this model.",
  },
  {
    key: "light-ceiling-batten-36w",
    name: "LED batten luminaire 36 W",
    shortName: "Batten",
    description: "Surface-mounted linear LED luminaire for utility rooms and circulation areas.",
    category: "light_point",
    discipline: "electrical",
    symbol: "light",
    terminals: [
      { designation: "L", function: "line", required: true, capacity: 2 },
      { designation: "N", function: "neutral", required: true, capacity: 2 },
      { designation: "PE", function: "earth", required: true, capacity: 2 },
    ],
    electrical: load({
      defaultLoadVA: 38,
      powerFactor: 0.9,
      loadBehaviour: "electronic",
      typicalCircuitType: "lighting",
      ratedVoltageV: 230,
    }),
    mounting: { method: "ceiling", defaultHeightMm: 2500, minHeightMm: 2200, maxHeightMm: 6000 },
    dimensionsMm: { width: 1200, height: 80, depth: 60 },
    ipRating: "IP20",
    defaultLabelPrefix: "L",
  },
  {
    key: "junction-box-4way",
    name: "Junction box, 4-way",
    shortName: "Junction box",
    description: "Explicit connection point. Wires must not be spliced without a declared connection.",
    category: "junction_box",
    discipline: "electrical",
    symbol: "junction",
    terminals: [
      { designation: "L", function: "line", required: true, capacity: 8 },
      { designation: "N", function: "neutral", required: true, capacity: 8 },
      { designation: "PE", function: "earth", required: true, capacity: 8 },
    ],
    electrical: noLoad({
      typicalCircuitType: "other_power",
      requiresEarth: true,
      rcdRecommended: false,
      protectionClass: "II",
      ratedCurrentA: 20,
    }),
    mounting: { method: "ceiling", defaultHeightMm: 2500, minHeightMm: 2200, maxHeightMm: 3000 },
    dimensionsMm: { width: 100, height: 100, depth: 50 },
    ipRating: "IP20",
    defaultLabelPrefix: "JB",
  },
  {
    key: "distribution-board-12way",
    name: "Distribution board, 12 way",
    shortName: "Board",
    description:
      "Residential consumer unit with a line, neutral and earth busbar. Circuits reference a board instance.",
    category: "distribution_board",
    discipline: "electrical",
    symbol: "board",
    terminals: [
      { designation: "L1", function: "line", required: true, capacity: 20 },
      { designation: "N", function: "neutral", required: true, capacity: 20 },
      { designation: "PE", function: "earth", required: true, capacity: 20 },
    ],
    electrical: noLoad({
      typicalCircuitType: "other_power",
      requiresEarth: true,
      rcdRecommended: false,
      protectionClass: "I",
      ratedCurrentA: 63,
      ratedVoltageV: 400,
      phaseMode: "three_phase",
    }),
    mounting: { method: "wall", defaultHeightMm: 1400, minHeightMm: 1000, maxHeightMm: 1800 },
    dimensionsMm: { width: 400, height: 300, depth: 120 },
    ipRating: "IP20",
    defaultLabelPrefix: "DB",
    notes:
      "The board is an assembly placeholder. Protective-device coordination and thermal calculations per EN 61439 are not implemented.",
  },
  {
    key: "mcb-1p",
    name: "Miniature circuit breaker, 1 pole",
    shortName: "MCB",
    description: "Single-pole thermal-magnetic protective device. Rating is configured per circuit.",
    category: "protective_device",
    discipline: "electrical",
    symbol: "mcb",
    terminals: [
      { designation: "IN", function: "line", required: true, capacity: 2 },
      { designation: "OUT", function: "line", required: true, capacity: 2 },
    ],
    electrical: load({
      defaultLoadVA: null,
      loadBehaviour: "none",
      requiresEarth: false,
      rcdRecommended: false,
      protectionClass: "II",
      typicalCircuitType: "other_power",
      ratedCurrentA: 16,
      ratedVoltageV: 230,
    }),
    mounting: { method: "din_rail", defaultHeightMm: 1400, minHeightMm: 1000, maxHeightMm: 1800 },
    dimensionsMm: { width: 18, height: 80, depth: 70 },
    ipRating: "IP20",
    defaultLabelPrefix: "Q",
  },
  {
    key: "rcd-2p-30ma",
    name: "Residual current device, 2 pole, 30 mA",
    shortName: "RCD 30mA",
    description: "Residual current device for additional protection of final circuits.",
    category: "protective_device",
    discipline: "electrical",
    symbol: "rcd",
    terminals: [
      { designation: "IN-L", function: "line", required: true, capacity: 2 },
      { designation: "IN-N", function: "neutral", required: true, capacity: 2 },
      { designation: "OUT-L", function: "line", required: true, capacity: 2 },
      { designation: "OUT-N", function: "neutral", required: true, capacity: 2 },
    ],
    electrical: load({
      defaultLoadVA: null,
      loadBehaviour: "none",
      requiresEarth: false,
      rcdRecommended: false,
      protectionClass: "II",
      typicalCircuitType: "other_power",
      ratedCurrentA: 40,
      ratedVoltageV: 230,
    }),
    mounting: { method: "din_rail", defaultHeightMm: 1400, minHeightMm: 1000, maxHeightMm: 1800 },
    dimensionsMm: { width: 36, height: 80, depth: 70 },
    ipRating: "IP20",
    defaultLabelPrefix: "RCD",
  },
  {
    key: "data-outlet-rj45-cat6",
    name: "Data outlet RJ45 Cat 6",
    shortName: "RJ45",
    description: "Structured cabling outlet. Not counted as an electrical load.",
    category: "data_outlet",
    discipline: "telecom",
    symbol: "data",
    terminals: [{ designation: "RJ45", function: "signal", required: true, capacity: 1 }],
    electrical: noLoad({
      typicalCircuitType: "data",
      requiresEarth: false,
      rcdRecommended: false,
      protectionClass: "III",
      ratedVoltageV: 5,
    }),
    mounting: { method: "wall", defaultHeightMm: 300, minHeightMm: 200, maxHeightMm: 1200 },
    dimensionsMm: { width: 80, height: 80, depth: 35 },
    ipRating: "IP20",
    defaultLabelPrefix: "D",
  },
  {
    key: "pir-sensor",
    name: "PIR occupancy sensor",
    shortName: "PIR",
    description: "Ceiling occupancy sensor for lighting control. Control device, no connected load.",
    category: "sensor",
    discipline: "electrical",
    symbol: "sensor",
    terminals: [
      { designation: "L", function: "line", required: true, capacity: 2 },
      { designation: "N", function: "neutral", required: true, capacity: 2 },
      { designation: "L1", function: "switched_line", required: true, capacity: 2 },
    ],
    electrical: noLoad({
      typicalCircuitType: "lighting",
      requiresEarth: false,
      rcdRecommended: false,
      protectionClass: "II",
      ratedVoltageV: 230,
      ratedCurrentA: 6,
    }),
    mounting: { method: "ceiling", defaultHeightMm: 2500, minHeightMm: 2200, maxHeightMm: 4000 },
    dimensionsMm: { width: 90, height: 90, depth: 40 },
    ipRating: "IP20",
    defaultLabelPrefix: "PIR",
  },
  {
    key: "water-heater-1500w",
    name: "Electric water heater 1500 W",
    shortName: "Water heater",
    description: "Storage water heater, resistive load, dedicated circuit.",
    category: "water_heater",
    discipline: "electrical",
    symbol: "water-heater",
    terminals: socketTerminals,
    electrical: load({
      defaultLoadVA: 1500,
      typicalCircuitType: "water_heater",
      ratedCurrentA: 16,
      ratedVoltageV: 230,
    }),
    mounting: { method: "wall", defaultHeightMm: 1800, minHeightMm: 1200, maxHeightMm: 2400 },
    dimensionsMm: { width: 450, height: 600, depth: 450 },
    ipRating: "IPX4",
    defaultLabelPrefix: "WH",
    notes: "Tank volume, standing losses and thermostat behaviour are not modelled.",
  },
  {
    key: "cooker-32a",
    name: "Electric cooker connection 32 A",
    shortName: "Cooker",
    description: "Dedicated cooker outlet. Actual appliance rating must be confirmed by the designer.",
    category: "cooker",
    discipline: "electrical",
    symbol: "cooker",
    terminals: socketTerminals,
    electrical: load({
      defaultLoadVA: 7000,
      typicalCircuitType: "cooker",
      ratedCurrentA: 32,
      ratedVoltageV: 230,
    }),
    mounting: { method: "wall", defaultHeightMm: 300, minHeightMm: 150, maxHeightMm: 900 },
    dimensionsMm: { width: 100, height: 100, depth: 60 },
    ipRating: "IP20",
    defaultLabelPrefix: "CK",
  },
  {
    key: "hvac-split-2000w",
    name: "Split HVAC unit 2000 W",
    shortName: "HVAC",
    description: "Generic single-phase split unit. Cooling capacity and refrigerant data are not modelled.",
    category: "hvac_unit",
    discipline: "hvac",
    symbol: "hvac",
    terminals: socketTerminals,
    electrical: load({
      defaultLoadVA: 2200,
      powerFactor: 0.95,
      loadBehaviour: "inductive",
      typicalCircuitType: "hvac",
      ratedCurrentA: 16,
      ratedVoltageV: 230,
    }),
    mounting: { method: "wall", defaultHeightMm: 2200, minHeightMm: 1800, maxHeightMm: 3000 },
    dimensionsMm: { width: 900, height: 300, depth: 220 },
    ipRating: "IPX4",
    defaultLabelPrefix: "AC",
    notes: "HVAC load calculation uses electrical input only; thermal loads are a separate discipline.",
  },
  {
    key: "ev-charger-7kw",
    name: "EV charger 7.4 kW, single phase",
    shortName: "EV charger",
    description: "Mode 3 AC charging point, 32 A single phase, dedicated circuit.",
    category: "ev_charger",
    discipline: "electrical",
    symbol: "ev",
    terminals: socketTerminals,
    electrical: load({
      defaultLoadVA: 7400,
      typicalCircuitType: "ev_charging",
      ratedCurrentA: 32,
      ratedVoltageV: 230,
      rcdRecommended: true,
    }),
    mounting: { method: "wall", defaultHeightMm: 1200, minHeightMm: 600, maxHeightMm: 1500 },
    dimensionsMm: { width: 250, height: 400, depth: 150 },
    ipRating: "IP54",
    defaultLabelPrefix: "EV",
    notes: "Charging-mode and protective-device requirements depend on the installation; verify with the equipment data sheet.",
  },
  {
    key: "camera-ip-poe",
    name: "IP camera, PoE",
    shortName: "Camera",
    description: "Network camera powered over Ethernet. Telecom discipline placeholder.",
    category: "camera",
    discipline: "telecom",
    symbol: "camera",
    terminals: [{ designation: "RJ45", function: "signal", required: true, capacity: 1 }],
    electrical: noLoad({
      typicalCircuitType: "data",
      requiresEarth: false,
      rcdRecommended: false,
      protectionClass: "III",
      ratedVoltageV: 48,
    }),
    mounting: { method: "ceiling", defaultHeightMm: 2600, minHeightMm: 2200, maxHeightMm: 6000 },
    dimensionsMm: { width: 120, height: 120, depth: 90 },
    ipRating: "IP66",
    defaultLabelPrefix: "CAM",
  },
];

export const EQUIPMENT_CATALOG: readonly EquipmentDefinition[] = Object.freeze(
  rawDefinitions.map((definition) => equipmentDefinitionSchema.parse(definition)),
);

const byKey = new Map(EQUIPMENT_CATALOG.map((definition) => [definition.key, definition]));

if (byKey.size !== EQUIPMENT_CATALOG.length) {
  throw new Error("Duplicate equipment catalog keys detected");
}

export class UnknownEquipmentError extends Error {
  constructor(public readonly equipmentKey: string) {
    super(`Unknown equipment key: ${equipmentKey}`);
    this.name = "UnknownEquipmentError";
  }
}

export function getEquipmentDefinition(key: string): EquipmentDefinition {
  const definition = byKey.get(key);
  if (!definition) throw new UnknownEquipmentError(key);
  return definition;
}

export function findEquipmentDefinition(key: string): EquipmentDefinition | undefined {
  return byKey.get(key);
}

export function listEquipmentByDiscipline(discipline: Discipline): EquipmentDefinition[] {
  return EQUIPMENT_CATALOG.filter((definition) => definition.discipline === discipline);
}

export function listEquipmentByCategory(category: EquipmentCategory): EquipmentDefinition[] {
  return EQUIPMENT_CATALOG.filter((definition) => definition.category === category);
}

export interface CableType {
  key: string;
  name: string;
  conductorMaterial: "copper" | "aluminium";
  insulation: "PVC" | "XLPE";
  maxConductorTempC: 70 | 90;
  cores: number;
  flexible: boolean;
  /** Where this generic cable is allowed to be installed. Advisory only. */
  allowedMethods: string[];
  notes: string;
}

export const CABLE_TYPES: readonly CableType[] = Object.freeze([
  {
    key: "h07v-u",
    name: "H07V-U single-core, solid copper, PVC",
    conductorMaterial: "copper",
    insulation: "PVC",
    maxConductorTempC: 70,
    cores: 1,
    flexible: false,
    allowedMethods: ["conduit_recessed", "conduit_surface", "cable_tray"],
    notes: "Solid conductor for fixed wiring in conduit or trunking.",
  },
  {
    key: "h07v-k",
    name: "H07V-K single-core, flexible copper, PVC",
    conductorMaterial: "copper",
    insulation: "PVC",
    maxConductorTempC: 70,
    cores: 1,
    flexible: true,
    allowedMethods: ["conduit_recessed", "conduit_surface", "cable_tray"],
    notes: "Flexible conductor for fixed wiring where pulling through bends requires it.",
  },
  {
    key: "h07rn-f-3g",
    name: "H07RN-F 3G rubber flexible cable",
    conductorMaterial: "copper",
    insulation: "PVC",
    maxConductorTempC: 70,
    cores: 3,
    flexible: true,
    allowedMethods: ["cable_free_air", "conduit_surface"],
    notes: "Portable/flexible connections, not for concealed installation in walls.",
  },
  {
    key: "u-1000-r2v",
    name: "U-1000 R2V copper, XLPE",
    conductorMaterial: "copper",
    insulation: "XLPE",
    maxConductorTempC: 90,
    cores: 3,
    flexible: false,
    allowedMethods: ["direct_buried", "cable_tray", "conduit_surface"],
    notes: "Underground and outdoor distribution cable. Buried installation requires additional mechanical protection assessment.",
  },
]);

export interface ConduitType {
  key: string;
  name: string;
  nominalDiameterMm: number;
  material: "PVC" | "steel";
  notes: string;
}

export const CONDUIT_TYPES: readonly ConduitType[] = Object.freeze([
  { key: "pvc-16", name: "PVC conduit Ø16", nominalDiameterMm: 16, material: "PVC", notes: "Lighting drops and short single-circuit runs." },
  { key: "pvc-20", name: "PVC conduit Ø20", nominalDiameterMm: 20, material: "PVC", notes: "General socket and lighting circuits." },
  { key: "pvc-25", name: "PVC conduit Ø25", nominalDiameterMm: 25, material: "PVC", notes: "Multiple circuits and cooker/water-heater feeds." },
  { key: "pvc-32", name: "PVC conduit Ø32", nominalDiameterMm: 32, material: "PVC", notes: "Board feeders and grouped distribution runs." },
  { key: "steel-20", name: "Steel conduit Ø20", nominalDiameterMm: 20, material: "steel", notes: "Mechanical protection where required by the installation conditions." },
]);

export interface SupplyPreset {
  key: string;
  label: string;
  country: string;
  phaseVoltageV: number;
  lineVoltageV: number;
  frequencyHz: number;
  defaultEarthingSystem: "TN-S" | "TN-C-S" | "TT" | "IT";
  sourceNote: string;
}

/**
 * Regional defaults. They are *configurable starting points*, not a claim that
 * every installation in that country uses these values.
 */
export const SUPPLY_PRESETS: readonly SupplyPreset[] = Object.freeze([
  {
    key: "PT-LV-230-400",
    label: "Portugal low voltage 230/400 V",
    country: "PT",
    phaseVoltageV: 230,
    lineVoltageV: 400,
    frequencyHz: 50,
    defaultEarthingSystem: "TT",
    sourceNote:
      "Nominal LV values are user-configurable. Earthing arrangement must be confirmed from the DSO connection, not assumed.",
  },
  {
    key: "EU-LV-230-400",
    label: "EU low voltage 230/400 V",
    country: "EU",
    phaseVoltageV: 230,
    lineVoltageV: 400,
    frequencyHz: 50,
    defaultEarthingSystem: "TN-S",
    sourceNote: "Generic EU default. Confirm against the local supply and applicable national rules.",
  },
  {
    key: "UK-LV-230-400",
    label: "United Kingdom low voltage 230/400 V",
    country: "GB",
    phaseVoltageV: 230,
    lineVoltageV: 400,
    frequencyHz: 50,
    defaultEarthingSystem: "TN-C-S",
    sourceNote: "Nominal values are configurable; earthing arrangement requires confirmation.",
  },
]);

export const DEFAULT_SUPPLY_PRESET_KEY = "PT-LV-230-400";

export function getSupplyPreset(key: string): SupplyPreset {
  const preset = SUPPLY_PRESETS.find((p) => p.key === key);
  if (!preset) throw new Error(`Unknown supply preset: ${key}`);
  return preset;
}

export const BREAKER_RATINGS_A = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63] as const;
export type BreakerRating = (typeof BREAKER_RATINGS_A)[number];

export const RCD_RATED_CURRENTS_A = [25, 40, 63, 80, 100] as const;
export const RCD_SENSITIVITIES_MA = [10, 30, 100, 300, 500] as const;
