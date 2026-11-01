import {
  apiRoute,
  assertSameOrigin,
  json,
  readJson,
  requireProjectAccess,
} from "@/server/api";
import { setRouteStatus } from "@/server/mutations";
import { refreshValidations } from "@/server/design";
import { routeStatusSchema } from "@/server/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; routeId: string }> },
) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    const { projectId, routeId } = await params;
    const access = await requireProjectAccess(projectId, "design:write");
    const input = await readJson(request, routeStatusSchema);
    const route = await setRouteStatus(
      { projectId, orgId: access.project.orgId, actorId: access.user.id },
      routeId,
      input.status,
    );
    const validation = await refreshValidations(projectId, access.user.id);
    return json({ route, validation: validation.summary });
  });
}
