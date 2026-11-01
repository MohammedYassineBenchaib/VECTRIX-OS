import {
  apiError,
  apiRoute,
  json,
  requireProjectAccess,
} from "@/server/api";
import { loadWorkspace } from "@/server/design";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return apiRoute(async () => {
    const { projectId } = await params;
    await requireProjectAccess(projectId, "project:read");
    const levelId = new URL(request.url).searchParams.get("levelId") ?? undefined;
    const payload = await loadWorkspace(projectId, levelId);
    if (!payload) apiError(404, "WORKSPACE_NOT_FOUND", "Project or level not found.");
    return json(payload);
  });
}
