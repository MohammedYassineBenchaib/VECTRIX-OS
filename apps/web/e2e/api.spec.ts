import { expect, test } from "@playwright/test";

const DEMO_ID = "prj_demo-t2";

test.describe("API contract", () => {
  test("lists projects scoped to the session organisation", async ({ request }) => {
    const response = await request.get("/api/projects");
    expect(response.status()).toBe(200);
    const body = await response.json();
    const codes = body.projects.map((project: { code: string }) => project.code);
    expect(codes).toContain("VX-DEMO-001");
    expect(codes).toContain("VX-DEMO-002");
  });

  test("rejects an invalid project payload with field details", async ({ request }) => {
    const response = await request.post("/api/projects", {
      data: { name: "", code: "lower case", widthMm: 10 },
    });
    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(body.error.details.length).toBeGreaterThan(0);
  });

  test("refuses a duplicate project code with 409", async ({ request }) => {
    const response = await request.post("/api/projects", {
      data: { name: "Duplicate", code: "VX-DEMO-001" },
    });
    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe("PROJECT_CODE_TAKEN");
  });

  test("returns 404 for projects outside the organisation", async ({ request }) => {
    const response = await request.get("/api/projects/prj_does-not-exist/workspace");
    expect(response.status()).toBe(404);
    expect((await response.json()).error.code).toBe("PROJECT_NOT_FOUND");
  });

  test("rejects an unknown level with 404", async ({ request }) => {
    const response = await request.get(`/api/projects/${DEMO_ID}/workspace?levelId=lvl_missing`);
    expect(response.status()).toBe(404);
    expect((await response.json()).error.code).toBe("WORKSPACE_NOT_FOUND");
  });

  test("serves advisory cable selection for a supported PVC circuit", async ({ request }) => {
    const workspace = await (await request.get(`/api/projects/${DEMO_ID}/workspace`)).json();
    const circuit = workspace.workspace.circuits.find(
      (item: { cableTypeKey: string }) => item.cableTypeKey === "h07v-u",
    );
    expect(circuit).toBeTruthy();

    const response = await request.post(`/api/projects/${DEMO_ID}/cable-selection`, {
      data: { circuitId: circuit.id },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.selection.methodVersion).toBe("cable-2026.10");
    expect(body.selection.selectedSectionMm2).toBeGreaterThan(0);
    expect(body.selection.candidates.length).toBeGreaterThan(1);
    expect(body.selection.assumptions.join(" ")).toContain("PVC");
    expect(body.selection.assumptions.join(" ")).toContain("licensed standard");
  });

  test("rejects impossible cable-selection conditions with 422", async ({ request }) => {
    const response = await request.post(`/api/projects/${DEMO_ID}/cable-selection`, {
      data: { circuitId: "ckt_missing", ambientTempC: 90 },
    });
    expect(response.status()).toBe(422);
    expect((await response.json()).error.code).toBe("VALIDATION_FAILED");
  });

  test("acknowledges and reopens a finding while recording the decision", async ({ request }) => {
    const workspace = await (await request.get(`/api/projects/${DEMO_ID}/workspace`)).json();
    const finding = workspace.workspace.validations.find(
      (row: { status: string }) => row.status === "open",
    );
    expect(finding).toBeTruthy();

    const acknowledged = await request.patch(
      `/api/projects/${DEMO_ID}/validations/${finding.id}`,
      { data: { status: "acknowledged" } },
    );
    expect(acknowledged.status()).toBe(200);
    const acknowledgedBody = await acknowledged.json();
    expect(acknowledgedBody.validation.status).toBe("acknowledged");
    expect(acknowledgedBody.validation.decidedAt).toBeTruthy();
    expect(acknowledgedBody.validation.decidedBy).toBeTruthy();

    const reopened = await request.patch(`/api/projects/${DEMO_ID}/validations/${finding.id}`, {
      data: { status: "open" },
    });
    expect(reopened.status()).toBe(200);
    const reopenedBody = await reopened.json();
    expect(reopenedBody.validation.status).toBe("open");
    expect(reopenedBody.validation.decidedAt).toBeNull();
    expect(reopenedBody.validation.decidedBy).toBeNull();
  });

  test("rejects an unknown validation decision", async ({ request }) => {
    const workspace = await (await request.get(`/api/projects/${DEMO_ID}/workspace`)).json();
    const finding = workspace.workspace.validations[0];
    const response = await request.patch(`/api/projects/${DEMO_ID}/validations/${finding.id}`, {
      data: { status: "approved" },
    });
    expect(response.status()).toBe(422);
  });

  test("returns JSON and CSV take-off representations of the same model", async ({ request }) => {
    const json = await (await request.get(`/api/projects/${DEMO_ID}/takeoff`)).json();
    const csvResponse = await request.get(`/api/projects/${DEMO_ID}/takeoff?format=csv`);
    expect(csvResponse.status()).toBe(200);
    expect(csvResponse.headers()["content-type"]).toContain("text/csv");
    expect(csvResponse.headers()["content-disposition"]).toContain(
      'filename="vectrix-takeoff-VX-DEMO-001.csv"',
    );
    const csv = await csvResponse.text();
    expect(json.takeoff.lines).toHaveLength(14);
    expect(json.takeoff.methodVersion).toBeTruthy();
    expect(csv).toContain(`Method,${json.takeoff.methodVersion}`);
    // Every JSON line must appear as a CSV row basis, so export cannot silently drift.
    for (const line of json.takeoff.lines) {
      expect(csv).toContain(line.description);
    }
  });
});
