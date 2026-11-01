import {
  apiError,
  apiRoute,
  assertSameOrigin,
  json,
  readJson,
  requireProjectAccess,
} from "@/server/api";
import { loadCableSelection } from "@/server/design";
import { cableSelectionSchema } from "@/server/schemas";
import { UnsupportedInstallationError } from "@vectrix/electrical";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    const { projectId } = await params;
    await requireProjectAccess(projectId, "estimate:read");
    const input = await readJson(request, cableSelectionSchema);
    try {
      const result = await loadCableSelection(projectId, input.circuitId, {
        ambientTempC: input.ambientTempC,
        groupedCircuits: input.groupedCircuits,
        thermalInsulationFactor: input.thermalInsulationFactor,
      });
      if (!result) {
        apiError(404, "CABLE_SELECTION_UNAVAILABLE", "Circuit or cable data not found.");
      }
      return json({ selection: result });
    } catch (error) {
      if (error instanceof UnsupportedInstallationError) {
        apiError(422, "UNSUPPORTED_INSTALLATION", error.message);
      }
      throw error;
    }
  });
}
