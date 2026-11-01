import {
  apiRoute,
  assertSameOrigin,
  json,
  readJson,
  requireProjectAccess,
} from "@/server/api";
import { createEquipment } from "@/server/mutations";
import { refreshValidations } from "@/server/design";
import { createEquipmentSchema } from "@/server/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    const { projectId } = await params;
    const access = await requireProjectAccess(projectId, "design:write");
    const input = await readJson(request, createEquipmentSchema);
    const result = await createEquipment(
      { projectId, orgId: access.project.orgId, actorId: access.user.id },
      input,
    );
    const validation = await refreshValidations(projectId, access.user.id);
    return json({ ...result, validation: validation.summary }, { status: 201 });
  });
}
