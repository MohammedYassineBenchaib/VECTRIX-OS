import { expect, test, type Page } from "@playwright/test";

const PROJECT_CODE = "VX-E2E-001";
const PROJECT_NAME = "E2E refurbishment";

async function canvasBox(page: Page) {
  const canvas = page.locator(".plan-svg-wrap");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Plan canvas has no bounding box");
  return { canvas, box };
}

function point(box: { x: number; y: number; width: number; height: number }, fx: number, fy: number) {
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

test.describe("design workflow", () => {
  test("creates a project, draws geometry, places a device, adds a circuit and a route", async ({
    page,
    request,
  }) => {
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await page.getByRole("button", { name: "New project" }).click();

    const dialog = page.getByRole("dialog", { name: "New electrical project" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Project name").fill(PROJECT_NAME);
    await dialog.getByLabel("Project code").fill(PROJECT_CODE);
    await dialog.getByLabel("Client").fill("E2E Client");
    await dialog.getByLabel("Sheet width (mm)").fill("8000");
    await dialog.getByLabel("Sheet height (mm)").fill("6000");
    await dialog.getByRole("button", { name: "Create project" }).click();

    await expect(page).toHaveURL(/\/projects\/prj_[a-z0-9-]+$/);
    const projectId = page.url().split("/").pop()!;
    await expect(page.locator(".plan-sheet-head")).toContainText("0 rooms · 0 devices · 0 routes");

    const { canvas, box } = await canvasBox(page);

    // Draw a room polygon with four corners and close it with Enter.
    await page.getByRole("button", { name: /^Room/ }).click();
    for (const [fx, fy] of [
      [0.3, 0.3],
      [0.7, 0.3],
      [0.7, 0.7],
      [0.3, 0.7],
    ] as const) {
      const target = point(box, fx, fy);
      await page.mouse.click(target.x, target.y);
    }
    await page.keyboard.press("Enter");

    const roomDialog = page.getByRole("dialog", { name: "Name this room" });
    await expect(roomDialog).toBeVisible();
    await roomDialog.getByLabel("Room name").fill("E2E Living");
    await roomDialog.getByLabel("Occupancy").selectOption("dry");
    await roomDialog.getByRole("button", { name: "Create room" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Room recorded" })).toBeVisible();
    await expect(page.locator(".plan-sheet-head")).toContainText("1 rooms · 0 devices · 0 routes");

    // Draw a wall.
    await page.getByRole("button", { name: /^Wall/ }).click();
    const wallStart = point(box, 0.2, 0.2);
    const wallEnd = point(box, 0.8, 0.2);
    await page.mouse.click(wallStart.x, wallStart.y);
    await page.mouse.click(wallEnd.x, wallEnd.y);
    await expect(page.getByRole("status").filter({ hasText: "Wall recorded" })).toBeVisible();

    // Place a catalogue device inside the room.
    await page.getByRole("tab", { name: "Library" }).click();
    await page.getByLabel("Search equipment library").fill("IP20");
    await page
      .getByRole("button", { name: /Schuko socket outlet 16 A, 2P\+E, IP20/ })
      .click();
    const placeAt = point(box, 0.5, 0.5);
    await page.mouse.click(placeAt.x, placeAt.y);
    await expect(page.getByRole("status").filter({ hasText: "Device placed" })).toBeVisible();
    await expect(page.locator(".plan-sheet-head")).toContainText("1 rooms · 1 devices · 0 routes");

    // Place a second device so the route can connect two declared endpoints.
    await page
      .getByRole("button", { name: /Schuko socket outlet 16 A, 2P\+E, IP20/ })
      .click();
    const secondAt = point(box, 0.62, 0.5);
    await page.mouse.click(secondAt.x, secondAt.y);
    await expect(page.locator(".plan-sheet-head")).toContainText("1 rooms · 2 devices · 0 routes");

    // Create a circuit from the plan toolbar.
    await page.getByTitle("Create a circuit").click();
    const circuitDialog = page.getByRole("dialog", { name: /New circuit|Create a circuit/i });
    await expect(circuitDialog).toBeVisible();
    await circuitDialog.getByLabel("Circuit name").fill("E2E sockets");
    await circuitDialog.getByLabel("Circuit type").selectOption("sockets");
    await circuitDialog.getByRole("button", { name: /Create circuit/i }).click();
    await expect(page.getByRole("status").filter({ hasText: "Circuit created" })).toBeVisible();

    // Circuit creation opens the schedule; return to the plan to draw the route.
    await page.getByRole("button", { name: "Plan drawing" }).click();
    await expect(page.locator(".plan-svg")).toBeVisible();

    // Draw an orthogonal route between the two placed devices.
    await page.getByRole("button", { name: /^Route/ }).click();
    const routeStart = point(box, 0.5, 0.5);
    const routeEnd = point(box, 0.62, 0.5);
    await page.mouse.click(routeStart.x, routeStart.y);
    await page.mouse.click(routeEnd.x, routeEnd.y);
    await page.getByRole("button", { name: "Finish route" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Route proposed" })).toBeVisible();
    await expect(page.locator(".plan-sheet-head")).toContainText("1 rooms · 2 devices · 1 routes");

    // Everything must survive a reload because it was persisted by the API.
    await page.reload();
    await expect(page.locator(".plan-sheet-head")).toContainText("1 rooms · 2 devices · 1 routes");
    await page
      .getByRole("navigation", { name: "Workspace sections" })
      .getByRole("button", { name: "Circuit schedule" })
      .click();
    await expect(page.locator(".circuit-table tbody tr")).toHaveCount(1);

    // Confirm through the API that the persisted model matches the UI.
    const workspace = await request.get(`/api/projects/${projectId}/workspace`);
    expect(workspace.status()).toBe(200);
    const body = await workspace.json();
    expect(body.workspace.rooms).toHaveLength(1);
    expect(body.workspace.walls).toHaveLength(1);
    expect(body.workspace.equipment).toHaveLength(2);
    expect(body.workspace.circuits).toHaveLength(1);
    expect(body.workspace.routes).toHaveLength(1);
  });

  test("creates a circuit from the schedule in an isolated project", async ({ page }) => {
    const created = await page.request.post("/api/projects", {
      data: { name: "Circuit test", code: "VX-E2E-CKT", widthMm: 6000, heightMm: 4000 },
    });
    expect(created.status()).toBe(201);
    const projectId = (await created.json()).project.id as string;

    await page.goto(`/projects/${projectId}`);
    await page
      .getByRole("navigation", { name: "Workspace sections" })
      .getByRole("button", { name: "Circuit schedule" })
      .click();
    await expect(page.getByText("No circuits yet")).toBeVisible();
    await expect(page.locator(".circuit-table .circuit-name")).toHaveCount(0);
    await page.getByRole("button", { name: "New circuit" }).click();

    const dialog = page.getByRole("dialog", { name: /New circuit|Create a circuit/i });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Circuit name").fill("E2E lighting");
    await dialog.getByLabel("Circuit type").selectOption("lighting");
    await dialog.getByRole("button", { name: /Create circuit/i }).click();

    await expect(page.getByRole("status").filter({ hasText: "Circuit created" })).toBeVisible();
    await expect(page.locator(".circuit-table tbody tr")).toHaveCount(1);
  });
});
