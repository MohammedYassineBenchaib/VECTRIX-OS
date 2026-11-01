import { expect, test } from "@playwright/test";

test.describe("authentication @anonymous", () => {
  test("redirects an anonymous visitor to the sign-in page", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in to the workspace" })).toBeVisible();
    await expect(page.getByLabel("Work email")).toHaveValue("engineer@vectrix.pt");
  });

  test("rejects a wrong password without revealing which field failed", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Enter workspace" }).click();
    const alert = page.locator(".login-error");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Email or password is incorrect.");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("signs in, stores an httpOnly session cookie and lands on the demo workspace", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Enter workspace" }).click();
    await expect(page).toHaveURL(/\/projects\/prj_demo-t2$/);
    await expect(page.locator(".project-code")).toHaveText("VX-DEMO-001");

    const cookies = await context.cookies();
    const session = cookies.find((cookie) => cookie.name === "vectrix_session");
    expect(session, "session cookie must be set").toBeTruthy();
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Lax");
    expect(session?.path).toBe("/");
  });

  test("protects the API and the same-origin guard without a session", async ({ request }) => {
    const unauthenticated = await request.get("/api/projects");
    expect(unauthenticated.status()).toBe(401);
    expect((await unauthenticated.json()).error.code).toBe("UNAUTHENTICATED");

    const solarYieldUnauth = await request.post("/api/solar-yield", {
      data: { latitude: 40, longitude: 0, peakPowerKw: 1, systemLossPercent: 14 },
    });
    expect(solarYieldUnauth.status()).toBe(401);
    expect((await solarYieldUnauth.json()).error.code).toBe("UNAUTHENTICATED");

    const invalidLogin = await request.post("/api/auth/login", {
      data: { email: "engineer@vectrix.pt", password: "wrong" },
    });
    expect(invalidLogin.status()).toBe(401);
    expect((await invalidLogin.json()).error.code).toBe("INVALID_CREDENTIALS");

    const crossOrigin = await request.post("/api/projects", {
      headers: { origin: "https://attacker.example" },
      data: { name: "Forged", code: "VX-FORGED" },
    });
    expect(crossOrigin.status()).toBe(403);
    expect((await crossOrigin.json()).error.code).toBe("BAD_ORIGIN");
  });
});
