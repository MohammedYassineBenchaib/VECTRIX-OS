import { expect, test } from "@playwright/test";

test.describe("technician permissions @technician", () => {
  test("can read design data and estimates", async ({ request }) => {
    const projects = await request.get("/api/projects");
    expect(projects.status()).toBe(200);

    const workspace = await request.get("/api/projects/prj_demo-t2/workspace");
    expect(workspace.status()).toBe(200);

    const takeoff = await request.get("/api/projects/prj_demo-t2/takeoff");
    expect(takeoff.status()).toBe(200);
  });

  test("cannot mutate design data or run validation", async ({ request }) => {
    const create = await request.post("/api/projects", {
      data: { name: "Technician project", code: "VX-TECH-001" },
    });
    expect(create.status()).toBe(403);
    expect((await create.json()).error.code).toBe("FORBIDDEN");

    const validate = await request.post("/api/projects/prj_demo-t2/validate", { data: {} });
    expect(validate.status()).toBe(403);
    expect((await validate.json()).error.code).toBe("FORBIDDEN");

    const equipment = await request.post("/api/projects/prj_demo-t2/equipment", {
      data: {
        levelId: "lvl_missing",
        definitionKey: "socket-schuko-16a-2p-e",
        xMm: 100,
        yMm: 100,
      },
    });
    expect(equipment.status()).toBe(403);
  });

  test("sees the workspace with the technician role identified", async ({ page }) => {
    await page.goto("/projects/prj_demo-t2");
    await expect(page.locator(".project-code")).toHaveText("VX-DEMO-001");
    await page.locator(".account-trigger").click();
    await expect(page.getByRole("menu")).toContainText("technician · VECTRIX Demo Studio");
  });

  test("shows read-only affordances instead of mutation controls", async ({ page }) => {
    await page.goto("/projects/prj_demo-t2");
    await expect(page.locator(".project-code")).toHaveText("VX-DEMO-001");

    // The command rail disables validation and flags the role as read-only.
    await expect(page.getByRole("button", { name: "Validate", exact: true })).toBeDisabled();
    await expect(page.locator(".read-only-chip")).toHaveText("Read-only");

    // The inspector states why editing is unavailable.
    await expect(page.locator(".inspector-column")).toContainText(
      "Read-only role: inspection and exports are available, but design changes are disabled.",
    );

    // Placement and drawing tools are disabled, but selection and panning remain usable.
    const tools = page.getByRole("toolbar", { name: "Drawing tools" });
    await expect(tools.getByRole("button", { name: /^Wall/ })).toBeDisabled();
    await expect(tools.getByRole("button", { name: /^Select/ })).toBeEnabled();

    // Technicians still read the circuit schedule, but cannot add a circuit.
    await page
      .getByRole("navigation", { name: "Workspace sections" })
      .getByRole("button", { name: "Circuit schedule" })
      .click();
    await expect(page.getByRole("heading", { name: "Circuit schedule" })).toBeVisible();
    await expect(page.locator(".circuit-table tbody tr")).toHaveCount(8);
    await expect(page.getByRole("button", { name: "New circuit" })).toHaveCount(0);

    // Findings can be located but not decided by a technician.
    await page
      .getByRole("navigation", { name: "Workspace sections" })
      .getByRole("button", { name: "Findings register" })
      .click();
    await expect(page.getByRole("heading", { name: "Findings register" })).toBeVisible();
    const decisions = page.locator(".findings-table .finding-actions");
    await expect(decisions.first().getByRole("button", { name: "Acknowledge" })).toHaveCount(0);
    await expect(decisions.first().getByRole("button", { name: "Accept risk" })).toHaveCount(0);
    await expect(decisions.first().getByRole("button", { name: "Resolve" })).toHaveCount(0);
    await expect(decisions.first().getByRole("button", { name: "Locate" })).toHaveCount(1);
  });

  test("cannot create projects from the project index", async ({ page }) => {
    await page.goto("/projects");
    const create = page.getByRole("button", { name: "New project" }).first();
    await expect(create).toBeDisabled();
  });
});
