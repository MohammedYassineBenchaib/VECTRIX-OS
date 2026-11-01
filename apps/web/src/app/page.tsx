import { redirect } from "next/navigation";
import { requireSessionUser } from "@/server/auth";
import { listProjects } from "@/server/projects";

export default async function HomePage() {
  const user = await requireSessionUser();
  const projects = await listProjects(user.orgId);
  if (projects.length === 0) redirect("/projects");
  const demo = projects.find((project) => project.code === "VX-DEMO-001") ?? projects[0]!;
  redirect(`/projects/${demo.id}`);
}
