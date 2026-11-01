import {
  apiRoute,
  assertSameOrigin,
  json,
  readJson,
  requireProjectAccess,
} from "@/server/api";
import { updateProjectSchema } from "@/server/schemas";
import { updateProject } from "@/server/projects";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    const { projectId } = await params;
    const access = await requireProjectAccess(projectId, "project:write");
    const input = await readJson(request, updateProjectSchema);
    const project = await updateProject(projectId, access.user, input);
    return json({ project });
  });
}
