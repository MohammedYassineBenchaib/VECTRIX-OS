import type { MemberRole } from "@vectrix/core";

export interface ProjectListCard {
  id: string;
  name: string;
  code: string;
  clientName: string;
  address: string;
  status: string;
  updatedAt: string | Date;
  createdAt: string | Date;
  counts: {
    levels: number;
    rooms: number;
    walls: number;
    equipment: number;
    circuits: number;
    routes: number;
    connections: number;
  };
  findings: { errors: number; warnings: number; infos: number };
  totals: { connectedVA: number; demandVA: number };
}

export interface SessionSummary {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  orgName: string;
}

export const PROJECT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  design: "In design",
  issued: "Issued",
  as_built: "As built",
  archived: "Archived",
};
