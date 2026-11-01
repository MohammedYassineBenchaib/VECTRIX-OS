"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  Check,
  ChevronDown,
  Command,
  FolderOpen,
  Hand,
  Maximize2,
  MousePointer2,
  PanelLeft,
  PanelRight,
  PenLine,
  Play,
  Plus,
  RefreshCw,
  Route as RouteIcon,
  Square,
  TableProperties,
  X,
} from "lucide-react";
import {
  can,
  findEquipmentDefinition,
  type Equipment,
  type LevelWorkspace,
  type MemberRole,
  type PlanPoint,
  type Route,
  type ValidationResult,
} from "@vectrix/core";
import type { CableSelectionResult, InstallationConditions } from "@vectrix/electrical";
import { AccountMenu } from "@/components/account-menu";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { api, errorMessage, validationDetails } from "@/lib/client";
import { formatDate, formatMetres, formatVA } from "@/lib/format";
import {
  downloadUrl,
  nearestEquipment,
  routeStatusLabel,
} from "./helpers";
import type {
  PlanTool,
  Selection,
  WorkspacePayloadClient,
  WorkspaceView as WorkspaceViewName,
} from "@/lib/workspace-types";
import { CircuitBusbar } from "./circuit-busbar";
import { CircuitsView } from "./circuits-view";
import { CommandPalette } from "./command-palette";
import { NewCircuitDialog, NewRoomDialog, type NewCircuitInput, type NewRoomInput } from "./dialogs";
import { FindingsView } from "./findings-view";
import { Inspector } from "./inspector";
import { MaterialsView } from "./materials-view";
import { PlanCanvas } from "./plan-canvas";
import { ToastStack, useToasts } from "./toast";
import { UtilityColumn } from "./utility-column";

interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  orgName: string;
}

interface ProjectChoice {
  id: string;
  name: string;
  code: string;
}

interface ValidationSummary {
  errors: number;
  warnings: number;
  infos: number;
}

function selectionExists(selection: Selection, workspace: LevelWorkspace): boolean {
  if (!selection) return false;
  switch (selection.kind) {
    case "equipment":
      return workspace.equipment.some((item) => item.id === selection.id);
    case "route":
      return workspace.routes.some((item) => item.id === selection.id);
    case "room":
      return workspace.rooms.some((item) => item.id === selection.id);
    case "wall":
      return workspace.walls.some((item) => item.id === selection.id);
    case "circuit":
      return workspace.circuits.some((item) => item.id === selection.id);
    default:
      return false;
  }
}

function selectionForFinding(finding: ValidationResult): Selection {
  if (finding.entityType === "equipment") return { kind: "equipment", id: finding.entityId };
  if (finding.entityType === "route") return { kind: "route", id: finding.entityId };
  if (finding.entityType === "circuit") return { kind: "circuit", id: finding.entityId };
  if (finding.entityType === "room") return { kind: "room", id: finding.entityId };
  return null;
}

function toolHint(tool: PlanTool): string {
  switch (tool) {
    case "wall":
      return "Draw a wall";
    case "room":
      return "Close a room polygon";
    case "route":
      return "Draw a cable route";
    case "pan":
      return "Pan the sheet";
    default:
      return "Select and move";
  }
}

