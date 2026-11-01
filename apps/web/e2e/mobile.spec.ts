import { expect, test } from "@playwright/test";

const DEMO = "/projects/prj_demo-t2";

test.describe("mobile workspace @mobile", () => {
  test("uses the compact tab bar instead of the desktop rail", async ({ page }) => {
    await page.goto(DEMO);
    await expect(page.locator(".mobile-view-bar")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workspace sections" })).toBeHidden();
    await expect(page.getByRole("tablist").first()).toBeVisible();

    await page.getByRole("tab", { name: "Circuits" }).click();
    await expect(page.getByRole("heading", { name: "Circuit schedule" })).toBeVisible();
    await expect(page.locator(".circuit-table tbody tr")).toHaveCount(8);
  });

  test("keeps page-level horizontal overflow at zero", async ({ page }) => {
    await page.goto(DEMO);
    for (const tab of ["Circuits", "Take-off", "Findings"]) {
      await page.getByRole("tab", { name: tab }).click();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${tab} must not widen the page`).toBeLessThanOrEqual(1);
    }
  });

  test("opens and closes the inspector drawer", async ({ page }) => {
    await page.goto(DEMO);
    const inspector = page.locator('aside[aria-label="Inspector"]');
    await expect(inspector).toHaveAttribute("data-open", "false");

    await page.locator(".mobile-view-bar").getByLabel("Toggle inspector").click();
    await expect(inspector).toHaveAttribute("data-open", "true");
    await expect(page.getByLabel("Close the side panel")).toBeVisible();
    await inspector.getByLabel("Close inspector").click();
    await expect(inspector).toHaveAttribute("data-open", "false");
  });

  test("opens the model drawer without trapping the page", async ({ page }) => {
    await page.goto(DEMO);
    const utility = page.locator('aside[aria-label="Model and equipment library"]');
    await expect(utility).toHaveAttribute("data-open", "false");

    await page.locator(".mobile-view-bar").getByLabel("Toggle model panel").click();
    await expect(utility).toHaveAttribute("data-open", "true");
    await expect(utility.getByRole("tab", { name: "Model" })).toBeVisible();

    await utility.getByLabel("Close model and library drawer").click();
    await expect(utility).toHaveAttribute("data-open", "false");
  });

  test("fits the drawing sheet inside the mobile viewport", async ({ page }) => {
    await page.goto(DEMO);
    const svg = page.locator(".plan-svg");
    await expect(svg).toBeVisible();
    const box = await svg.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThanOrEqual(390);
    expect(box!.height).toBeGreaterThan(100);
  });
});
