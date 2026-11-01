import type { Phase } from "@vectrix/core";

/**
 * Demo apartment geometry, in millimetres.
 *
 * This is a *fixture*, not a reference design. It exists so the workspace opens
 * with a coherent, calculable plan instead of an empty canvas, and so the
 * engineering engine is exercised by a realistic mix of lighting, socket,
 * cooker and water-heating circuits. It is labelled "Demonstration plan" in the
 * UI and in exported quantities.
 */

export const DEMO_PLAN_WIDTH_MM = 11_000;
export const DEMO_PLAN_HEIGHT_MM = 8_000;
export const DEMO_TEMPLATE_VERSION = "demo-t2-v1";

export interface DemoRoom {
  key: string;
  name: string;
  number: string;
  polygon: Array<{ x: number; y: number }>;
  clearHeightMm: number;
  occupancy: "dry" | "kitchen" | "bathroom" | "laundry" | "garage" | "outdoor" | "technical";
}

export interface DemoWall {
  key: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  thicknessMm: number;
  heightMm: number;
  kind: "exterior" | "interior" | "partition" | "shaft";
  material: "masonry" | "concrete" | "drywall" | "other";
  loadBearing: boolean;
  allowPenetration: boolean;
}

export interface DemoEquipment {
  key: string;
  roomKey: string;
  definitionKey: string;
  label: string;
  xMm: number;
  yMm: number;
  mountingHeightMm: number;
  rotationDeg?: number;
  circuitKey: string | null;
  phase?: Phase;
}

export interface DemoCircuit {
  key: string;
  name: string;
  description: string;
  type:
    | "lighting"
    | "sockets"
    | "cooker"
    | "water_heater"
    | "hvac"
    | "ev_charging"
    | "other_power"
    | "data";
  phaseMode: "single_phase" | "three_phase";
  breakerRatingA: number;
  breakerCurve: "B" | "C" | "D";
  rcdSensitivityMa: number | null;
  rcdRatingA: number | null;
  cableTypeKey: string;
  cableSectionMm2: number;
  demandFactor: number;
  voltageDropLimitPct: number | null;
  color: string;
  notes: string;
}

export interface DemoRoute {
  key: string;
  circuitKey: string;
  toEquipmentKey: string;
  status: "visual" | "proposed" | "validated" | "installed";
  conduitKey: string | null;
  points: Array<{ x: number; y: number }>;
  slackPercent: number;
  notes: string;
}

export interface DemoConnection {
  fromEquipmentKey: string;
  fromDesignation: string;
  toEquipmentKey: string;
  toDesignation: string;
  kind: "line" | "neutral" | "earth" | "switched_line" | "data";
}

export interface DemoLayout {
  version: string;
  projectName: string;
  projectCode: string;
  clientName: string;
  address: string;
  widthMm: number;
  heightMm: number;
  rooms: DemoRoom[];
  walls: DemoWall[];
  equipment: DemoEquipment[];
  circuits: DemoCircuit[];
  routes: DemoRoute[];
  connections: DemoConnection[];
}

