"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Cable,
  Check,
  ChevronRight,
  CircleAlert,
  Info,
  Ruler,
  Trash2,
  X,
} from "lucide-react";
import {
  BREAKER_RATINGS_A,
  CONDUIT_TYPES,
  findEquipmentDefinition,
  type Equipment,
  type Route,
  type ValidationResult,
} from "@vectrix/core";
import type { CableSelectionResult, InstallationConditions } from "@vectrix/electrical";
import type { WorkspacePayloadClient, Selection } from "@/lib/workspace-types";
import {
  formatDate,
  formatMetres,
  formatMm,
  formatNumber,
  formatPercent,
  formatVA,
  utilization,
  utilizationTone,
} from "@/lib/format";
import {
  equipmentStateLabel,
  findingEntityLabel,
  occupancyLabel,
  openFindings,
  polygonAreaMm2,
  polygonBounds,
  ROUTE_TRANSITIONS,
  routeLengthForCircuit,
  routeStatusLabel,
  validationStatusLabel,
  wallKindLabel,
} from "./helpers";
import { GlyphPreview } from "./equipment-glyph";

interface InspectorProps {
  payload: WorkspacePayloadClient;
  selection: Selection;
  focusValidation: ValidationResult | null;
  mobileOpen: boolean;
  canEdit: boolean;
  canResolve: boolean;
  onClose: () => void;
  onSelect: (selection: Selection) => void;
  onClearFocus: () => void;
  onPatchEquipment: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  onDeleteEquipment: (id: string) => Promise<boolean>;
  onPatchCircuit: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  onPatchRoute: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  onRouteStatus: (id: string, status: Route["status"]) => Promise<boolean>;
  onSizeCable: (
    circuitId: string,
    conditions: InstallationConditions,
  ) => Promise<CableSelectionResult | null>;
  onResolveValidation: (id: string, status: "acknowledged" | "accepted_risk" | "resolved") => Promise<boolean>;
  onOpenFindings: () => void;
}

export function Inspector(props: InspectorProps) {
  const { payload, selection, focusValidation, mobileOpen, onClose, onClearFocus } = props;
  const { workspace } = payload;

  const header = useMemo(() => {
    if (!selection) return { kicker: "Project frame", title: workspace.project.code, sub: workspace.project.name };
    if (selection.kind === "equipment") {
      const item = workspace.equipment.find((entry) => entry.id === selection.id);
      const definition = item ? findEquipmentDefinition(item.definitionKey) : undefined;
      return {
        kicker: "Equipment",
        title: item?.label ?? "Unknown device",
        sub: definition?.name ?? item?.definitionKey ?? "—",
      };
    }
    if (selection.kind === "circuit") {
      const circuit = workspace.circuits.find((entry) => entry.id === selection.id);
      return { kicker: "Circuit", title: circuit?.name ?? "Unknown circuit", sub: circuit?.description || "—" };
    }
    if (selection.kind === "route") {
      const route = workspace.routes.find((entry) => entry.id === selection.id);
      return {
        kicker: "Route",
        title: route ? route.id.replace(/^rte_/, "RTE-").toUpperCase() : "Unknown route",
        sub: route ? `${routeStatusLabel(route.status)} · ${formatMetres(route.lengthMm / 1000)}` : "",
      };
    }
    if (selection.kind === "room") {
      const room = workspace.rooms.find((entry) => entry.id === selection.id);
      return { kicker: "Room", title: room?.name ?? "Unknown room", sub: room ? room.number : "" };
    }
    const wall = workspace.walls.find((entry) => entry.id === selection.id);
    return {
      kicker: "Wall",
      title: wall ? `${wallKindLabel(wall.kind)} wall` : "Unknown wall",
      sub: wall ? `${formatMm(wall.thicknessMm)} thick` : "",
    };
  }, [selection, workspace]);

  return (
    <aside className="inspector-column" data-open={mobileOpen} aria-label="Inspector">
      <div className="inspector-head">
        <div className="inspector-kicker">
          <span>{header.kicker}</span>
          <span aria-hidden="true">/</span>
          <span className="mono">{workspace.project.code}</span>
          <button
            type="button"
            className="icon-btn inspector-close"
            onClick={onClose}
            aria-label="Close inspector"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        <h2 className="inspector-title">{header.title}</h2>
        <p className="inspector-sub">{header.sub}</p>
      </div>

      <div className="inspector-body">
        {!props.canEdit && (
          <div className="inline-note" data-tone="warning">
            <Info size={12} aria-hidden="true" />
            Read-only role: inspection and exports are available, but design changes are disabled.
          </div>
        )}
        {focusValidation && (
          <FindingDetail
            finding={focusValidation}
            canResolve={props.canResolve}
            onClose={onClearFocus}
            onResolve={props.onResolveValidation}
            onLocate={() => props.onSelect(entitySelection(focusValidation))}
          />
        )}

        {selection?.kind === "equipment" && (
          <EquipmentPanel
            payload={payload}
            equipmentId={selection.id}
            readOnly={!props.canEdit}
            onSelect={props.onSelect}
            onPatch={props.onPatchEquipment}
            onDelete={props.onDeleteEquipment}
          />
        )}
        {selection?.kind === "circuit" && (
          <CircuitPanel
            payload={payload}
            circuitId={selection.id}
            readOnly={!props.canEdit}
            onSelect={props.onSelect}
            onPatch={props.onPatchCircuit}
            onSizeCable={props.onSizeCable}
          />
        )}
        {selection?.kind === "route" && (
          <RoutePanel
            payload={payload}
            routeId={selection.id}
            readOnly={!props.canEdit}
            onSelect={props.onSelect}
            onPatch={props.onPatchRoute}
            onStatus={props.onRouteStatus}
          />
        )}
        {selection?.kind === "room" && (
          <RoomPanel payload={payload} roomId={selection.id} onSelect={props.onSelect} />
        )}
        {selection?.kind === "wall" && <WallPanel payload={payload} wallId={selection.id} />}
        {!selection && (
          <ProjectPanel payload={payload} onOpenFindings={props.onOpenFindings} onSelect={props.onSelect} />
        )}

        <div className="inspector-section advisory">
          <div className="advisory-head">
            <Info size={13} aria-hidden="true" />
            <span>Advisory calculation</span>
          </div>
          <p>
            Rule set {payload.advisory.ruleSetVersion} · {payload.advisory.jurisdiction}.{" "}
            {payload.advisory.notice}
          </p>
        </div>
      </div>
    </aside>
  );
}

