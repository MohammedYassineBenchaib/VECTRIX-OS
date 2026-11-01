import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSessionUser } from "@/server/auth";
import { loadWorkspace } from "@/server/design";
import { listProjects } from "@/server/projects";
import { WorkspaceView } from "@/components/workspace/workspace-view";

export const metadata: Metadata = { title: "Workspace" };

export default async function ProjectWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ level?: string }>;
}) {
  const { projectId } = await params;
  const { level } = await searchParams;
  const user = await requireSessionUser();
  const [payload, projects] = await Promise.all([
    loadWorkspace(projectId, level),
    listProjects(user.orgId),
  ]);
  if (!payload) notFound();
  if (!projects.some((project) => project.id === payload.workspace.project.id)) notFound();

  return (
    <WorkspaceView
      initial={JSON.parse(JSON.stringify(payload)) as typeof payload}
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgName: user.orgName,
      }}
      projects={projects.map((project) => ({
        id: project.id,
        name: project.name,
        code: project.code,
      }))}
    />
  );
}
