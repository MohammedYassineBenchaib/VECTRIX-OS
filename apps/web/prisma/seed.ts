import "./load-env";
import { fixtureId, getSupplyPreset, newId } from "@vectrix/core";
import { prisma } from "../src/server/db";
import { hashPassword } from "../src/server/password";
import { materializeDemoProject, materializeEmptyProject } from "../src/server/materialize";
import { refreshValidations } from "../src/server/design";
import { DEMO_LAYOUT } from "../src/server/demo-layout";

const DEMO_PASSWORD = "VectrixDemo!2026";

async function main() {
  const orgId = fixtureId("organization", "vectrix-demo");
  const engineerId = fixtureId("user", "engineer");
  const technicianId = fixtureId("user", "technician");
  const passwordHash = hashPassword(DEMO_PASSWORD);

  const org = await prisma.organization.upsert({
    where: { slug: "vectrix-demo" },
    update: { name: "VECTRIX Demo Studio" },
    create: { id: orgId, name: "VECTRIX Demo Studio", slug: "vectrix-demo" },
  });

  const engineer = await prisma.user.upsert({
    where: { email: "engineer@vectrix.pt" },
    update: { name: "Marta Engenheira", passwordHash },
    create: {
      id: engineerId,
      email: "engineer@vectrix.pt",
      name: "Marta Engenheira",
      passwordHash,
    },
  });

  const technician = await prisma.user.upsert({
    where: { email: "tech@vectrix.pt" },
    update: { name: "Tiago Técnico", passwordHash },
    create: {
      id: technicianId,
      email: "tech@vectrix.pt",
      name: "Tiago Técnico",
      passwordHash,
    },
  });

  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: org.id, userId: engineer.id } },
    update: { role: "engineer" },
    create: { id: newId("membership"), orgId: org.id, userId: engineer.id, role: "engineer" },
  });
  await prisma.membership.upsert({
    where: { orgId_userId: { orgId: org.id, userId: technician.id } },
    update: { role: "technician" },
    create: { id: newId("membership"), orgId: org.id, userId: technician.id, role: "technician" },
  });

  const preset = getSupplyPreset("PT-LV-230-400");

  const demoProjectId = fixtureId("project", "demo-t2");
  const existingDemo = await prisma.project.findUnique({ where: { id: demoProjectId } });
  if (!existingDemo) {
    await prisma.$transaction(async (tx) => {
      await tx.project.create({
        data: {
          id: demoProjectId,
          orgId: org.id,
          name: DEMO_LAYOUT.projectName,
          code: DEMO_LAYOUT.projectCode,
          clientName: DEMO_LAYOUT.clientName,
          address: DEMO_LAYOUT.address,
          country: "PT",
          jurisdiction: "PT",
          supplyPresetKey: preset.key,
          phaseVoltageV: preset.phaseVoltageV,
          lineVoltageV: preset.lineVoltageV,
          frequencyHz: preset.frequencyHz,
          earthingSystem: preset.defaultEarthingSystem,
          voltageDropLimitLightingPct: 3,
          voltageDropLimitOtherPct: 4,
          status: "design",
          notes:
            "Plano de demonstração. Não é um projeto de referência nem está aprovado para construção.",
          createdBy: engineer.id,
        },
      });
      await materializeDemoProject(tx, {
        orgId: org.id,
        userId: engineer.id,
        projectId: demoProjectId,
        name: DEMO_LAYOUT.projectName,
        code: DEMO_LAYOUT.projectCode,
        clientName: DEMO_LAYOUT.clientName,
        address: DEMO_LAYOUT.address,
      });
      await tx.auditEvent.create({
        data: {
          id: newId("audit"),
          orgId: org.id,
          projectId: demoProjectId,
          actorId: engineer.id,
          action: "project.create",
          entityType: "project",
          entityId: demoProjectId,
          payloadJson: JSON.stringify({ template: "demo", seed: true }),
        },
      });
    });
    console.log("Created demo project", DEMO_LAYOUT.projectCode);
  } else {
    console.log("Demo project already exists", DEMO_LAYOUT.projectCode);
  }

  const emptyProjectId = fixtureId("project", "demo-empty");
  const existingEmpty = await prisma.project.findUnique({ where: { id: emptyProjectId } });
  if (!existingEmpty) {
    await prisma.$transaction(async (tx) => {
      await tx.project.create({
        data: {
          id: emptyProjectId,
          orgId: org.id,
          name: "Edifício Baixa — estudo",
          code: "VX-DEMO-002",
          clientName: "Cliente de demonstração",
          address: "Praça do Comércio, 1100-148 Lisboa, Portugal",
          country: "PT",
          jurisdiction: "PT",
          supplyPresetKey: preset.key,
          phaseVoltageV: preset.phaseVoltageV,
          lineVoltageV: preset.lineVoltageV,
          frequencyHz: preset.frequencyHz,
          earthingSystem: preset.defaultEarthingSystem,
          voltageDropLimitLightingPct: 3,
          voltageDropLimitOtherPct: 4,
          status: "design",
          notes: "Projeto vazio para demonstrar o fluxo de criação e desenho.",
          createdBy: engineer.id,
        },
      });
      await materializeEmptyProject(
        tx,
        {
          orgId: org.id,
          userId: engineer.id,
          projectId: emptyProjectId,
          name: "Edifício Baixa — estudo",
          code: "VX-DEMO-002",
        },
        { widthMm: 12_000, heightMm: 9_000 },
      );
    });
    console.log("Created empty project VX-DEMO-002");
  } else {
    console.log("Empty project already exists VX-DEMO-002");
  }

  const summary = await refreshValidations(demoProjectId, engineer.id);
  console.log(
    `Demo validation: ${summary.summary.errors} error(s), ${summary.summary.warnings} warning(s), ${summary.summary.infos} info(s)`,
  );
  console.log("Demo users:");
  console.log("  engineer@vectrix.pt / VectrixDemo!2026 (engineer)");
  console.log("  tech@vectrix.pt     / VectrixDemo!2026 (technician)");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
