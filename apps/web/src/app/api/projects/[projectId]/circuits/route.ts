import {
  apiRoute,
  assertSameOrigin,
  json,
  readJson,
  requireProjectAccess,
} from "@/server/api";
import { createCircuit } from "@/server/mutations";
import { refreshValidations } from "@/server/design";
import { createCircuitSchema } from "@/server/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    const { projectId } = await params;
    const access = await requireProjectAccess(projectId, "design:write");
    const input = await readJson(request, createCircuitSchema);
    const circuit = await createCircuit(
      { projectId, orgId: access.project.orgId, actorId: access.user.id },
      input,
    );
    const validation = await refreshValidations(projectId, access.user.id);
    return json({ circuit, validation: validation.summary }, { status: 201 });
  });
}
