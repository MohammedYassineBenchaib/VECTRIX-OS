import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const DEMO = "/projects/prj_demo-t2";

test.describe("workspace reads and registers", () => {
  test("opens the populated demo project with matching totals", async ({ page }) => {
    await page.goto(DEMO);
    await expect(page.locator(".project-code")).toHaveText("VX-DEMO-001");
    await expect(page.locator(".plan-sheet-head")).toContainText("8 rooms · 39 devices · 8 routes");

    const totals = page.getByLabel("Project totals");
    await expect(totals.locator(".cmd-bar-stat").nth(0).locator(".value")).toHaveText("0");
    await expect(totals.locator(".cmd-bar-stat").nth(1).locator(".value")).toHaveText("0");
    await expect(totals.locator(".cmd-bar-stat").nth(2).locator(".value")).toHaveText("39");
  });

  test("renders the eight-circuit schedule from the model", async ({ page }) => {
    await page.goto(DEMO);
    await page
      .getByRole("navigation", { name: "Workspace sections" })
      .getByRole("button", { name: "Circuit schedule" })
      .click();
    await expect(page.getByRole("heading", { name: "Circuit schedule" })).toBeVisible();
    const rows = page.locator(".circuit-table tbody tr");
    await expect(rows).toHaveCount(8);
  });

  test("shows fourteen take-off lines and downloads a matching CSV", async ({ page }) => {
    await page.goto(DEMO);
    await page
      .getByRole("navigation", { name: "Workspace sections" })
      .getByRole("button", { name: "Material take-off" })
      .click();
    await expect(page.getByRole("heading", { name: "Material take-off" })).toBeVisible();
    await expect(page.locator(".takeoff-register tbody tr")).toHaveCount(14);

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("vectrix-takeoff-VX-DEMO-001.csv");

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const csv = await readFile(filePath!, "utf8");
    const lines = csv.trim().split(/\r?\n/);
    expect(lines[0]).toBe("Project,Apartamento T2 — Rua das Flores");
    expect(csv).toContain("Description,Category,Unit,Quantity,Basis,Source,Note");
    // Project + method, column header, 14 items, then the Assumptions heading and 4 assumptions.
    expect(lines.filter((line) => line.length > 0)).toHaveLength(22);
    expect(csv).toContain("Assumptions");
    await expect(page.getByRole("status").filter({ hasText: "Take-off export started" })).toBeVisible();
  });

  test("lists the two baseline info findings and keeps them after validation", async ({ page }) => {
    await page.goto(DEMO);
    await page
      .getByRole("navigation", { name: "Workspace sections" })
      .getByRole("button", { name: "Findings register" })
      .click();
    await expect(page.getByRole("heading", { name: "Findings register" })).toBeVisible();
    const rows = page.locator(".findings-table tbody tr");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("VX-EL-009");
    await expect(rows.nth(1)).toContainText("VX-EL-025");

    await page.getByRole("button", { name: "Validate", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Validation refreshed" })).toContainText(
      "0 error(s) · 0 warning(s) · 2 info(s)",
    );
    await expect(page.locator(".findings-table tbody tr")).toHaveCount(2);
  });

  test("isolates a circuit and clears the isolation", async ({ page }) => {
    await page.goto(DEMO);
    const busbar = page.getByRole("group", { name: "Circuit directory" });
    await expect(busbar).toBeVisible();
    await busbar.locator(".breaker").nth(1).click();
    await expect(page.locator(".isolate-chip")).toBeVisible();
    await busbar.getByRole("button", { name: /All circuits/ }).click();
    await expect(page.locator(".isolate-chip")).toHaveCount(0);
  });
});