function entitySelection(finding: ValidationResult): Selection {
  if (finding.entityType === "equipment") return { kind: "equipment", id: finding.entityId };
  if (finding.entityType === "route") return { kind: "route", id: finding.entityId };
  if (finding.entityType === "circuit") return { kind: "circuit", id: finding.entityId };
  if (finding.entityType === "room") return { kind: "room", id: finding.entityId };
  return null;
}

function PanelSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="inspector-section">
      <div className="section-head">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

function FindingDetail({
  finding,
  canResolve,
  onClose,
  onResolve,
  onLocate,
}: {
  finding: ValidationResult;
  canResolve: boolean;
  onClose: () => void;
  onResolve: InspectorProps["onResolveValidation"];
  onLocate: () => void;
}) {
  return (
    <div className="finding-detail" data-severity={finding.severity}>
      <div className="finding-detail-head">
        <span className="chip" data-tone={finding.severity === "error" ? "error" : finding.severity}>
          {finding.severity}
        </span>
        <span className="mono">{finding.ruleId}</span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Dismiss finding detail">
          <X size={13} aria-hidden="true" />
        </button>
      </div>
      <p>{finding.message}</p>
      <div className="finding-foot">
        <button type="button" className="btn btn-sm" onClick={onLocate} disabled={finding.entityType === "project"}>
          Locate {findingEntityLabel(finding).toLowerCase()}
        </button>
        {canResolve && finding.status === "open" && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void onResolve(finding.id, "acknowledged")}
          >
            Acknowledge
          </button>
        )}
        {canResolve && finding.status !== "accepted_risk" && finding.status !== "resolved" && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void onResolve(finding.id, "accepted_risk")}
          >
            Accept risk
          </button>
        )}
        {canResolve && finding.status !== "resolved" && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void onResolve(finding.id, "resolved")}
          >
            Resolve
          </button>
        )}
      </div>
      <div className="finding-status mono">Status: {validationStatusLabel(finding.status)}</div>
    </div>
  );
}

