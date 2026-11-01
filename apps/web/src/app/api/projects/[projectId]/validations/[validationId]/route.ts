import {
  apiError,
  apiRoute,
  assertSameOrigin,
  json,
  readJson,
  requireProjectAccess,
} from "@/server/api";
import { resolveValidation } from "@/server/mutations";
import { serializeValidation } from "@/server/serialize";
import { updateValidationSchema } from "@/server/schemas";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; validationId: string }> },
) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    const { projectId, validationId } = await params;
    const access = await requireProjectAccess(projectId, "validation:resolve");
    const input = await readJson(request, updateValidationSchema);
    const row = await resolveValidation(
      { projectId, orgId: access.project.orgId, actorId: access.user.id },
      validationId,
      input.status,
    );
    if (!row) apiError(404, "VALIDATION_NOT_FOUND", "Validation result not found.");
    return json({ validation: serializeValidation(row) });
  });
}
