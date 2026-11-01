import type { Metadata } from "next";
import { requireSessionUser } from "@/server/auth";
import { listProjects } from "@/server/projects";
import { ProjectsView } from "@/components/projects-view";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireSessionUser();
  const projects = await listProjects(user.orgId);

  return (
    <ProjectsView
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgName: user.orgName,
      }}
      projects={projects.map((project) => ({
        ...project,
        updatedAt: project.updatedAt.toISOString(),
        createdAt: project.createdAt.toISOString(),
      }))}
    />
  );
}
