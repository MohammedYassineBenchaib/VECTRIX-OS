import {
  apiRoute,
  assertSameOrigin,
  json,
  readJson,
  requireProjectAccess,
} from "@/server/api";
import { updateCircuit } from "@/server/mutations";
import { refreshValidations } from "@/server/design";
import { updateCircuitSchema } from "@/server/schemas";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; circuitId: string }> },
) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    const { projectId, circuitId } = await params;
    const access = await requireProjectAccess(projectId, "design:write");
    const input = await readJson(request, updateCircuitSchema);
    const circuit = await updateCircuit(
      { projectId, orgId: access.project.orgId, actorId: access.user.id },
      circuitId,
      input,
    );
    const validation = await refreshValidations(projectId, access.user.id);
    return json({ circuit, validation: validation.summary });
  });
}