function EquipmentPanel({
  payload,
  equipmentId,
  readOnly,
  onSelect,
  onPatch,
  onDelete,
}: {
  payload: WorkspacePayloadClient;
  equipmentId: string;
  readOnly: boolean;
  onSelect: (selection: Selection) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const { workspace, loadSchedule } = payload;
  const equipment = workspace.equipment.find((item) => item.id === equipmentId);
  const [labelDraft, setLabelDraft] = useState(equipment?.label ?? "");
  const [heightDraft, setHeightDraft] = useState(String(equipment?.mountingHeightMm ?? 0));
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setLabelDraft(equipment?.label ?? "");
    setHeightDraft(String(equipment?.mountingHeightMm ?? 0));
    setConfirmDelete(false);
  }, [equipment?.id, equipment?.label, equipment?.mountingHeightMm]);

  if (!equipment) return <div className="empty-state">This device is no longer on the level.</div>;

  const definition = findEquipmentDefinition(equipment.definitionKey);
  const circuit = equipment.circuitId
    ? workspace.circuits.find((entry) => entry.id === equipment.circuitId)
    : undefined;
  const load = loadSchedule.equipment.find((entry) => entry.equipmentId === equipment.id);
  const terminals = workspace.terminals.filter((terminal) => terminal.equipmentId === equipment.id);
  const connections = workspace.connections.filter((connection) =>
    terminals.some(
      (terminal) =>
        terminal.id === connection.fromTerminalId || terminal.id === connection.toTerminalId,
    ),
  );
  const room = workspace.rooms.find((entry) => entry.id === equipment.roomId);
  const findings = openFindings(
    workspace.validations.filter(
      (finding) => finding.entityType === "equipment" && finding.entityId === equipment.id,
    ),
  );
  const dirty =
    labelDraft.trim() !== equipment.label ||
    Number(heightDraft) !== equipment.mountingHeightMm;

  return (
    <>
      <PanelSection title="Identity">
        <div className="equipment-identity">
          <span className="library-glyph" style={{ width: 40, height: 40 }}>
            <GlyphPreview symbol={definition?.symbol ?? "socket"} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>
              {definition?.name ?? equipment.definitionKey}
            </div>
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-muted)", marginTop: 3 }}>
              {definition?.discipline.toUpperCase() ?? "UNKNOWN"} ·{" "}
              {definition?.ipRating ?? "—"}
            </div>
          </div>
        </div>
        <form
          className="inspector-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onPatch(equipment.id, {
              label: labelDraft.trim(),
              mountingHeightMm: Number(heightDraft),
            });
          }}
        >
          <label className="field-row">
            <span className="field-label">Label</span>
            <input
              className="field mono"
              value={labelDraft}
              onChange={(event) => setLabelDraft(event.target.value)}
              maxLength={40}
              disabled={readOnly}
            />
          </label>
          <label className="field-row">
            <span className="field-label">Mounting height (mm)</span>
            <input
              className="field mono"
              type="number"
              min={0}
              max={20000}
              value={heightDraft}
              onChange={(event) => setHeightDraft(event.target.value)}
              disabled={readOnly}
            />
          </label>
          {!readOnly && (
            <div className="inspector-actions">
              <button className="btn btn-sm" type="submit" disabled={!dirty}>
                Save identity
              </button>
            </div>
          )}
        </form>
      </PanelSection>

      <PanelSection title="Circuit assignment">
        <label className="field-row">
          <span className="field-label">Circuit</span>
          <select
            className="field"
            value={equipment.circuitId ?? ""}
            disabled={readOnly}
            onChange={(event) =>
              void onPatch(equipment.id, { circuitId: event.target.value || null })
            }
          >
            <option value="">Unassigned</option>
            {workspace.circuits.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field-grid" style={{ marginTop: 8 }}>
          <label className="field-row" style={{ borderBottom: 0 }}>
            <span className="field-label">Phase</span>
            <select
              className="field"
              value={equipment.phase ?? ""}
              disabled={readOnly}
              onChange={(event) =>
                void onPatch(equipment.id, { phase: event.target.value || null })
              }
            >
              <option value="">Unset</option>
              <option value="L1">L1</option>
              <option value="L2">L2</option>
              <option value="L3">L3</option>
            </select>
          </label>
          <label className="field-row" style={{ borderBottom: 0 }}>
            <span className="field-label">Installation</span>
            <select
              className="field"
              value={equipment.installationState}
              disabled={readOnly}
              onChange={(event) =>
                void onPatch(equipment.id, { installationState: event.target.value })
              }
            >
              {["planned", "installed", "verified", "issue"].map((state) => (
                <option key={state} value={state}>
                  {equipmentStateLabel(state)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {circuit && (
          <button
            type="button"
            className="link-row"
            onClick={() => onSelect({ kind: "circuit", id: circuit.id })}
          >
            <span className="circuit-swatch" style={{ background: circuit.color }} />
            {circuit.name}
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        )}
      </PanelSection>

      <PanelSection title="Load">
        <div className="metric-strip">
          <div className="metric">
            <div className="v">{formatVA(load?.connectedVA ?? 0)}</div>
            <span className="l">Connected</span>
          </div>
          <div className="metric">
            <div className="v">{formatNumber(load?.powerFactor ?? 1, 2)}</div>
            <span className="l">Power factor</span>
          </div>
          <div className="metric">
            <div className="v">{formatMm(equipment.mountingHeightMm)}</div>
            <span className="l">Height</span>
          </div>
        </div>
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>Basis</dt>
          <dd>{load?.loadBasis ?? "—"}</dd>
          <dt>Room</dt>
          <dd>{room?.name ?? "Outside a room polygon"}</dd>
          <dt>Coordinates</dt>
          <dd className="mono">
            {formatNumber(equipment.xMm)} / {formatNumber(equipment.yMm)}
          </dd>
          <dt>Rotation</dt>
          <dd>{equipment.rotationDeg}°</dd>
          <dt>Source</dt>
          <dd>{equipment.source}</dd>
        </dl>
        {definition?.electrical.requiresEarth && (
          <div className="inline-note">
            <Check size={12} aria-hidden="true" />
            Protective earth is required by the generic catalogue.
          </div>
        )}
      </PanelSection>

      <PanelSection title={`Terminals and connections · ${terminals.length}`}>
        <div className="terminal-list">
          {terminals.map((terminal) => {
            const wired = connections.filter(
              (connection) =>
                connection.fromTerminalId === terminal.id || connection.toTerminalId === terminal.id,
            );
            return (
              <div className="terminal-row" key={terminal.id}>
                <span className="terminal-designation mono">{terminal.designation}</span>
                <span>{terminal.function.replaceAll("_", " ")}</span>
                <span className="count mono">
                  {wired.length > 0 ? `${wired.length} linked` : "open"}
                </span>
              </div>
            );
          })}
          {terminals.length === 0 && <div className="empty-state">No terminals defined.</div>}
        </div>
        {connections.length < terminals.length && (
          <div className="inline-note" data-tone="warning">
            <AlertTriangle size={12} aria-hidden="true" />
            Topology coverage is incomplete: {connections.length} recorded link(s) for{" "}
            {terminals.length} terminal(s).
          </div>
        )}
      </PanelSection>

      {findings.length > 0 && (
        <PanelSection title={`Open findings · ${findings.length}`}>
          <FindingList findings={findings} onSelect={onSelect} compact />
        </PanelSection>
      )}

      {!readOnly && (
        <PanelSection title="Removal">
          {confirmDelete ? (
            <div className="confirm-block">
              <strong>Remove {equipment.label}?</strong>
              <p>
                The device and its terminals are deleted. Routes or connections that reference it
                block the operation instead of being removed silently.
              </p>
              <div className="inspector-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => void onDelete(equipment.id)}
                >
                  <Trash2 size={12} aria-hidden="true" /> Remove device
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-quiet"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={12} aria-hidden="true" /> Remove device…
            </button>
          )}
        </PanelSection>
      )}
    </>
  );
}

function CircuitPanel({
  payload,
  circuitId,
  readOnly,
  onSelect,
  onPatch,
  onSizeCable,
}: {
  payload: WorkspacePayloadClient;
  circuitId: string;
  readOnly: boolean;
  onSelect: (selection: Selection) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  onSizeCable: (
    circuitId: string,
    conditions: InstallationConditions,
  ) => Promise<CableSelectionResult | null>;
}) {
  const { workspace, loadSchedule } = payload;
  const circuit = workspace.circuits.find((entry) => entry.id === circuitId);
  const [ambient, setAmbient] = useState(30);
  const [grouped, setGrouped] = useState(2);
  const [insulationFactor, setInsulationFactor] = useState(1);
  const [selection, setSelection] = useState<CableSelectionResult | null>(null);
  const [sizing, setSizing] = useState(false);
  const [breakerDraft, setBreakerDraft] = useState(String(circuit?.breakerRatingA ?? ""));
  const [demandDraft, setDemandDraft] = useState(String(circuit?.demandFactor ?? ""));

  useEffect(() => {
    setSelection(null);
    setBreakerDraft(String(circuit?.breakerRatingA ?? ""));
    setDemandDraft(String(circuit?.demandFactor ?? ""));
  }, [circuit?.id, circuit?.breakerRatingA, circuit?.demandFactor]);

  if (!circuit) return <div className="empty-state">This circuit no longer exists.</div>;

  const load = loadSchedule.circuits.find((entry) => entry.circuitId === circuit.id);
  const members = workspace.equipment.filter((item) => item.circuitId === circuit.id);
  const routeMetres = routeLengthForCircuit(workspace.routes, circuit.id) / 1000;
  const percent = utilization(circuit, load?.currentA ?? 0);
  const tone = utilizationTone(percent);
  const findings = openFindings(
    workspace.validations.filter(
      (finding) => finding.entityType === "circuit" && finding.entityId === circuit.id,
    ),
  );

  return (
    <>
      <PanelSection title="Schedule">
        <div className="metric-strip">
          <div className="metric">
            <div className="v">{formatVA(load?.connectedVA ?? 0)}</div>
            <span className="l">Connected</span>
          </div>
          <div className="metric">
            <div className="v">{formatVA(load?.demandVA ?? 0)}</div>
            <span className="l">Demand</span>
          </div>
          <div className="metric">
            <div className="v">{formatNumber(load?.currentA ?? 0, 1)} A</div>
            <span className="l">Design current</span>
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="util-row">
            <span>Breaker utilization</span>
            <span className="mono" data-tone={tone}>
              {formatPercent(percent, 0)}
            </span>
          </div>
          <div className="load-bar">
            <span data-tone={tone} style={{ width: `${Math.min(100, Math.max(2, percent))}%` }} />
          </div>
        </div>
        <dl className="kv" style={{ marginTop: 12 }}>
          <dt>Type</dt>
          <dd>{circuit.type.replaceAll("_", " ")}</dd>
          <dt>Phase mode</dt>
          <dd>{circuit.phaseMode === "three_phase" ? "Three phase" : "Single phase"}</dd>
          <dt>Demand factor</dt>
          <dd className="mono">{formatNumber(circuit.demandFactor, 2)}</dd>
          <dt>Connected items</dt>
          <dd>{members.length}</dd>
          <dt>Routed length</dt>
          <dd className="mono">{formatMetres(routeMetres)}</dd>
          <dt>Cable</dt>
          <dd className="mono">
            {circuit.cableTypeKey} · {circuit.cableSectionMm2} mm²
          </dd>
          <dt>Protection</dt>
          <dd className="mono">
            {circuit.breakerRatingA} A {circuit.breakerCurve}
            {circuit.rcdSensitivityMa ? ` · ${circuit.rcdSensitivityMa} mA` : ""}
          </dd>
        </dl>
        {!readOnly && (
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              void onPatch(circuit.id, {
                breakerRatingA: Number(breakerDraft),
                demandFactor: Number(demandDraft),
              });
            }}
          >
            <label>
              <span className="field-label">Breaker (A)</span>
              <select
                className="field"
                value={breakerDraft}
                onChange={(event) => setBreakerDraft(event.target.value)}
              >
                {BREAKER_RATINGS_A.map((rating) => (
                  <option key={rating} value={rating}>
                    {rating} A
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Demand factor</span>
              <input
                className="field mono"
                type="number"
                min={0.01}
                max={1}
                step={0.01}
                value={demandDraft}
                onChange={(event) => setDemandDraft(event.target.value)}
              />
            </label>
            <button className="btn btn-sm" type="submit">
              Apply
            </button>
          </form>
        )}
      </PanelSection>

      <PanelSection
        title="Cable selection"
        action={<Cable size={13} aria-hidden="true" />}
      >
        <p className="section-note">
          PVC copper, reference method C only. Selection checks In ≤ Iz and voltage drop; it does
          not verify fault-loop impedance, disconnection time or selectivity.
        </p>
        <div className="cable-form">
          <label>
            <span className="field-label">Ambient °C</span>
            <input
              className="field mono"
              type="number"
              min={-10}
              max={60}
              value={ambient}
              onChange={(event) => setAmbient(Number(event.target.value))}
            />
          </label>
          <label>
            <span className="field-label">Grouped</span>
            <input
              className="field mono"
              type="number"
              min={1}
              max={20}
              value={grouped}
              onChange={(event) => setGrouped(Number(event.target.value))}
            />
          </label>
          <label>
            <span className="field-label">Insulation factor</span>
            <input
              className="field mono"
              type="number"
              min={0.1}
              max={1}
              step={0.05}
              value={insulationFactor}
              onChange={(event) => setInsulationFactor(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="inspector-actions">
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={sizing}
            onClick={async () => {
              setSizing(true);
              try {
                const result = await onSizeCable(circuit.id, {
                  ambientTempC: ambient,
                  groupedCircuits: grouped,
                  thermalInsulationFactor: insulationFactor,
                });
                setSelection(result);
              } finally {
                setSizing(false);
              }
            }}
          >
            {sizing ? "Checking…" : "Run selection"}
          </button>
        </div>
        {selection && (
          <div className="cable-result">
            <div className="cable-result-head">
              {selection.selectedSectionMm2 ? (
                <>
                  <Check size={14} aria-hidden="true" />
                  <strong>{selection.selectedSectionMm2} mm² selected</strong>
                </>
              ) : (
                <>
                  <CircleAlert size={14} aria-hidden="true" />
                  <strong>No section satisfies both checks</strong>
                </>
              )}
            </div>
            <p>{selection.reason}</p>
            {selection.voltageDrop && (
              <dl className="kv">
                <dt>Voltage drop</dt>
                <dd className="mono">{formatPercent(selection.voltageDrop.percent, 2)}</dd>
                <dt>Final Iz</dt>
                <dd className="mono">{formatNumber(selection.finalAmpacityA ?? 0, 1)} A</dd>
              </dl>
            )}
            <details className="candidate-details">
              <summary>Candidate sections · {selection.candidates.length}</summary>
              <table className="candidate-table">
                <thead>
                  <tr>
                    <th>mm²</th>
                    <th>Iz</th>
                    <th>ΔU</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {selection.candidates.map((candidate) => (
                    <tr key={candidate.sectionMm2} data-accepted={candidate.accepted}>
                      <td className="mono">{candidate.sectionMm2}</td>
                      <td className="mono">{formatNumber(candidate.deratedAmpacityA, 1)}</td>
                      <td className="mono">{candidate.voltageDropPercent.toFixed(2)}%</td>
                      <td>{candidate.accepted ? "OK" : candidate.rejectedBecause ? "Rejected" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
            {!readOnly &&
              selection.selectedSectionMm2 &&
              selection.selectedSectionMm2 !== circuit.cableSectionMm2 && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() =>
                    void onPatch(circuit.id, { cableSectionMm2: selection.selectedSectionMm2 })
                  }
                >
                  Apply {selection.selectedSectionMm2} mm² to circuit
                </button>
              )}
          </div>
        )}
      </PanelSection>

      <PanelSection title={`Connected devices · ${members.length}`}>
        <div className="member-list">
          {members.map((item) => (
            <button
              key={item.id}
              type="button"
              className="link-row"
              onClick={() => onSelect({ kind: "equipment", id: item.id })}
            >
              <span className="member-label mono">{item.label}</span>
              <span className="member-name">
                {findEquipmentDefinition(item.definitionKey)?.shortName ?? item.definitionKey}
              </span>
              <ChevronRight size={12} aria-hidden="true" />
            </button>
          ))}
          {members.length === 0 && (
            <div className="empty-state">No equipment is assigned to this circuit.</div>
          )}
        </div>
      </PanelSection>

      {findings.length > 0 && (
        <PanelSection title={`Open findings · ${findings.length}`}>
          <FindingList findings={findings} onSelect={onSelect} compact />
        </PanelSection>
      )}
    </>
  );
}

function RoutePanel({
  payload,
  routeId,
  readOnly,
  onSelect,
  onPatch,
  onStatus,
}: {
  payload: WorkspacePayloadClient;
  routeId: string;
  readOnly: boolean;
  onSelect: (selection: Selection) => void;
  onPatch: (id: string, patch: Record<string, unknown>) => Promise<boolean>;
  onStatus: (id: string, status: Route["status"]) => Promise<boolean>;
}) {
  const { workspace } = payload;
  const route = workspace.routes.find((entry) => entry.id === routeId);
  const [slack, setSlack] = useState(String(route?.slackPercent ?? 10));

  useEffect(() => setSlack(String(route?.slackPercent ?? 10)), [route?.id, route?.slackPercent]);

  if (!route) return <div className="empty-state">This route no longer exists.</div>;

  const circuit = route.circuitId
    ? workspace.circuits.find((entry) => entry.id === route.circuitId)
    : undefined;
  const from = route.fromEquipmentId
    ? workspace.equipment.find((item) => item.id === route.fromEquipmentId)
    : undefined;
  const to = route.toEquipmentId
    ? workspace.equipment.find((item) => item.id === route.toEquipmentId)
    : undefined;
  const findings = openFindings(
    workspace.validations.filter(
      (finding) => finding.entityType === "route" && finding.entityId === route.id,
    ),
  );
  const transitions = ROUTE_TRANSITIONS[route.status] ?? [];

  return (
    <>
      <PanelSection title="Geometry">
        <div className="metric-strip">
          <div className="metric">
            <div className="v">{formatMetres(route.lengthMm / 1000)}</div>
            <span className="l">Measured</span>
          </div>
          <div className="metric">
            <div className="v">{route.points.length}</div>
            <span className="l">Points</span>
          </div>
          <div className="metric">
            <div className="v">{formatPercent(route.slackPercent, 0)}</div>
            <span className="l">Slack</span>
          </div>
        </div>
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>Status</dt>
          <dd>
            <span className="chip" data-tone={route.status === "validated" || route.status === "installed" ? "ok" : "info"}>
              {routeStatusLabel(route.status)}
            </span>
          </dd>
          <dt>From</dt>
          <dd>{from?.label ?? "Unanchored"}</dd>
          <dt>To</dt>
          <dd>{to?.label ?? "Unanchored"}</dd>
          <dt>Method</dt>
          <dd>{route.method.replaceAll("_", " ")}</dd>
          <dt>Validated</dt>
          <dd>{formatDate(route.validatedAt)}</dd>
          <dt>Rule set</dt>
          <dd className="mono">{route.validatedRuleSetVersion ?? "—"}</dd>
        </dl>
        {route.diagnostics.length > 0 && (
          <div className="diagnostic-list">
            {route.diagnostics.map((diagnostic, index) => (
              <div className="diagnostic" data-severity={diagnostic.severity} key={`${diagnostic.code}-${index}`}>
                <span className="mono">{diagnostic.code}</span>
                <span>{diagnostic.message}</span>
              </div>
            ))}
          </div>
        )}
      </PanelSection>

      <PanelSection title="Installation">
        <label className="field-row">
          <span className="field-label">Circuit</span>
          <select
            className="field"
            value={route.circuitId ?? ""}
            disabled={readOnly || route.status === "installed"}
            onChange={(event) => void onPatch(route.id, { circuitId: event.target.value || null })}
          >
            <option value="">Unassigned</option>
            {workspace.circuits.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-row">
          <span className="field-label">Containment</span>
          <select
            className="field"
            value={route.conduitKey ?? ""}
            disabled={readOnly}
            onChange={(event) => void onPatch(route.id, { conduitKey: event.target.value || null })}
          >
            <option value="">None</option>
            {CONDUIT_TYPES.map((conduit) => (
              <option key={conduit.key} value={conduit.key}>
                {conduit.name}
              </option>
            ))}
          </select>
        </label>
        {circuit && (
          <button
            type="button"
            className="link-row"
            onClick={() => onSelect({ kind: "circuit", id: circuit.id })}
          >
            <span className="circuit-swatch" style={{ background: circuit.color }} />
            {circuit.name}
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        )}
        {!readOnly && (
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              void onPatch(route.id, { slackPercent: Number(slack) });
            }}
          >
            <label>
              <span className="field-label">Slack %</span>
              <input
                className="field mono"
                type="number"
                min={0}
                max={50}
                value={slack}
                onChange={(event) => setSlack(event.target.value)}
              />
            </label>
            <button className="btn btn-sm" type="submit">
              Apply slack
            </button>
          </form>
        )}
      </PanelSection>

      <PanelSection title="Lifecycle">
        <p className="section-note">
          Validation checks geometry and circuit assignment. It is not an engineering approval and
          does not certify compliance.
        </p>
        <div className="inspector-actions">
          {transitions.map((target) => (
            <button
              key={target}
              type="button"
              className={`btn btn-sm ${target === "validated" ? "btn-primary" : ""}`}
              disabled={readOnly || (target === "validated" && !route.circuitId)}
              onClick={() => void onStatus(route.id, target)}
              title={
                readOnly
                  ? "Your role cannot change route status."
                  : target === "validated" && !route.circuitId
                    ? "Assign a circuit before validating."
                    : undefined
              }
            >
              {routeStatusLabel(target)}
            </button>
          ))}
          {transitions.length === 0 && (
            <span className="mono" style={{ fontSize: 9, color: "var(--ink-muted)" }}>
              Installed routes are locked.
            </span>
          )}
        </div>
        {!route.circuitId && route.status !== "installed" && (
          <div className="inline-note" data-tone="warning">
            <AlertTriangle size={12} aria-hidden="true" />
            A route cannot be validated without a circuit.
          </div>
        )}
      </PanelSection>

      {findings.length > 0 && (
        <PanelSection title={`Open findings · ${findings.length}`}>
          <FindingList findings={findings} onSelect={onSelect} compact />
        </PanelSection>
      )}
    </>
  );
}

function RoomPanel({
  payload,
  roomId,
  onSelect,
}: {
  payload: WorkspacePayloadClient;
  roomId: string;
  onSelect: (selection: Selection) => void;
}) {
  const room = payload.workspace.rooms.find((entry) => entry.id === roomId);
  if (!room) return <div className="empty-state">This room no longer exists.</div>;
  const bounds = polygonBounds(room.polygon);
  const members = payload.workspace.equipment.filter((item) => item.roomId === room.id);
  const findings = openFindings(
    payload.workspace.validations.filter(
      (finding) => finding.entityType === "room" && finding.entityId === room.id,
    ),
  );
  return (
    <>
      <PanelSection title="Room data">
        <dl className="kv">
          <dt>Number</dt>
          <dd className="mono">{room.number}</dd>
          <dt>Occupancy</dt>
          <dd>{occupancyLabel(room.occupancy)}</dd>
          <dt>Area</dt>
          <dd className="mono">{formatNumber(polygonAreaMm2(room.polygon) / 1_000_000, 1)} m²</dd>
          <dt>Envelope</dt>
          <dd className="mono">
            {formatNumber(bounds.width)} × {formatNumber(bounds.height)} mm
          </dd>
          <dt>Clear height</dt>
          <dd className="mono">{formatMm(room.clearHeightMm)}</dd>
          <dt>Devices</dt>
          <dd>{members.length}</dd>
        </dl>
        {room.notes && <p className="section-note">{room.notes}</p>}
      </PanelSection>
      <PanelSection title={`Devices in room · ${members.length}`}>
        <div className="member-list">
          {members.map((item) => (
            <button
              key={item.id}
              type="button"
              className="link-row"
              onClick={() => onSelect({ kind: "equipment", id: item.id })}
            >
              <span className="member-label mono">{item.label}</span>
              <span className="member-name">
                {findEquipmentDefinition(item.definitionKey)?.shortName ?? item.definitionKey}
              </span>
              <ChevronRight size={12} aria-hidden="true" />
            </button>
          ))}
          {members.length === 0 && <div className="empty-state">No devices are placed in this room.</div>}
        </div>
      </PanelSection>
      {findings.length > 0 && (
        <PanelSection title={`Open findings · ${findings.length}`}>
          <FindingList findings={findings} onSelect={onSelect} compact />
        </PanelSection>
      )}
    </>
  );
}

function WallPanel({ payload, wallId }: { payload: WorkspacePayloadClient; wallId: string }) {
  const wall = payload.workspace.walls.find((entry) => entry.id === wallId);
  if (!wall) return <div className="empty-state">This wall no longer exists.</div>;
  const length = Math.hypot(wall.endX - wall.startX, wall.endY - wall.startY);
  return (
    <PanelSection title="Wall data">
      <dl className="kv">
        <dt>Kind</dt>
        <dd>{wallKindLabel(wall.kind)}</dd>
        <dt>Material</dt>
        <dd>{wall.material}</dd>
        <dt>Length</dt>
        <dd className="mono">{formatMetres(length / 1000, 2)}</dd>
        <dt>Thickness</dt>
        <dd className="mono">{formatMm(wall.thicknessMm)}</dd>
        <dt>Height</dt>
        <dd className="mono">{formatMm(wall.heightMm)}</dd>
        <dt>Load bearing</dt>
        <dd>{wall.loadBearing ? "Yes" : "No"}</dd>
        <dt>Penetration</dt>
        <dd>{wall.allowPenetration ? "Declared" : "Not declared"}</dd>
      </dl>
      <div className="inline-note" data-tone={wall.allowPenetration ? undefined : "warning"}>
        <Ruler size={12} aria-hidden="true" />
        A route crossing this wall{" "}
        {wall.allowPenetration
          ? "records a declared penetration finding."
          : "is reported as a blocking warning until the penetration is declared."}
      </div>
    </PanelSection>
  );
}

function ProjectPanel({
  payload,
  onOpenFindings,
  onSelect,
}: {
  payload: WorkspacePayloadClient;
  onOpenFindings: () => void;
  onSelect: (selection: Selection) => void;
}) {
  const { workspace, stats, loadSchedule, takeoff } = payload;
  const project = workspace.project;
  const open = openFindings(workspace.validations);
  const boards = workspace.equipment.filter(
    (item) => findEquipmentDefinition(item.definitionKey)?.category === "distribution_board",
  );
  return (
    <>
      <PanelSection title="Supply">
        <dl className="kv">
          <dt>Client</dt>
          <dd>{project.clientName || "—"}</dd>
          <dt>Address</dt>
          <dd>{project.address || "—"}</dd>
          <dt>Jurisdiction</dt>
          <dd>{project.jurisdiction}</dd>
          <dt>Supply</dt>
          <dd className="mono">
            {project.phaseVoltageV}/{project.lineVoltageV} V · {project.frequencyHz} Hz
          </dd>
          <dt>Earthing</dt>
          <dd>{project.earthingSystem}</dd>
          <dt>ΔU limit</dt>
          <dd className="mono">
            {formatPercent(project.voltageDropLimitLightingPct)} lighting /{" "}
            {formatPercent(project.voltageDropLimitOtherPct)} other
          </dd>
        </dl>
      </PanelSection>
      <PanelSection title="This sheet">
        <div className="metric-strip">
          <div className="metric">
            <div className="v">{stats.equipment}</div>
            <span className="l">Devices</span>
          </div>
          <div className="metric">
            <div className="v">{stats.routes}</div>
            <span className="l">Routes</span>
          </div>
          <div className="metric">
            <div className="v">{stats.connections}</div>
            <span className="l">Links</span>
          </div>
        </div>
        <dl className="kv" style={{ marginTop: 10 }}>
          <dt>Connected</dt>
          <dd className="mono">{formatVA(loadSchedule.totalConnectedVA)}</dd>
          <dt>Demand</dt>
          <dd className="mono">{formatVA(loadSchedule.totalDemandVA)}</dd>
          <dt>Cable</dt>
          <dd className="mono">{formatMetres(takeoff.totals.cableMetres)}</dd>
          <dt>Containment</dt>
          <dd className="mono">{formatMetres(takeoff.totals.containmentMetres)}</dd>
          <dt>Phases</dt>
          <dd className="mono">
            L1 {formatNumber(loadSchedule.phaseTotalsA.L1, 1)} · L2{" "}
            {formatNumber(loadSchedule.phaseTotalsA.L2, 1)} · L3{" "}
            {formatNumber(loadSchedule.phaseTotalsA.L3, 1)} A
          </dd>
        </dl>
      </PanelSection>
      {boards.length > 0 && (
        <PanelSection title="Distribution boards">
          {boards.map((board) => (
            <button
              key={board.id}
              type="button"
              className="link-row"
              onClick={() => onSelect({ kind: "equipment", id: board.id })}
            >
              <span className="member-label mono">{board.label}</span>
              <span className="member-name">{board.definitionKey}</span>
              <ChevronRight size={12} aria-hidden="true" />
            </button>
          ))}
        </PanelSection>
      )}
      <PanelSection title="Open evidence">
        <div className="finding-tally">
          <span data-tone="error">{stats.errors} error</span>
          <span data-tone="warning">{stats.warnings} warning</span>
          <span data-tone="info">{stats.infos} info</span>
        </div>
        <p className="section-note">
          Findings are advisory. Acknowledging or resolving one records a decision; it does not
          make the installation compliant.
        </p>
        <button type="button" className="btn btn-sm" onClick={onOpenFindings}>
          Open findings register
          <ChevronRight size={12} aria-hidden="true" />
        </button>
        {open.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <FindingList findings={open.slice(0, 3)} onSelect={onSelect} compact />
          </div>
        )}
      </PanelSection>
    </>
  );
}

function FindingList({
  findings,
  onSelect,
  compact,
}: {
  findings: ValidationResult[];
  onSelect: (selection: Selection) => void;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "finding-list compact" : "finding-list"}>
      {findings.map((finding) => (
        <button
          key={finding.id}
          type="button"
          className="finding"
          data-severity={finding.severity}
          onClick={() => onSelect(entitySelection(finding))}
        >
          <span className="finding-head">
            <span className="chip" data-tone={finding.severity === "error" ? "error" : finding.severity}>
              {finding.severity}
            </span>
            <span className="finding-rule">{finding.ruleId}</span>
          </span>
          <span className="finding-msg">{finding.message}</span>
        </button>
      ))}
    </div>
  );
}
