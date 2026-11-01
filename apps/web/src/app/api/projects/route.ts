import {
  apiRoute,
  assertSameOrigin,
  json,
  readJson,
  requireApiCapability,
  requireApiUser,
} from "@/server/api";
import { createProjectSchema } from "@/server/schemas";
import { createProject, listProjects } from "@/server/projects";

export async function GET() {
  return apiRoute(async () => {
    const user = await requireApiUser();
    const projects = await listProjects(user.orgId);
    return json({ projects });
  });
}

export async function POST(request: Request) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser();
    requireApiCapability(user, "project:write");
    const input = await readJson(request, createProjectSchema);
    const result = await createProject(user, input);
    return json(result, { status: 201 });
  });
}