const rooms: DemoRoom[] = [
  {
    key: "sala",
    name: "Sala / jantar",
    number: "01",
    polygon: [
      { x: 0, y: 0 },
      { x: 6200, y: 0 },
      { x: 6200, y: 4800 },
      { x: 0, y: 4800 },
    ],
    clearHeightMm: 2700,
    occupancy: "dry",
  },
  {
    key: "cozinha",
    name: "Cozinha",
    number: "02",
    polygon: [
      { x: 6200, y: 0 },
      { x: 11000, y: 0 },
      { x: 11000, y: 3200 },
      { x: 6200, y: 3200 },
    ],
    clearHeightMm: 2700,
    occupancy: "kitchen",
  },
  {
    key: "quarto1",
    name: "Quarto 1",
    number: "03",
    polygon: [
      { x: 0, y: 4800 },
      { x: 3800, y: 4800 },
      { x: 3800, y: 8000 },
      { x: 0, y: 8000 },
    ],
    clearHeightMm: 2700,
    occupancy: "dry",
  },
  {
    key: "hall",
    name: "Hall",
    number: "04",
    polygon: [
      { x: 3800, y: 4800 },
      { x: 6200, y: 4800 },
      { x: 6200, y: 6400 },
      { x: 3800, y: 6400 },
    ],
    clearHeightMm: 2700,
    occupancy: "dry",
  },
  {
    key: "despensa",
    name: "Despensa",
    number: "05",
    polygon: [
      { x: 3800, y: 6400 },
      { x: 6200, y: 6400 },
      { x: 6200, y: 8000 },
      { x: 3800, y: 8000 },
    ],
    clearHeightMm: 2400,
    occupancy: "technical",
  },
  {
    key: "quarto2",
    name: "Quarto 2",
    number: "06",
    polygon: [
      { x: 6200, y: 3200 },
      { x: 8600, y: 3200 },
      { x: 8600, y: 8000 },
      { x: 6200, y: 8000 },
    ],
    clearHeightMm: 2700,
    occupancy: "dry",
  },
  {
    key: "banho",
    name: "Casa de banho",
    number: "07",
    polygon: [
      { x: 8600, y: 3200 },
      { x: 11000, y: 3200 },
      { x: 11000, y: 5600 },
      { x: 8600, y: 5600 },
    ],
    clearHeightMm: 2400,
    occupancy: "bathroom",
  },
  {
    key: "lavandaria",
    name: "Lavandaria",
    number: "08",
    polygon: [
      { x: 8600, y: 5600 },
      { x: 11000, y: 5600 },
      { x: 11000, y: 8000 },
      { x: 8600, y: 8000 },
    ],
    clearHeightMm: 2400,
    occupancy: "laundry",
  },
];

const walls: DemoWall[] = [
  {
    key: "ext-north",
    start: { x: 0, y: 0 },
    end: { x: 11000, y: 0 },
    thicknessMm: 250,
    heightMm: 2700,
    kind: "exterior",
    material: "masonry",
    loadBearing: true,
    allowPenetration: false,
  },
  {
    key: "ext-east",
    start: { x: 11000, y: 0 },
    end: { x: 11000, y: 8000 },
    thicknessMm: 250,
    heightMm: 2700,
    kind: "exterior",
    material: "masonry",
    loadBearing: true,
    allowPenetration: false,
  },
  {
    key: "ext-south",
    start: { x: 11000, y: 8000 },
    end: { x: 0, y: 8000 },
    thicknessMm: 250,
    heightMm: 2700,
    kind: "exterior",
    material: "masonry",
    loadBearing: true,
    allowPenetration: false,
  },
  {
    key: "ext-west",
    start: { x: 0, y: 8000 },
    end: { x: 0, y: 0 },
    thicknessMm: 250,
    heightMm: 2700,
    kind: "exterior",
    material: "masonry",
    loadBearing: true,
    allowPenetration: false,
  },
  {
    key: "int-sala-cozinha",
    start: { x: 6200, y: 0 },
    end: { x: 6200, y: 3200 },
    thicknessMm: 120,
    heightMm: 2700,
    kind: "interior",
    material: "masonry",
    loadBearing: false,
    allowPenetration: true,
  },
  {
    key: "int-central",
    start: { x: 6200, y: 3200 },
    end: { x: 6200, y: 8000 },
    thicknessMm: 120,
    heightMm: 2700,
    kind: "interior",
    material: "masonry",
    loadBearing: false,
    allowPenetration: true,
  },
  {
    key: "int-cozinha-banho",
    start: { x: 6200, y: 3200 },
    end: { x: 11000, y: 3200 },
    thicknessMm: 120,
    heightMm: 2700,
    kind: "interior",
    material: "masonry",
    loadBearing: false,
    allowPenetration: true,
  },
  {
    key: "int-sala-quarto",
    start: { x: 0, y: 4800 },
    end: { x: 6200, y: 4800 },
    thicknessMm: 120,
    heightMm: 2700,
    kind: "interior",
    material: "masonry",
    loadBearing: false,
    allowPenetration: true,
  },
  {
    key: "int-quarto-hall",
    start: { x: 3800, y: 4800 },
    end: { x: 3800, y: 8000 },
    thicknessMm: 120,
    heightMm: 2700,
    kind: "interior",
    material: "masonry",
    loadBearing: false,
    allowPenetration: true,
  },
  {
    key: "int-hall-despensa",
    start: { x: 3800, y: 6400 },
    end: { x: 6200, y: 6400 },
    thicknessMm: 100,
    heightMm: 2400,
    kind: "partition",
    material: "drywall",
    loadBearing: false,
    allowPenetration: true,
  },
  {
    key: "int-quarto-banho",
    start: { x: 8600, y: 3200 },
    end: { x: 8600, y: 8000 },
    thicknessMm: 120,
    heightMm: 2700,
    kind: "interior",
    material: "masonry",
    loadBearing: false,
    allowPenetration: true,
  },
  {
    key: "int-banho-lavandaria",
    start: { x: 8600, y: 5600 },
    end: { x: 11000, y: 5600 },
    thicknessMm: 100,
    heightMm: 2400,
    kind: "partition",
    material: "drywall",
    loadBearing: false,
    allowPenetration: true,
  },
];

