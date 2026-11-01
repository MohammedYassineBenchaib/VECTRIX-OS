import { NextResponse } from "next/server";
import { apiError, apiRoute, json, requireProjectAccess } from "@/server/api";
import { loadWorkspace } from "@/server/design";
import { takeoffToCsv } from "@vectrix/electrical";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return apiRoute(async () => {
    const { projectId } = await params;
    const access = await requireProjectAccess(projectId, "estimate:read");
    const format = new URL(request.url).searchParams.get("format") ?? "json";
    const payload = await loadWorkspace(projectId);
    if (!payload) apiError(404, "PROJECT_NOT_FOUND", "Project not found.");

    if (format === "csv") {
      const csv = takeoffToCsv(payload.takeoff, payload.workspace.project.name);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="vectrix-takeoff-${access.project.code}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return json({
      project: {
        id: payload.workspace.project.id,
        name: payload.workspace.project.name,
        code: payload.workspace.project.code,
      },
      takeoff: payload.takeoff,
      advisory: payload.advisory,
    });
  });
}
