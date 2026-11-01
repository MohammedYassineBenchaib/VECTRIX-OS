import { test as setup, expect } from "@playwright/test";

const ENGINEER = { email: "engineer@vectrix.pt", password: "VectrixDemo!2026" };
const TECHNICIAN = { email: "tech@vectrix.pt", password: "VectrixDemo!2026" };

const engineerState = "e2e/.auth/engineer.json";
const technicianState = "e2e/.auth/technician.json";

setup("authenticate the engineer and technician", async ({ page, context }) => {
  // `page.request` shares the browser context's cookie jar, unlike the standalone
  // `request` fixture. The saved storage state therefore matches the live page.
  const engineer = await page.request.post("/api/auth/login", { data: ENGINEER });
  expect(engineer.status()).toBe(200);
  await context.storageState({ path: engineerState });

  const technician = await page.request.post("/api/auth/login", { data: TECHNICIAN });
  expect(technician.status()).toBe(200);
  await context.storageState({ path: technicianState });

  await page.goto("/");
  await expect(page).toHaveURL(/\/projects\//);
});