const circuits: DemoCircuit[] = [
  {
    key: "light-social",
    name: "Iluminação social",
    description: "Sala, cozinha e hall. Controlo local por interruptor.",
    type: "lighting",
    phaseMode: "single_phase",
    breakerRatingA: 10,
    breakerCurve: "B",
    rcdSensitivityMa: null,
    rcdRatingA: null,
    cableTypeKey: "h07v-u",
    cableSectionMm2: 1.5,
    demandFactor: 1,
    voltageDropLimitPct: 3,
    color: "#f2b544",
    notes: "Generic LED luminaires; switching relationships are not yet modelled as control links.",
  },
  {
    key: "light-private",
    name: "Iluminação quartos",
    description: "Quartos, casa de banho e lavandaria.",
    type: "lighting",
    phaseMode: "single_phase",
    breakerRatingA: 10,
    breakerCurve: "B",
    rcdSensitivityMa: null,
    rcdRatingA: null,
    cableTypeKey: "h07v-u",
    cableSectionMm2: 1.5,
    demandFactor: 1,
    voltageDropLimitPct: 3,
    color: "#e5d6a8",
    notes: "Bathroom luminaire location must be reviewed against the wet-zone assessment.",
  },
  {
    key: "sockets-living",
    name: "Tomadas sala",
    description: "Sete tomadas Schuko 16 A: cinco na sala e duas no hall.",
    type: "sockets",
    phaseMode: "single_phase",
    breakerRatingA: 16,
    breakerCurve: "B",
    rcdSensitivityMa: 30,
    rcdRatingA: 40,
    cableTypeKey: "h07v-u",
    cableSectionMm2: 2.5,
    demandFactor: 0.11,
    voltageDropLimitPct: 4,
    color: "#4fb3ff",
    notes: "Seven outlets at 3680 VA would be 112 A if simultaneous. The 0.11 demand factor is an explicit assumption for expected living-area/hall use, not a code value.",
  },
  {
    key: "sockets-rooms",
    name: "Tomadas quartos",
    description: "Seis tomadas Schuko 16 A nos dois quartos.",
    type: "sockets",
    phaseMode: "single_phase",
    breakerRatingA: 16,
    breakerCurve: "B",
    rcdSensitivityMa: 30,
    rcdRatingA: 40,
    cableTypeKey: "h07v-u",
    cableSectionMm2: 2.5,
    demandFactor: 0.12,
    voltageDropLimitPct: 4,
    color: "#5ad1a5",
    notes: "Demand factor 0.12 reflects expected bedroom use, not outlet ratings.",
  },
  {
    key: "sockets-kitchen",
    name: "Tomadas cozinha",
    description: "Três tomadas Schuko 16 A acima do plano de trabalho.",
    type: "sockets",
    phaseMode: "single_phase",
    breakerRatingA: 16,
    breakerCurve: "B",
    rcdSensitivityMa: 30,
    rcdRatingA: 40,
    cableTypeKey: "h07v-u",
    cableSectionMm2: 2.5,
    demandFactor: 0.2,
    voltageDropLimitPct: 4,
    color: "#ff8a5b",
    notes: "Cooker is on a dedicated circuit and is not included here.",
  },
  {
    key: "sockets-wet",
    name: "Tomadas banho / lavandaria",
    description: "Tomada IP44 na casa de banho e duas tomadas na lavandaria.",
    type: "sockets",
    phaseMode: "single_phase",
    breakerRatingA: 16,
    breakerCurve: "B",
    rcdSensitivityMa: 30,
    rcdRatingA: 40,
    cableTypeKey: "h07v-u",
    cableSectionMm2: 2.5,
    demandFactor: 0.15,
    voltageDropLimitPct: 4,
    color: "#b28dff",
    notes: "Wet-zone suitability is a separate assessment; IP44 alone is not a location approval.",
  },
  {
    key: "cooker",
    name: "Fogão",
    description: "Ligação dedicada de fogão elétrico, 32 A.",
    type: "cooker",
    phaseMode: "single_phase",
    breakerRatingA: 32,
    breakerCurve: "C",
    rcdSensitivityMa: 30,
    rcdRatingA: 40,
    cableTypeKey: "h07v-u",
    cableSectionMm2: 6,
    demandFactor: 0.7,
    voltageDropLimitPct: 4,
    color: "#ff5d73",
    notes: "Appliance rating must be confirmed against the selected model before ordering cable.",
  },
  {
    key: "water-heating",
    name: "Aquecimento de águas",
    description: "Dois termoacumuladores de 1500 W.",
    type: "water_heater",
    phaseMode: "single_phase",
    breakerRatingA: 16,
    breakerCurve: "C",
    rcdSensitivityMa: 30,
    rcdRatingA: 40,
    cableTypeKey: "h07v-u",
    cableSectionMm2: 2.5,
    demandFactor: 0.8,
    voltageDropLimitPct: 4,
    color: "#7ce0e8",
    notes: "Standing losses and thermostat behaviour are not modelled. Both heaters are assumed to run together.",
  },
];

