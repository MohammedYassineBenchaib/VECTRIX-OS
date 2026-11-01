import { expect, test } from "@playwright/test";

async function unnamedButtons(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    return buttons
      .filter((button) => {
        const style = window.getComputedStyle(button);
        const visible =
          button.getClientRects().length > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none";
        if (!visible) return false;
        const name =
          button.getAttribute("aria-label") ??
          button.getAttribute("title") ??
          button.innerText.trim();
        return !name;
      })
      .map((button) => button.outerHTML.slice(0, 120));
  });
}

test.describe("accessibility and semantics", () => {
  test("declares the page language and a single project heading", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Projects" })).toHaveCount(1);
  });

  test("gives every visible button an accessible name", async ({ page }) => {
    await page.goto("/projects");
    expect(await unnamedButtons(page)).toEqual([]);
    await page.goto("/projects/prj_demo-t2");
    await expect(page.locator(".plan-svg")).toBeVisible();
    expect(await unnamedButtons(page)).toEqual([]);
  });

  test("labels every control in the new-project dialog and focuses the first field", async ({
    page,
  }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).click();
    const dialog = page.getByRole("dialog", { name: "New electrical project" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Project name")).toBeFocused();
    await expect(dialog.getByLabel("Project code")).toBeVisible();
    await expect(dialog.getByLabel("Sheet width (mm)")).toBeVisible();
    await expect(dialog.getByLabel("Sheet height (mm)")).toBeVisible();
    await expect(dialog.getByRole("radio", { name: /Empty sheet/ })).toBeChecked();
  });

  test("exposes table headers and keyboard-focusable schedule rows", async ({ page }) => {
    await page.goto("/projects/prj_demo-t2");
    await page
      .getByRole("navigation", { name: "Workspace sections" })
      .getByRole("button", { name: "Circuit schedule" })
      .click();
    const table = page.locator(".circuit-table");
    const columnHeaders = table.locator("thead th[scope='col']");
    expect(await columnHeaders.count()).toBeGreaterThanOrEqual(9);
    await expect(table.locator("tbody tr").first()).toHaveAttribute("tabindex", "0");
  });

  test("has no positive tabindex values", async ({ page }) => {
    await page.goto("/projects/prj_demo-t2");
    const positive = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("[tabindex]"))
        .map((element) => Number(element.getAttribute("tabindex")))
        .filter((value) => value > 0),
    );
    expect(positive).toEqual([]);
  });

  test("opens the command palette from the keyboard and closes it with Escape", async ({ page }) => {
    await page.goto("/projects/prj_demo-t2");
    await expect(page.locator(".plan-sheet-head")).toContainText("39 devices");
    await page.keyboard.press("Control+k");
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await expect(palette.getByLabel("Command palette search")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });
});
