import {
  apiRoute,
  assertSameOrigin,
  json,
  requireProjectAccess,
} from "@/server/api";
import { refreshValidations } from "@/server/design";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    const { projectId } = await params;
    const access = await requireProjectAccess(projectId, "validation:run");
    const result = await refreshValidations(projectId, access.user.id);
    return json({
      summary: result.summary,
      validation: result.summary,
      validations: result.validations,
    });
  });
}
