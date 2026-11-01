import {
  apiError,
  apiRoute,
  assertSameOrigin,
  json,
  readJson,
  requireProjectAccess,
} from "@/server/api";
import { deleteEquipment, updateEquipment } from "@/server/mutations";
import { refreshValidations } from "@/server/design";
import { updateEquipmentSchema } from "@/server/schemas";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; equipmentId: string }> },
) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    const { projectId, equipmentId } = await params;
    const access = await requireProjectAccess(projectId, "design:write");
    const input = await readJson(request, updateEquipmentSchema);
    const equipment = await updateEquipment(
      { projectId, orgId: access.project.orgId, actorId: access.user.id },
      equipmentId,
      input,
    );
    const validation = await refreshValidations(projectId, access.user.id);
    return json({ equipment, validation: validation.summary });
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string; equipmentId: string }> },
) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    const { projectId, equipmentId } = await params;
    const access = await requireProjectAccess(projectId, "design:write");
    await deleteEquipment(
      { projectId, orgId: access.project.orgId, actorId: access.user.id },
      equipmentId,
    );
    const validation = await refreshValidations(projectId, access.user.id);
    return json({ ok: true, validation: validation.summary });
  });
}
