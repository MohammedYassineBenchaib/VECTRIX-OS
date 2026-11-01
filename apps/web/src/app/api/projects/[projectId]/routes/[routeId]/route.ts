import {
  apiRoute,
  assertSameOrigin,
  json,
  readJson,
  requireProjectAccess,
} from "@/server/api";
import { updateRoute } from "@/server/mutations";
import { refreshValidations } from "@/server/design";
import { updateRouteSchema } from "@/server/schemas";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; routeId: string }> },
) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    const { projectId, routeId } = await params;
    const access = await requireProjectAccess(projectId, "design:write");
    const input = await readJson(request, updateRouteSchema);
    const route = await updateRoute(
      { projectId, orgId: access.project.orgId, actorId: access.user.id },
      routeId,
      input,
    );
    const validation = await refreshValidations(projectId, access.user.id);
    return json({ route, validation: validation.summary });
  });
}