const e = (
  key: string,
  roomKey: string,
  definitionKey: string,
  label: string,
  xMm: number,
  yMm: number,
  mountingHeightMm: number,
  circuitKey: string | null,
  rotationDeg = 0,
): DemoEquipment => ({
  key,
  roomKey,
  definitionKey,
  label,
  xMm,
  yMm,
  mountingHeightMm,
  rotationDeg,
  circuitKey,
});

const equipment: DemoEquipment[] = [
  e("board", "hall", "distribution-board-12way", "DB-T2", 4300, 5600, 1400, null),

  e("sala-s1", "sala", "socket-schuko-16a-2p-e", "S1", 5900, 1000, 300, "sockets-living"),
  e("sala-s2", "sala", "socket-schuko-16a-2p-e", "S2", 5900, 1900, 300, "sockets-living"),
  e("sala-s3", "sala", "socket-schuko-16a-2p-e", "S3", 2000, 4500, 300, "sockets-living"),
  e("sala-s4", "sala", "socket-schuko-16a-2p-e", "S4", 4000, 4500, 300, "sockets-living"),
  e("sala-s5", "sala", "socket-schuko-16a-2p-e", "S5", 900, 2400, 300, "sockets-living"),
  e("sala-l1", "sala", "light-led-downlight-20w", "L1", 2000, 1500, 2500, "light-social"),
  e("sala-l2", "sala", "light-led-downlight-20w", "L2", 4400, 3200, 2500, "light-social"),
  e("sala-sw", "sala", "switch-1g-10a", "SW1", 5200, 4500, 1050, "light-social"),

  e("coz-s6", "cozinha", "socket-schuko-16a-2p-e", "S6", 6600, 380, 1100, "sockets-kitchen"),
  e("coz-s7", "cozinha", "socket-schuko-16a-2p-e", "S7", 9000, 380, 1100, "sockets-kitchen"),
  e("coz-s8", "cozinha", "socket-schuko-16a-2p-e", "S8", 10700, 2300, 1100, "sockets-kitchen"),
  e("coz-l3", "cozinha", "light-led-downlight-20w", "L3", 7600, 900, 2500, "light-social"),
  e("coz-l4", "cozinha", "light-led-downlight-20w", "L4", 9800, 2200, 2500, "light-social"),
  e("coz-sw", "cozinha", "switch-1g-10a", "SW2", 10500, 2900, 1050, "light-social"),
  e("coz-cooker", "cozinha", "cooker-32a", "CK1", 7900, 2900, 300, "cooker"),

  e("q1-s9", "quarto1", "socket-schuko-16a-2p-e", "S9", 300, 5200, 300, "sockets-rooms"),
  e("q1-s10", "quarto1", "socket-schuko-16a-2p-e", "S10", 300, 6100, 300, "sockets-rooms"),
  e("q1-s11", "quarto1", "socket-schuko-16a-2p-e", "S11", 3400, 7600, 300, "sockets-rooms"),
  e("q1-l5", "quarto1", "light-led-downlight-20w", "L5", 1900, 6400, 2500, "light-private"),
  e("q1-sw", "quarto1", "switch-1g-10a", "SW3", 3300, 5000, 1050, "light-private"),

  e("q2-s12", "quarto2", "socket-schuko-16a-2p-e", "S12", 6500, 3600, 300, "sockets-rooms"),
  e("q2-s13", "quarto2", "socket-schuko-16a-2p-e", "S13", 8300, 6000, 300, "sockets-rooms"),
  e("q2-s14", "quarto2", "socket-schuko-16a-2p-e", "S14", 6500, 7600, 300, "sockets-rooms"),
  e("q2-l6", "quarto2", "light-led-downlight-20w", "L6", 7400, 5600, 2500, "light-private"),
  e("q2-sw", "quarto2", "switch-1g-10a", "SW4", 8300, 3500, 1050, "light-private"),

  e("hall-s15", "hall", "socket-schuko-16a-2p-e", "S15", 3900, 5000, 300, "sockets-living"),
  e("hall-s16", "hall", "socket-schuko-16a-2p-e", "S16", 6000, 6200, 300, "sockets-living"),
  e("hall-l7", "hall", "light-led-downlight-20w", "L7", 5000, 5600, 2500, "light-social"),
  e("hall-sw", "hall", "switch-1g-10a", "SW5", 4000, 6200, 1050, "light-social"),

  e("bath-s17", "banho", "socket-schuko-16a-ip44", "S17", 10700, 4200, 1100, "sockets-wet"),
  e("bath-l8", "banho", "light-led-downlight-20w", "L8", 9800, 4400, 2500, "light-private"),
  e("bath-sw", "banho", "switch-1g-10a", "SW6", 8800, 5400, 1050, "light-private"),
  e("bath-wh", "banho", "water-heater-1500w", "WH1", 10700, 5300, 1800, "water-heating"),

  e("lav-s18", "lavandaria", "socket-schuko-16a-2p-e", "S18", 8900, 6000, 300, "sockets-wet"),
  e("lav-s19", "lavandaria", "socket-schuko-16a-2p-e", "S19", 8900, 7000, 300, "sockets-wet"),
  e("lav-l9", "lavandaria", "light-led-downlight-20w", "L9", 9800, 6800, 2500, "light-private"),
  e("lav-sw", "lavandaria", "switch-1g-10a", "SW7", 10700, 7700, 1050, "light-private"),
  e("lav-wh", "lavandaria", "water-heater-1500w", "WH2", 10700, 6200, 1800, "water-heating"),
];