export function WorkspaceView({
  initial,
  user,
  projects,
}: {
  initial: WorkspacePayloadClient;
  user: WorkspaceUser;
  projects: ProjectChoice[];
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<WorkspacePayloadClient>(initial);
  const [view, setView] = useState<WorkspaceViewName>("plan");
  const [selection, setSelection] = useState<Selection>(null);
  const [tool, setTool] = useState<PlanTool>("select");
  const [activeCircuitId, setActiveCircuitId] = useState<string | null>(null);
  const [pendingDefinitionKey, setPendingDefinitionKey] = useState<string | null>(null);
  const [focusValidationId, setFocusValidationId] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newCircuitOpen, setNewCircuitOpen] = useState(false);
  const [roomPolygon, setRoomPolygon] = useState<PlanPoint[] | null>(null);
  const [utilityMobileOpen, setUtilityMobileOpen] = useState(false);
  const [inspectorMobileOpen, setInspectorMobileOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const busyRef = useRef(false);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const { toasts, push, dismiss } = useToasts();

  const project = payload.workspace.project;
  const workspace = payload.workspace;
  const levelId = workspace.level.id;
  const stats = payload.stats;
  const canDesign = can(user.role, "design:write");
  const canValidate = can(user.role, "validation:run");
  const canResolve = can(user.role, "validation:resolve");
  const focusValidation = useMemo(
    () =>
      focusValidationId
        ? (workspace.validations.find((finding) => finding.id === focusValidationId) ?? null)
        : null,
    [focusValidationId, workspace.validations],
  );

  useEffect(() => {
    if (!projectMenuOpen) return;
    function onPointer(event: MouseEvent) {
      if (!projectMenuRef.current?.contains(event.target as Node)) setProjectMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setProjectMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [projectMenuOpen]);

  async function refresh(targetLevelId?: string): Promise<WorkspacePayloadClient> {
    setRefreshing(true);
    try {
      const next = await api<WorkspacePayloadClient>(
        `/api/projects/${project.id}/workspace?levelId=${encodeURIComponent(
          targetLevelId ?? levelId,
        )}`,
      );
      setPayload(next);
      setSelection((current) =>
        current && selectionExists(current, next.workspace) ? current : null,
      );
      setActiveCircuitId((current) =>
        current && next.workspace.circuits.some((circuit) => circuit.id === current)
          ? current
          : null,
      );
      setFocusValidationId((current) =>
        current && next.workspace.validations.some((finding) => finding.id === current)
          ? current
          : null,
      );
      return next;
    } finally {
      setRefreshing(false);
    }
  }

  function reportFailure(failure: string, error: unknown) {
    const details = validationDetails(error);
    const detail = [errorMessage(error), ...details.slice(0, 2)].filter(Boolean).join(" · ");
    push("error", failure, detail || undefined);
  }

  async function runBusy<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    setBusy(true);
    try {
      return await action();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function runAction<T>(failure: string, action: () => Promise<T>): Promise<T | undefined> {
    return runBusy(async () => {
      try {
        return await action();
      } catch (error) {
        reportFailure(failure, error);
        return undefined;
      }
    });
  }

  function changeView(next: WorkspaceViewName) {
    setView(next);
    setUtilityMobileOpen(false);
    setInspectorMobileOpen(false);
  }

  function select(next: Selection) {
    setSelection(next);
    setFocusValidationId(null);
    setInspectorMobileOpen(Boolean(next));
  }

  function selectCircuit(circuitId: string | null) {
    setActiveCircuitId(circuitId);
    if (circuitId) {
      setSelection({ kind: "circuit", id: circuitId });
      setFocusValidationId(null);
      setInspectorMobileOpen(true);
    } else {
      setSelection(null);
    }
  }

  function locateFinding(finding: ValidationResult) {
    const next = selectionForFinding(finding);
    setFocusValidationId(finding.id);
    setSelection(next);
    setView("plan");
    setTool("select");
    setPendingDefinitionKey(null);
    setInspectorMobileOpen(true);
  }

  async function placeEquipment(
    definitionKey: string,
    point: PlanPoint,
    roomId: string | null,
  ): Promise<boolean> {
    const created = await runAction("The device could not be placed", async () => {
      const result = await api<{ equipment: Equipment }>(
        `/api/projects/${project.id}/equipment`,
        {
          method: "POST",
          json: {
            levelId,
            roomId,
            definitionKey,
            xMm: point.x,
            yMm: point.y,
            rotationDeg: 0,
            circuitId: activeCircuitId,
          },
        },
      );
      await refresh();
      return result.equipment;
    });
    if (!created) return false;
    setPendingDefinitionKey(null);
    setTool("select");
    setSelection({ kind: "equipment", id: created.id });
    push("ok", "Device placed", `${created.label} was added to the level.`);
    return true;
  }

  async function moveEquipment(equipmentId: string, point: PlanPoint): Promise<boolean> {
    const moved = await runAction("The device could not be moved", async () => {
      await api(`/api/projects/${project.id}/equipment/${equipmentId}`, {
        method: "PATCH",
        json: { xMm: point.x, yMm: point.y },
      });
      await refresh();
      return true;
    });
    return moved ?? false;
  }

  async function createWall(start: PlanPoint, end: PlanPoint): Promise<boolean> {
    const created = await runAction("The wall could not be drawn", async () => {
      await api(`/api/projects/${project.id}/geometry`, {
        method: "POST",
        json: {
          entityType: "wall",
          levelId,
          start,
          end,
          thicknessMm: 120,
          heightMm: 2700,
          kind: "interior",
          material: "masonry",
          loadBearing: false,
          allowPenetration: true,
        },
      });
      await refresh();
      return true;
    });
    if (created) push("ok", "Wall recorded", "The wall is part of the level geometry now.");
    return created ?? false;
  }

  async function createRoute(points: PlanPoint[]): Promise<boolean> {
    const first = points[0];
    const last = points[points.length - 1];
    const from = first ? nearestEquipment(workspace.equipment, first, 300) : undefined;
    const to = last ? nearestEquipment(workspace.equipment, last, 300) : undefined;
    const created = await runAction("The route could not be saved", async () => {
      const result = await api<{ route: Route }>(`/api/projects/${project.id}/routes`, {
        method: "POST",
        json: {
          levelId,
          circuitId: activeCircuitId,
          fromEquipmentId: from?.id ?? null,
          toEquipmentId: to?.id ?? null,
          points,
          status: "proposed",
          conduitKey: "pvc-20",
          slackPercent: 10,
        },
      });
      await refresh();
      return result.route;
    });
    if (!created) return false;
    setSelection({ kind: "route", id: created.id });
    setTool("select");
    push("ok", "Route proposed", `${formatMetres(created.lengthMm / 1000, 2)} measured.`);
    return true;
  }

  async function updateEquipment(id: string, patch: Record<string, unknown>): Promise<boolean> {
    const result = await runAction("The device could not be updated", async () => {
      await api(`/api/projects/${project.id}/equipment/${id}`, { method: "PATCH", json: patch });
      await refresh();
      return true;
    });
    return result ?? false;
  }

  async function deleteEquipment(id: string): Promise<boolean> {
    const label = workspace.equipment.find((item) => item.id === id)?.label ?? "Device";
    const result = await runAction("The device could not be removed", async () => {
      await api(`/api/projects/${project.id}/equipment/${id}`, { method: "DELETE" });
      await refresh();
      return true;
    });
    if (result) {
      setSelection(null);
      push("ok", "Device removed", `${label} was removed from the level.`);
    }
    return result ?? false;
  }

  async function updateCircuit(id: string, patch: Record<string, unknown>): Promise<boolean> {
    const result = await runAction("The circuit could not be updated", async () => {
      await api(`/api/projects/${project.id}/circuits/${id}`, { method: "PATCH", json: patch });
      await refresh();
      return true;
    });
    return result ?? false;
  }

  async function updateRoute(id: string, patch: Record<string, unknown>): Promise<boolean> {
    const result = await runAction("The route could not be updated", async () => {
      await api(`/api/projects/${project.id}/routes/${id}`, { method: "PATCH", json: patch });
      await refresh();
      return true;
    });
    return result ?? false;
  }

  async function setRouteStatus(id: string, status: Route["status"]): Promise<boolean> {
    const result = await runAction("The route status could not change", async () => {
      await api(`/api/projects/${project.id}/routes/${id}/status`, {
        method: "POST",
        json: { status },
      });
      await refresh();
      return true;
    });
    if (result) push("ok", `Route ${routeStatusLabel(status).toLowerCase()}`, "Validation evidence was refreshed.");
    return result ?? false;
  }

  async function resolveValidation(
    id: string,
    status: "acknowledged" | "accepted_risk" | "resolved",
  ): Promise<boolean> {
    const result = await runAction("The finding could not be updated", async () => {
      await api(`/api/projects/${project.id}/validations/${id}`, {
        method: "PATCH",
        json: { status },
      });
      await refresh();
      return true;
    });
    if (result) {
      const label =
        status === "resolved" ? "Finding resolved" : status === "accepted_risk" ? "Risk accepted" : "Finding acknowledged";
      push("ok", label, "The decision is recorded on the project.");
    }
    return result ?? false;
  }

  async function runValidation() {
    if (!canValidate) {
      push("error", "Read-only role", "Your role cannot re-run validation.");
      return;
    }
    const result = await runAction("Validation could not run", async () => {
      const response = await api<{ summary: ValidationSummary }>(
        `/api/projects/${project.id}/validate`,
        { method: "POST", json: {} },
      );
      await refresh();
      return response.summary;
    });
    if (result) {
      push(
        "ok",
        "Validation refreshed",
        `${result.errors} error(s) · ${result.warnings} warning(s) · ${result.infos} info(s)`,
      );
    }
  }

  async function sizeCable(
    circuitId: string,
    conditions: InstallationConditions,
  ): Promise<CableSelectionResult | null> {
    const result = await runAction("Cable selection could not run", async () => {
      const response = await api<{ selection: CableSelectionResult }>(
        `/api/projects/${project.id}/cable-selection`,
        {
          method: "POST",
          json: {
            circuitId,
            ambientTempC: conditions.ambientTempC,
            groupedCircuits: conditions.groupedCircuits,
            thermalInsulationFactor: conditions.thermalInsulationFactor,
          },
        },
      );
      return response.selection;
    });
    return result ?? null;
  }

  async function changeLevel(id: string) {
    if (id === levelId) return;
    const result = await runAction("The level could not be loaded", async () => {
      await refresh(id);
      return true;
    });
    if (!result) return;
    setSelection(null);
    setActiveCircuitId(null);
    setFocusValidationId(null);
    setPendingDefinitionKey(null);
    setTool("select");
    setFitNonce((value) => value + 1);
    setUtilityMobileOpen(false);
    setInspectorMobileOpen(false);
    window.history.replaceState({}, "", `${window.location.pathname}?level=${encodeURIComponent(id)}`);
  }

  async function createCircuit(input: NewCircuitInput) {
    const result = await api<{ circuit: { id: string; name: string } }>(
      `/api/projects/${project.id}/circuits`,
      { method: "POST", json: input },
    );
    await refresh();
    setNewCircuitOpen(false);
    setSelection({ kind: "circuit", id: result.circuit.id });
    setActiveCircuitId(result.circuit.id);
    changeView("circuits");
    push("ok", "Circuit created", `${result.circuit.name} is ready for equipment and routes.`);
  }

  async function createRoom(input: NewRoomInput) {
    const result = await api<{ room: { id: string; name: string } }>(
      `/api/projects/${project.id}/geometry`,
      { method: "POST", json: { entityType: "room", levelId, ...input } },
    );
    await refresh();
    setRoomPolygon(null);
    setTool("select");
    setSelection({ kind: "room", id: result.room.id });
    push("ok", "Room recorded", `${result.room.name} was added to the level.`);
  }

  function exportTakeoff() {
    downloadUrl(
      `/api/projects/${project.id}/takeoff?format=csv`,
      `vectrix-takeoff-${project.code}.csv`,
    );
    push("info", "Take-off export started", "The CSV follows the current model and assumptions.");
  }

  function toggleUtility() {
    setInspectorMobileOpen(false);
    setUtilityMobileOpen((value) => !value);
  }

  function toggleInspector() {
    setUtilityMobileOpen(false);
    setInspectorMobileOpen((value) => !value);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((value) => !value);
        return;
      }

      if (paletteOpen || newCircuitOpen || roomPolygon) return;

      if (event.key === "Escape") {
        setUtilityMobileOpen(false);
        setInspectorMobileOpen(false);
        setProjectMenuOpen(false);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "/") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (!canDesign) return;

      const key = event.key.toLowerCase();
      if (key === "v") setTool("select");
      if (key === "h") setTool("pan");
      if (key === "w") setTool("wall");
      if (key === "r") setTool("room");
      if (key === "c") setTool("route");
      if (event.key === "[") toggleUtility();
      if (event.key === "]") toggleInspector();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canDesign, newCircuitOpen, paletteOpen, roomPolygon]);

  const tools: Array<{ key: PlanTool; label: string; shortcut: string; icon: React.ReactNode }> = [
    { key: "select", label: "Select", shortcut: "V", icon: <MousePointer2 size={15} /> },
    { key: "pan", label: "Pan", shortcut: "H", icon: <Hand size={15} /> },
    { key: "wall", label: "Wall", shortcut: "W", icon: <PenLine size={15} /> },
    { key: "room", label: "Room", shortcut: "R", icon: <Square size={15} /> },
    { key: "route", label: "Route", shortcut: "C", icon: <RouteIcon size={15} /> },
  ];

  const activeCircuit = workspace.circuits.find((circuit) => circuit.id === activeCircuitId);
  const projectChoices = projects.length > 0 ? projects : [{ id: project.id, name: project.name, code: project.code }];

  return (
    <div className="app-shell">
      <header className="command-bar">
        <div className="command-brand">
          <button
            type="button"
            className="brand-home"
            onClick={() => router.push("/projects")}
            aria-label="Back to the project index"
            title="Project index"
          >
            <BrandMark />
            <span>
              <span className="brand-word">VECTRIX</span>
              <span className="brand-sub">ENGINEERING WORKSPACE</span>
            </span>
          </button>
        </div>

        <div className="command-context">
          <div className="project-menu-anchor" ref={projectMenuRef}>
            <button
              type="button"
              className="project-switcher"
              onClick={() => setProjectMenuOpen((value) => !value)}
              aria-expanded={projectMenuOpen}
              aria-haspopup="menu"
            >
              <span className="project-code">{project.code}</span>
              <span className="project-name">{project.name}</span>
              <ChevronDown size={13} aria-hidden="true" />
            </button>
            {projectMenuOpen && (
              <div className="popover project-menu" role="menu" aria-label="Switch project">
                <div className="popover-head">
                  <strong>Switch project</strong>
                  <span>{projectChoices.length} in this organisation</span>
                </div>
                {projectChoices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className="popover-item project-menu-item"
                    role="menuitem"
                    data-active={choice.id === project.id}
                    onClick={() => {
                      setProjectMenuOpen(false);
                      if (choice.id !== project.id) router.push(`/projects/${choice.id}`);
                    }}
                  >
                    <span className="mono project-menu-code">{choice.code}</span>
                    <span className="project-menu-name">{choice.name}</span>
                    {choice.id === project.id && <Check size={13} aria-hidden="true" />}
                  </button>
                ))}
                <button
                  type="button"
                  className="popover-item project-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setProjectMenuOpen(false);
                    router.push("/projects");
                  }}
                >
                  <FolderOpen size={14} aria-hidden="true" />
                  Project index
                </button>
              </div>
            )}
          </div>

          <div className="cmd-bar-stats" aria-label="Project totals">
            <div className="cmd-bar-stat" data-tone={stats.errors > 0 ? "error" : undefined}>
              <span className="value">{stats.errors}</span>
              <span className="label">errors</span>
            </div>
            <div className="cmd-bar-stat" data-tone={stats.warnings > 0 ? "warning" : undefined}>
              <span className="value">{stats.warnings}</span>
              <span className="label">warnings</span>
            </div>
            <div className="cmd-bar-stat">
              <span className="value">{stats.equipment}</span>
              <span className="label">devices</span>
            </div>
            <div className="cmd-bar-stat">
              <span className="value">{formatVA(stats.demandVA)}</span>
              <span className="label">demand</span>
            </div>
          </div>
        </div>

        <div className="command-actions">
          <button
            type="button"
            className="btn btn-sm command-run"
            onClick={() => void runValidation()}
            disabled={busy || !canValidate}
            title={
              canValidate
                ? "Re-run the advisory rule set"
                : "Your role cannot run validation"
            }
          >
            <Play size={12} aria-hidden="true" />
            <span className="hide-mobile">{busy ? "Working…" : "Validate"}</span>
          </button>
          <button
            type="button"
            className="icon-btn workspace-toggle"
            onClick={toggleInspector}
            aria-label="Toggle inspector"
            title="Toggle inspector"
            data-active={inspectorMobileOpen}
          >
            <PanelRight size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-btn workspace-toggle-utility"
            onClick={toggleUtility}
            aria-label="Toggle model panel"
            title="Toggle model panel"
            data-active={utilityMobileOpen}
          >
            <PanelLeft size={16} aria-hidden="true" />
          </button>
          <ThemeToggle compact />
          <AccountMenu
            name={user.name}
            email={user.email}
            role={user.role}
            orgName={user.orgName}
          />
        </div>
      </header>

      <div className="workspace-body">
        <nav className="rail" aria-label="Workspace sections">
          <button
            type="button"
            className="rail-item"
            data-active={view === "plan"}
            onClick={() => changeView("plan")}
            aria-label="Plan drawing"
            aria-current={view === "plan" ? "page" : undefined}
          >
            <PenLine size={19} aria-hidden="true" />
            <span className="rail-tip">Plan drawing</span>
          </button>
          <button
            type="button"
            className="rail-item"
            data-active={view === "circuits"}
            onClick={() => changeView("circuits")}
            aria-label="Circuit schedule"
            aria-current={view === "circuits" ? "page" : undefined}
          >
            <TableProperties size={19} aria-hidden="true" />
            <span className="rail-tip">Circuit schedule</span>
          </button>
          <button
            type="button"
            className="rail-item"
            data-active={view === "materials"}
            onClick={() => changeView("materials")}
            aria-label="Material take-off"
            aria-current={view === "materials" ? "page" : undefined}
          >
            <Boxes size={19} aria-hidden="true" />
            <span className="rail-tip">Material take-off</span>
          </button>
          <button
            type="button"
            className="rail-item"
            data-active={view === "findings"}
            onClick={() => changeView("findings")}
            aria-label="Findings register"
            aria-current={view === "findings" ? "page" : undefined}
          >
            <AlertTriangle size={19} aria-hidden="true" />
            {(stats.errors > 0 || stats.warnings > 0) && (
              <span className="rail-badge mono" data-tone={stats.errors > 0 ? "error" : "warning"}>
                {stats.errors + stats.warnings}
              </span>
            )}
            <span className="rail-tip">Findings register</span>
          </button>
          <div className="rail-spacer" />
          <button
            type="button"
            className="rail-item"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open the command palette"
          >
            <Command size={19} aria-hidden="true" />
            <span className="rail-tip">Commands · Ctrl K</span>
          </button>
        </nav>

        <div className="workspace">
          <UtilityColumn
            workspace={workspace}
            levels={payload.levels}
            selection={selection}
            pendingDefinitionKey={pendingDefinitionKey}
            mobileOpen={utilityMobileOpen}
            readOnly={!canDesign}
            onClose={() => setUtilityMobileOpen(false)}
            onSelectLevel={(id) => void changeLevel(id)}
            onSelect={select}
            onArmLibrary={(key) => {
              setPendingDefinitionKey(key);
              setView("plan");
              setTool("select");
              setInspectorMobileOpen(false);
            }}
          />

          <div className="center-column">
            <div className="mobile-view-bar">
              <div className="mobile-view-tabs" role="tablist" aria-label="Workspace sections">
                {(
                  [
                    ["plan", "Plan"],
                    ["circuits", "Circuits"],
                    ["materials", "Take-off"],
                    ["findings", "Findings"],
                  ] as Array<[WorkspaceViewName, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={view === key}
                    data-active={view === key}
                    onClick={() => changeView(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={toggleUtility}
                aria-label="Toggle model panel"
              >
                <PanelLeft size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={toggleInspector}
                aria-label="Toggle inspector"
              >
                <PanelRight size={15} aria-hidden="true" />
              </button>
            </div>

            {view === "plan" && (
              <>
                <div className="plan-toolbar" role="toolbar" aria-label="Drawing tools">
                  {tools.map((item) => {
                    const toolDisabled = !canDesign && item.key !== "select" && item.key !== "pan";
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className="tool-btn"
                        data-active={tool === item.key && !pendingDefinitionKey}
                        aria-pressed={tool === item.key && !pendingDefinitionKey}
                        disabled={toolDisabled}
                        title={
                          toolDisabled
                            ? "Your role cannot change the design"
                            : `${toolHint(item.key)} (${item.shortcut})`
                        }
                        onClick={() => {
                          setTool(item.key);
                          setPendingDefinitionKey(null);
                        }}
                      >
                        {item.icon}
                        <span className="tool-label">{item.label}</span>
                        <span className="tool-kbd mono">{item.shortcut}</span>
                      </button>
                    );
                  })}
                  <div className="tool-divider" />
                  <button
                    type="button"
                    className="tool-btn"
                    onClick={() => setNewCircuitOpen(true)}
                    disabled={!canDesign}
                    title={
                      canDesign ? "Create a circuit" : "Your role cannot create circuits"
                    }
                  >
                    <Plus size={15} aria-hidden="true" />
                    <span className="tool-label">Circuit</span>
                  </button>
                  {!canDesign && (
                    <span className="read-only-chip mono" title="Server permissions still apply">
                      Read-only
                    </span>
                  )}
                  {activeCircuit && (
                    <button
                      type="button"
                      className="isolate-chip"
                      onClick={() => setActiveCircuitId(null)}
                      title="Clear the circuit isolation"
                    >
                      <span className="circuit-swatch" style={{ background: activeCircuit.color }} />
                      <span className="mono">{activeCircuit.name}</span>
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                  <span className="plan-toolbar-spacer" />
                  <span className="plan-sheet-ref mono hide-mobile">
                    {levelId.replace(/^lvl_/, "LVL-").toUpperCase()} / {workspace.building.name}
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => setFitNonce((value) => value + 1)}
                    aria-label="Fit the plan to the sheet"
                    title="Fit plan (fit to sheet)"
                  >
                    <Maximize2 size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => void refresh()}
                    aria-label="Refresh the model"
                    title="Refresh the model"
                  >
                    <RefreshCw
                      size={15}
                      aria-hidden="true"
                      className={refreshing ? "is-spinning" : undefined}
                    />
                  </button>
                </div>

                <CircuitBusbar
                  circuits={workspace.circuits}
                  schedule={payload.loadSchedule}
                  activeCircuitId={activeCircuitId}
                  totalDemandVA={payload.loadSchedule.totalDemandVA}
                  onSelect={selectCircuit}
                />

                <div className="plan-stage">
                  <div className="plan-sheet">
                    <div className="plan-sheet-head">
                      <span>
                        EL-01 · {workspace.level.name} · {workspace.building.name}
                      </span>
                      <span>
                        {workspace.rooms.length} rooms · {workspace.equipment.length} devices ·{" "}
                        {workspace.routes.length} routes
                      </span>
                    </div>

                    <PlanCanvas
                      workspace={workspace}
                      activeCircuitId={activeCircuitId}
                      selection={selection}
                      focusValidationId={focusValidationId}
                      tool={tool}
                      pendingDefinitionKey={pendingDefinitionKey}
                      fitNonce={fitNonce}
                      editable={canDesign}
                      onSelect={select}
                      onPlaceEquipment={placeEquipment}
                      onMoveEquipment={moveEquipment}
                      onCreateWall={createWall}
                      onCreateRoom={(points) => {
                        setRoomPolygon(points);
                        setInspectorMobileOpen(false);
                      }}
                      onCreateRoute={createRoute}
                      onLocateValidation={locateFinding}
                    />

                    <div className="plan-title-block">
                      <div className="title-cell">
                        <span className="k">Project</span>
                        <span className="v">{project.name}</span>
                      </div>
                      <div className="title-cell">
                        <span className="k">Level</span>
                        <span className="v">
                          {workspace.level.name} · {workspace.level.elevationMm} mm
                        </span>
                      </div>
                      <div className="title-cell">
                        <span className="k">Drawing</span>
                        <span className="v mono">EL-01 · NTS</span>
                      </div>
                      <div className="title-cell">
                        <span className="k">Model updated</span>
                        <span className="v mono">{formatDate(project.updatedAt)}</span>
                      </div>
                      <div className="title-cell">
                        <span className="k">Evidence</span>
                        <span className="v mono">
                          {stats.errors}E / {stats.warnings}W / {stats.infos}I
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {view === "circuits" && (
              <CircuitsView
                payload={payload}
                selectionId={selection?.kind === "circuit" ? selection.id : null}
                activeCircuitId={activeCircuitId}
                canWrite={canDesign}
                canValidate={canValidate}
                onSelectCircuit={(id) => select({ kind: "circuit", id })}
                onIsolate={(id) => {
                  selectCircuit(id);
                  setView("plan");
                }}
                onNewCircuit={() => setNewCircuitOpen(true)}
                onRunValidation={() => void runValidation()}
                pending={busy}
              />
            )}

            {view === "materials" && (
              <MaterialsView payload={payload} takeoff={payload.takeoff} onExport={exportTakeoff} />
            )}

            {view === "findings" && (
              <FindingsView
                payload={payload}
                focusValidationId={focusValidationId}
                canValidate={canValidate}
                canResolve={canResolve}
                onLocate={locateFinding}
                onResolve={resolveValidation}
                onRunValidation={() => void runValidation()}
                pending={busy}
              />
            )}
          </div>

          <Inspector
            payload={payload}
            selection={selection}
            focusValidation={focusValidation}
            mobileOpen={inspectorMobileOpen}
            canEdit={canDesign}
            canResolve={canResolve}
            onClose={() => setInspectorMobileOpen(false)}
            onSelect={select}
            onClearFocus={() => setFocusValidationId(null)}
            onPatchEquipment={updateEquipment}
            onDeleteEquipment={deleteEquipment}
            onPatchCircuit={updateCircuit}
            onPatchRoute={updateRoute}
            onRouteStatus={setRouteStatus}
            onSizeCable={sizeCable}
            onResolveValidation={resolveValidation}
            onOpenFindings={() => changeView("findings")}
          />
        </div>
      </div>

      {(utilityMobileOpen || inspectorMobileOpen) && (
        <button
          type="button"
          className="drawer-scrim"
          aria-label="Close the side panel"
          onClick={() => {
            setUtilityMobileOpen(false);
            setInspectorMobileOpen(false);
          }}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        payload={payload}
        canDesign={canDesign}
        canValidate={canValidate}
        onView={changeView}
        onSelect={select}
        onTool={(next) => {
          setTool(next);
          setPendingDefinitionKey(null);
        }}
        onNewCircuit={() => setNewCircuitOpen(true)}
        onValidate={() => void runValidation()}
        onExport={exportTakeoff}
        onFit={() => {
          changeView("plan");
          setFitNonce((value) => value + 1);
        }}
      />

      {canDesign && newCircuitOpen && (
        <NewCircuitDialog onClose={() => setNewCircuitOpen(false)} onCreate={createCircuit} />
      )}

      {canDesign && roomPolygon && (
        <NewRoomDialog
          polygon={roomPolygon}
          onClose={() => {
            setRoomPolygon(null);
            setTool("select");
          }}
          onCreate={createRoom}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
