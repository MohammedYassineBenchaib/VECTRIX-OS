import { NextResponse } from "next/server";
import { apiRoute, json, rateLimit, clientKey, requireApiUser, assertSameOrigin } from "@/server/api";
import { fetchPvgisYield, PvgisError } from "@vectrix/solar-yield";
import { solarYieldSchema } from "@/server/schemas";

export async function POST(request: Request) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    await requireApiUser();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, { status: 400 });
    }

    const parsed = solarYieldSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: { code: "VALIDATION_FAILED", message: "Request data is invalid.", details: parsed.error.issues } }, { status: 422 });
    }

    // Basic rate limiting
    try {
      rateLimit(clientKey(request, "solar-yield"), 20, 60000);
    } catch (e) {
      // rateLimit throws ApiError
      throw e;
    }

    try {
      const result = await fetchPvgisYield(
        {
          location: { latitude: parsed.data.latitude, longitude: parsed.data.longitude },
          system: {
            peakPowerKw: parsed.data.peakPowerKw,
            systemLossPercent: parsed.data.systemLossPercent,
            angle: parsed.data.angle,
            aspect: parsed.data.aspect,
          },
        },
        { rateLimitKey: clientKey(request, "solar-yield"), includeHourly: parsed.data.includeHourly },
      );
      return json(result);
    } catch (error) {
      if (error instanceof PvgisError) {
        return json({ error: { code: "PVGIS_ERROR", message: error.message } }, { status: 502 });
      }
      throw error;
    }
  });
}