const routes: DemoRoute[] = [
  {
    key: "route-light-social",
    circuitKey: "light-social",
    toEquipmentKey: "sala-l1",
    status: "proposed",
    conduitKey: "pvc-20",
    points: [
      { x: 4300, y: 5600 },
      { x: 4300, y: 4400 },
      { x: 2000, y: 4400 },
      { x: 2000, y: 1500 },
    ],
    slackPercent: 10,
    notes: "Ceiling drop above the living area. Wall crossings are declared penetrations.",
  },
  {
    key: "route-sockets-living",
    circuitKey: "sockets-living",
    toEquipmentKey: "sala-s1",
    status: "proposed",
    conduitKey: "pvc-20",
    points: [
      { x: 4300, y: 5600 },
      { x: 4300, y: 4400 },
      { x: 5900, y: 4400 },
      { x: 5900, y: 1000 },
    ],
    slackPercent: 10,
    notes: "Socket run along the east wall of the living room.",
  },
  {
    key: "route-sockets-kitchen",
    circuitKey: "sockets-kitchen",
    toEquipmentKey: "coz-s6",
    status: "proposed",
    conduitKey: "pvc-20",
    points: [
      { x: 4300, y: 5600 },
      { x: 4300, y: 2900 },
      { x: 6500, y: 2900 },
      { x: 6500, y: 380 },
    ],
    slackPercent: 10,
    notes: "Route passes through the hall/kitchen penetration.",
  },
  {
    key: "route-light-private",
    circuitKey: "light-private",
    toEquipmentKey: "q1-l5",
    status: "proposed",
    conduitKey: "pvc-16",
    points: [
      { x: 4300, y: 5600 },
      { x: 4300, y: 6900 },
      { x: 1900, y: 6900 },
      { x: 1900, y: 6400 },
    ],
    slackPercent: 10,
    notes: "Bedroom lighting drop.",
  },
  {
    key: "route-sockets-rooms",
    circuitKey: "sockets-rooms",
    toEquipmentKey: "q2-s13",
    status: "proposed",
    conduitKey: "pvc-20",
    points: [
      { x: 4300, y: 5600 },
      { x: 4300, y: 5200 },
      { x: 7400, y: 5200 },
      { x: 7400, y: 6000 },
      { x: 8300, y: 6000 },
    ],
    slackPercent: 10,
    notes: "Bedroom socket group; farthest outlet assumed to carry full circuit demand.",
  },
  {
    key: "route-water-heater",
    circuitKey: "water-heating",
    toEquipmentKey: "bath-wh",
    status: "proposed",
    conduitKey: "pvc-25",
    points: [
      { x: 4300, y: 5600 },
      { x: 4300, y: 5000 },
      { x: 9600, y: 5000 },
      { x: 9600, y: 5300 },
      { x: 10700, y: 5300 },
    ],
    slackPercent: 10,
    notes: "Dedicated water-heater feed. Isolator not modelled.",
  },
  {
    key: "route-cooker",
    circuitKey: "cooker",
    toEquipmentKey: "coz-cooker",
    status: "proposed",
    conduitKey: "pvc-25",
    points: [
      { x: 4300, y: 5600 },
      { x: 4300, y: 2500 },
      { x: 7900, y: 2500 },
      { x: 7900, y: 2900 },
    ],
    slackPercent: 10,
    notes: "Cooker feed. Confirm appliance rating before ordering 6 mm² cable.",
  },
  {
    key: "route-sockets-wet",
    circuitKey: "sockets-wet",
    toEquipmentKey: "lav-s18",
    status: "visual",
    conduitKey: "pvc-20",
    points: [
      { x: 4300, y: 5600 },
      { x: 4300, y: 7200 },
      { x: 8900, y: 7200 },
      { x: 8900, y: 7000 },
    ],
    slackPercent: 10,
    notes: "Visual only: not yet reviewed or promoted to a proposed route.",
  },
];

