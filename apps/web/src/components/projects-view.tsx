"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  FolderOpen,
  Plus,
  Search,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { AccountMenu } from "@/components/account-menu";
import { can } from "@vectrix/core";
import { formatNumber, formatVA, relativeDate } from "@/lib/format";
import { api, errorMessage, validationDetails } from "@/lib/client";
import type { ProjectListCard, SessionSummary } from "@/lib/project-types";
import { PROJECT_STATUS_LABEL } from "@/lib/project-types";

interface NewProjectDraft {
  name: string;
  code: string;
  clientName: string;
  address: string;
  template: "empty" | "demo";
  widthMm: number;
  heightMm: number;
}

export function ProjectsView({
  user,
  projects,
}: {
  user: SessionSummary;
  projects: ProjectListCard[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [creating, setCreating] = useState(false);
  const canCreate = can(user.role, "project:write");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (status !== "all" && project.status !== status) return false;
      if (!needle) return true;
      return [project.name, project.code, project.clientName, project.address]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [projects, query, status]);

  const totals = useMemo(
    () =>
      projects.reduce(
        (sum, project) => ({
          equipment: sum.equipment + project.counts.equipment,
          circuits: sum.circuits + project.counts.circuits,
          routes: sum.routes + project.counts.routes,
          demandVA: sum.demandVA + project.totals.demandVA,
          errors: sum.errors + project.findings.errors,
          warnings: sum.warnings + project.findings.warnings,
        }),
        { equipment: 0, circuits: 0, routes: 0, demandVA: 0, errors: 0, warnings: 0 },
      ),
    [projects],
  );

  return (
    <div className="projects-page">
      <header className="command-bar">
        <div className="command-brand">
          <BrandMark />
          <span>
            <span className="brand-word">VECTRIX</span>
            <span className="brand-sub">ENGINEERING WORKSPACE</span>
          </span>
        </div>
        <div className="command-context">
          <span className="mono" style={{ fontSize: 10, letterSpacing: "0.12em", color: "var(--rail-muted)" }}>
            PROJECT INDEX / {user.orgName.toUpperCase()}
          </span>
        </div>
        <div className="command-actions">
          <ThemeToggle compact />
          <AccountMenu
            name={user.name}
            email={user.email}
            role={user.role}
            orgName={user.orgName}
          />
        </div>
      </header>

      <div className="projects-head">
        <div className="projects-head-inner">
          <div>
            <h1 className="projects-title">Projects</h1>
            <p className="projects-sub">
              Electrical design records in this organisation. Every count is read from the same
              model the workspace draws.
            </p>
          </div>
          <button
            className="btn btn-primary btn-lg"
            type="button"
            onClick={() => setCreating(true)}
            disabled={!canCreate}
            title={canCreate ? undefined : "Your role cannot create projects."}
          >
            <Plus size={16} aria-hidden="true" />
            New project
          </button>
        </div>
      </div>

      <main className="projects-main">
        <section className="portfolio-strip" aria-label="Portfolio totals">
          <div className="portfolio-cell">
            <span className="l">Projects</span>
            <strong>{formatNumber(projects.length)}</strong>
            <span className="s">in this organisation</span>
          </div>
          <div className="portfolio-cell">
            <span className="l">Placed devices</span>
            <strong>{formatNumber(totals.equipment)}</strong>
            <span className="s">{formatNumber(totals.circuits)} circuits · {formatNumber(totals.routes)} routes</span>
          </div>
          <div className="portfolio-cell">
            <span className="l">Connected demand</span>
            <strong>{formatVA(totals.demandVA)}</strong>
            <span className="s">after circuit demand factors</span>
          </div>
          <div className="portfolio-cell" data-tone={totals.errors > 0 ? "error" : "ok"}>
            <span className="l">Open findings</span>
            <strong>{formatNumber(totals.errors + totals.warnings)}</strong>
            <span className="s">
              {formatNumber(totals.errors)} error · {formatNumber(totals.warnings)} warning
            </span>
          </div>
        </section>

        <div className="project-toolbar">
          <div className="search-box">
            <Search size={14} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, code, client or address"
              aria-label="Search projects"
            />
          </div>
          <div className="seg" role="group" aria-label="Filter by status">
            {["all", "design", "issued", "draft", "archived"].map((option) => (
              <button
                key={option}
                type="button"
                data-active={status === option}
                onClick={() => setStatus(option)}
              >
                {option === "all" ? "All" : (PROJECT_STATUS_LABEL[option] ?? option)}
              </button>
            ))}
          </div>
          <span className="project-count mono">
            {filtered.length} / {projects.length}
          </span>
        </div>

        <section aria-label="Project list">
          <div className="project-row project-row-head" aria-hidden="true">
            <span>Project</span>
            <span>Status</span>
            <span>Scope</span>
            <span>Network</span>
            <span>Findings</span>
            <span style={{ textAlign: "right" }}>Updated</span>
          </div>
          {filtered.length === 0 && (
            <div className="projects-empty">
              <FolderOpen size={22} aria-hidden="true" />
              <div>
                <strong>No projects match this view</strong>
                <p>
                  {projects.length === 0
                    ? "Create a project to start a drawing sheet and circuit directory."
                    : "Clear the search or choose another status."}
                </p>
              </div>
              {projects.length === 0 && (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => setCreating(true)}
                  disabled={!canCreate}
                  title={canCreate ? undefined : "Your role cannot create projects."}
                >
                  <Plus size={15} aria-hidden="true" /> New project
                </button>
              )}
            </div>
          )}
          {filtered.map((project) => (
            <Link
              className="project-row"
              key={project.id}
              href={`/projects/${project.id}`}
              aria-label={`Open ${project.name}`}
            >
              <div style={{ minWidth: 0 }}>
                <div className="name">{project.name}</div>
                <div className="meta">
                  {project.code}
                  {project.clientName ? ` · ${project.clientName}` : ""}
                  {project.address ? ` · ${project.address}` : ""}
                </div>
              </div>
              <div>
                <span className="chip" data-tone={project.status === "issued" ? "ok" : "info"}>
                  <span className="chip-dot" />
                  {PROJECT_STATUS_LABEL[project.status] ?? project.status}
                </span>
              </div>
              <div className="project-stat">
                <strong>{project.counts.rooms} rooms</strong>
                {project.counts.walls} walls · {project.counts.equipment} devices
              </div>
              <div className="project-stat">
                <strong>{project.counts.circuits} circuits</strong>
                {project.counts.routes} routes · {project.counts.connections} terminals
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {project.findings.errors > 0 && (
                  <span className="chip" data-tone="error">
                    {project.findings.errors} error
                  </span>
                )}
                {project.findings.warnings > 0 && (
                  <span className="chip" data-tone="warning">
                    {project.findings.warnings} warn
                  </span>
                )}
                {project.findings.errors === 0 && project.findings.warnings === 0 && (
                  <span className="chip" data-tone="ok">
                    <Check size={10} aria-hidden="true" /> clear
                  </span>
                )}
              </div>
              <div className="project-row-end">
                <span className="mono">{relativeDate(project.updatedAt)}</span>
                <ArrowUpRight size={15} aria-hidden="true" />
              </div>
            </Link>
          ))}
        </section>
      </main>

      {creating && (
        <NewProjectDialog
          onClose={() => setCreating(false)}
          onCreated={(projectId) => {
            setCreating(false);
            router.push(`/projects/${projectId}`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function NewProjectDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (projectId: string) => void;
}) {
  const [draft, setDraft] = useState<NewProjectDraft>({
    name: "",
    code: "",
    clientName: "",
    address: "",
    template: "empty",
    widthMm: 12_000,
    heightMm: 9_000,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<unknown>(null);
  const details = validationDetails(serverError);

  function update<K extends keyof NewProjectDraft>(key: K, value: NewProjectDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setServerError(null);
    try {
      const result = await api<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        json: draft,
      });
      onCreated(result.project.id);
    } catch (cause) {
      setError(errorMessage(cause));
      setServerError(cause);
      setPending(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="new-project-title">
        <div className="dialog-head">
          <h2 className="dialog-title" id="new-project-title">
            New electrical project
          </h2>
          <p className="dialog-sub">
            A level and drawing sheet are created with the project. Calculations stay advisory
            until inputs are reviewed.
          </p>
        </div>
        <div className="dialog-body">
          {error && (
            <div className="login-error" role="alert">
              <span>{error}</span>
              {details.length > 0 && (
                <ul style={{ margin: "4px 0 0", paddingLeft: 16, fontSize: 11 }}>
                  {details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="field-grid">
            <div>
              <label className="field-label" htmlFor="project-name">
                Project name
              </label>
              <input
                className="field"
                id="project-name"
                value={draft.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Apartment refurbishment — Baixa"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="field-label" htmlFor="project-code">
                Project code
              </label>
              <input
                className="field mono"
                id="project-code"
                value={draft.code}
                onChange={(event) => update("code", event.target.value.toUpperCase())}
                placeholder="VX-2026-014"
                pattern="[A-Z0-9][A-Z0-9-]*"
                required
              />
            </div>
          </div>
          <div style={{ height: 10 }} />
          <div className="field-grid">
            <div>
              <label className="field-label" htmlFor="project-client">
                Client
              </label>
              <input
                className="field"
                id="project-client"
                value={draft.clientName}
                onChange={(event) => update("clientName", event.target.value)}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="field-label" htmlFor="project-address">
                Site address
              </label>
              <input
                className="field"
                id="project-address"
                value={draft.address}
                onChange={(event) => update("address", event.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div style={{ height: 14 }} />
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">Starting template</legend>
            <div className="template-choice">
              <label data-active={draft.template === "empty"}>
                <input
                  type="radio"
                  name="template"
                  value="empty"
                  checked={draft.template === "empty"}
                  onChange={() => update("template", "empty")}
                />
                <strong>Empty sheet</strong>
                <span>A measured rectangular level with no rooms or devices.</span>
              </label>
              <label data-active={draft.template === "demo"}>
                <input
                  type="radio"
                  name="template"
                  value="demo"
                  checked={draft.template === "demo"}
                  onChange={() => update("template", "demo")}
                />
                <strong>Demo apartment</strong>
                <span>Full T2 fixture: rooms, equipment, circuits, routes and findings.</span>
              </label>
            </div>
          </fieldset>
          {draft.template === "empty" && (
            <>
              <div style={{ height: 14 }} />
              <div className="field-grid">
                <div>
                  <label className="field-label" htmlFor="project-width">
                    Sheet width (mm)
                  </label>
                  <input
                    className="field mono"
                    id="project-width"
                    type="number"
                    min={1000}
                    max={200000}
                    value={draft.widthMm}
                    onChange={(event) => update("widthMm", Number(event.target.value))}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="project-height">
                    Sheet height (mm)
                  </label>
                  <input
                    className="field mono"
                    id="project-height"
                    type="number"
                    min={1000}
                    max={200000}
                    value={draft.heightMm}
                    onChange={(event) => update("heightMm", Number(event.target.value))}
                  />
                </div>
              </div>
            </>
          )}
        </div>
        <div className="dialog-foot">
          <button className="btn btn-quiet" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create project"}
            <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
