import type {
  Circuit,
  Connection,
  Equipment,
  LevelWorkspace,
  Project,
  Room,
  Route,
  Terminal,
  ValidationResult,
  Wall,
} from "@vectrix/core";
import type { CableSelectionResult, LoadSchedule, MaterialTakeoff } from "@vectrix/electrical";

export interface LevelSummary {
  id: string;
  name: string;
  elevationMm: number;
  sortOrder: number;
}

export interface WorkspaceStats {
  rooms: number;
  walls: number;
  equipment: number;
  circuits: number;
  routes: number;
  connections: number;
  errors: number;
  warnings: number;
  infos: number;
  connectedVA: number;
  demandVA: number;
  installedRoutes: number;
  validatedRoutes: number;
}

export interface WorkspacePayloadClient {
  workspace: LevelWorkspace;
  levels: LevelSummary[];
  stats: WorkspaceStats;
  loadSchedule: LoadSchedule;
  takeoff: MaterialTakeoff;
  advisory: {
    ruleSetVersion: string;
    jurisdiction: string;
    notice: string;
  };
}

export type Selection =
  | { kind: "equipment"; id: string }
  | { kind: "route"; id: string }
  | { kind: "room"; id: string }
  | { kind: "wall"; id: string }
  | { kind: "circuit"; id: string }
  | null;

export type PlanTool = "select" | "pan" | "wall" | "room" | "route";

export type WorkspaceView = "plan" | "circuits" | "materials" | "findings";

export type {
  CableSelectionResult,
  Circuit,
  Connection,
  Equipment,
  LevelWorkspace,
  LoadSchedule,
  MaterialTakeoff,
  Project,
  Room,
  Route,
  Terminal,
  ValidationResult,
  Wall,
};