const connections: DemoConnection[] = [
  {
    fromEquipmentKey: "board",
    fromDesignation: "L1",
    toEquipmentKey: "sala-s1",
    toDesignation: "L",
    kind: "line",
  },
  {
    fromEquipmentKey: "board",
    fromDesignation: "N",
    toEquipmentKey: "sala-s1",
    toDesignation: "N",
    kind: "neutral",
  },
  {
    fromEquipmentKey: "board",
    fromDesignation: "PE",
    toEquipmentKey: "sala-s1",
    toDesignation: "PE",
    kind: "earth",
  },
];

export const DEMO_LAYOUT: DemoLayout = Object.freeze({
  version: DEMO_TEMPLATE_VERSION,
  projectName: "Apartamento T2 — Rua das Flores",
  projectCode: "VX-DEMO-001",
  clientName: "Cliente de demonstração",
  address: "Rua das Flores 42, 1200-192 Lisboa, Portugal",
  widthMm: DEMO_PLAN_WIDTH_MM,
  heightMm: DEMO_PLAN_HEIGHT_MM,
  rooms,
  walls,
  equipment,
  circuits,
  routes,
  connections,
});

export const DEMO_COUNTS = Object.freeze({
  rooms: rooms.length,
  walls: walls.length,
  equipment: equipment.length,
  circuits: circuits.length,
  routes: routes.length,
  connections: connections.length,
});
