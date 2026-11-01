import { Prisma } from "@prisma/client";
import { getSupplyPreset, newId, type Project } from "@vectrix/core";
import { prisma } from "./db";
import type { SessionUser } from "./auth";
import type { CreateProjectInput } from "./schemas";
import { ApiError } from "./api";
import { materializeDemoProject, materializeEmptyProject } from "./materialize";
import { serializeProject } from "./serialize";
import { loadProjectDashboard, refreshValidations } from "./design";

export interface ProjectListItem {
  id: string;
  name: string;
  code: string;
  clientName: string;
  address: string;
  status: string;
  updatedAt: Date;
  createdAt: Date;
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

export async function listProjects(orgId: string): Promise<ProjectListItem[]> {
  const rows = await prisma.project.findMany({
    where: { orgId },
    orderBy: { updatedAt: "desc" },
    include: {
      buildings: { include: { _count: { select: { levels: true } } } },
      _count: { select: { circuits: true, routes: true } },
      validations: { select: { severity: true, status: true } },
    },
  });

  if (rows.length === 0) return [];

  const levels = await prisma.level.findMany({
    where: { building: { projectId: { in: rows.map((row) => row.id) } } },
    select: { id: true, building: { select: { projectId: true } } },
  });
  const levelToProject = new Map(levels.map((level) => [level.id, level.building.projectId]));

  const [roomCounts, equipmentCounts, wallCounts, connectionCounts] = await Promise.all([
    prisma.room.groupBy({
      by: ["levelId"],
      where: { level: { building: { projectId: { in: rows.map((row) => row.id) } } } },
      _count: { _all: true },
    }),
    prisma.equipment.groupBy({
      by: ["levelId"],
      where: { level: { building: { projectId: { in: rows.map((row) => row.id) } } } },
      _count: { _all: true },
    }),
    prisma.wall.groupBy({
      by: ["levelId"],
      where: { level: { building: { projectId: { in: rows.map((row) => row.id) } } } },
      _count: { _all: true },
    }),
    prisma.connection.groupBy({
      by: ["projectId"],
      where: { projectId: { in: rows.map((row) => row.id) } },
      _count: { _all: true },
    }),
  ]);

  const roomsByProject = new Map<string, number>();
  for (const row of roomCounts) {
    const projectId = levelToProject.get(row.levelId);
    if (!projectId) continue;
    roomsByProject.set(projectId, (roomsByProject.get(projectId) ?? 0) + row._count._all);
  }
  const equipmentByProject = new Map<string, number>();
  for (const row of equipmentCounts) {
    const projectId = levelToProject.get(row.levelId);
    if (!projectId) continue;
    equipmentByProject.set(projectId, (equipmentByProject.get(projectId) ?? 0) + row._count._all);
  }
  const wallsByProject = new Map<string, number>();
  for (const row of wallCounts) {
    const projectId = levelToProject.get(row.levelId);
    if (!projectId) continue;
    wallsByProject.set(projectId, (wallsByProject.get(projectId) ?? 0) + row._count._all);
  }
  const connectionsByProject = new Map(
    connectionCounts.map((row) => [row.projectId, row._count._all]),
  );

  return rows.map((row) => {
    const open = row.validations.filter((validation) => validation.status !== "resolved");
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      clientName: row.clientName,
      address: row.address,
      status: row.status,
      updatedAt: row.updatedAt,
      createdAt: row.createdAt,
      counts: {
        levels: row.buildings.reduce((sum, building) => sum + building._count.levels, 0),
        rooms: roomsByProject.get(row.id) ?? 0,
        walls: wallsByProject.get(row.id) ?? 0,
        equipment: equipmentByProject.get(row.id) ?? 0,
        circuits: row._count.circuits,
        routes: row._count.routes,
        connections: connectionsByProject.get(row.id) ?? 0,
      },
      findings: {
        errors: open.filter((validation) => validation.severity === "error").length,
        warnings: open.filter((validation) => validation.severity === "warning").length,
        infos: open.filter((validation) => validation.severity === "info").length,
      },
      totals: { connectedVA: 0, demandVA: 0 },
    };
  });
}

export async function createProject(
  user: SessionUser,
  input: CreateProjectInput,
): Promise<{ project: Project; levelId: string }> {
  const preset = getSupplyPreset(input.supplyPresetKey);
  const projectId = newId("project");
  const name = input.template === "demo" ? input.name || "Apartamento T2 — demonstração" : input.name;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.project.findFirst({
      where: { orgId: user.orgId, code: input.code },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(
        409,
        "PROJECT_CODE_TAKEN",
        `Project code "${input.code}" is already used in this organisation.`,
      );
    }

    const row = await tx.project.create({
      data: {
        id: projectId,
        orgId: user.orgId,
        name,
        code: input.code,
        clientName: input.clientName,
        address: input.address,
        country: "PT",
        jurisdiction: input.jurisdiction,
        supplyPresetKey: preset.key,
        phaseVoltageV: preset.phaseVoltageV,
        lineVoltageV: preset.lineVoltageV,
        frequencyHz: preset.frequencyHz,
        earthingSystem: preset.defaultEarthingSystem,
        voltageDropLimitLightingPct: 3,
        voltageDropLimitOtherPct: 4,
        status: "design",
        notes:
          input.template === "demo"
            ? "Demonstration plan generated by VECTRIX. Not a reference design and not approved for construction."
            : "",
        createdBy: user.id,
      },
    });

    const materialized =
      input.template === "demo"
        ? await materializeDemoProject(tx, {
            orgId: user.orgId,
            userId: user.id,
            projectId,
            name,
            code: input.code,
            clientName: input.clientName,
            address: input.address,
          })
        : await materializeEmptyProject(
            tx,
            { orgId: user.orgId, userId: user.id, projectId, name, code: input.code },
            { widthMm: input.widthMm, heightMm: input.heightMm },
          );

    await tx.auditEvent.create({
      data: {
        id: newId("audit"),
        orgId: user.orgId,
        projectId,
        actorId: user.id,
        action: "project.create",
        entityType: "project",
        entityId: projectId,
        payloadJson: JSON.stringify({
          template: input.template,
          name,
          code: input.code,
          supplyPresetKey: preset.key,
        }),
      },
    });

    return { row, levelId: materialized.levelId };
  });

  await refreshValidations(projectId, user.id);

  return { project: serializeProject(result.row), levelId: result.levelId };
}

export async function loadProjectCard(projectId: string) {
  return loadProjectDashboard(projectId);
}

export async function updateProject(
  projectId: string,
  user: SessionUser,
  input: Record<string, unknown>,
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");

  const row = await prisma.project.update({
    where: { id: projectId },
    data: input as Prisma.ProjectUpdateInput,
  });
  await prisma.auditEvent.create({
    data: {
      id: newId("audit"),
      orgId: project.orgId,
      projectId,
      actorId: user.id,
      action: "project.update",
      entityType: "project",
      entityId: projectId,
      payloadJson: JSON.stringify(input),
    },
  });
  return serializeProject(row);
}
