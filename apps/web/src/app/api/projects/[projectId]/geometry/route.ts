import {
  apiRoute,
  assertSameOrigin,
  json,
  readJson,
  requireProjectAccess,
} from "@/server/api";
import { createRoom, createWall } from "@/server/mutations";
import { refreshValidations } from "@/server/design";
import { createRoomSchema, createWallSchema } from "@/server/schemas";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    const { projectId } = await params;
    const access = await requireProjectAccess(projectId, "design:write");
    const body = (await request.clone().json()) as {
      entityType?: string;
      kind?: string;
      start?: unknown;
      polygon?: unknown;
    };
    const ctx = { projectId, orgId: access.project.orgId, actorId: access.user.id };

    // `kind` is already the wall material family, so geometry uses its own
    // discriminator. Requests that predate `entityType` fall back to shape:
    // a wall has `start`, a room has `polygon`.
    const isWall =
      body.entityType === "wall" ||
      (body.entityType === undefined && body.start !== undefined && body.polygon === undefined);

    if (isWall) {
      const input = await readJson(request, createWallSchema);
      const wall = await createWall(ctx, input);
      const validation = await refreshValidations(projectId, access.user.id);
      return json({ wall, validation: validation.summary }, { status: 201 });
    }

    const input = await readJson(request, createRoomSchema);
    const room = await createRoom(ctx, input);
    const validation = await refreshValidations(projectId, access.user.id);
    return json({ room, validation: validation.summary }, { status: 201 });
  });
}
