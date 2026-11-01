"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import type { Circuit } from "@vectrix/core";
import type { WorkspacePayloadClient } from "@/lib/workspace-types";
import {
  formatMetres,
  formatNumber,
  formatPercent,
  formatVA,
  utilization,
  utilizationTone,
} from "@/lib/format";
import { circuitTypeLabel, openFindings } from "./helpers";

export function CircuitsView({
  payload,
  selectionId,
  activeCircuitId,
  canWrite,
  canValidate,
  onSelectCircuit,
  onIsolate,
  onNewCircuit,
  onRunValidation,
  pending,
}: {
  payload: WorkspacePayloadClient;
  selectionId: string | null;
  activeCircuitId: string | null;
  canWrite: boolean;
  canValidate: boolean;
  onSelectCircuit: (circuitId: string) => void;
  onIsolate: (circuitId: string) => void;
  onNewCircuit: () => void;
  onRunValidation: () => void;
  pending: boolean;
}) {
  const [query, setQuery] = useState("");
  const { workspace, loadSchedule } = payload;

  const loads = useMemo(
    () => new Map(loadSchedule.circuits.map((row) => [row.circuitId, row])),
    [loadSchedule],
  );

  const routeMetres = useMemo(() => {
    const totals = new Map<string, number>();
    for (const route of workspace.routes) {
      if (!route.circuitId) continue;
      totals.set(route.circuitId, (totals.get(route.circuitId) ?? 0) + route.lengthMm);
    }
    return new Map([...totals].map(([id, mm]) => [id, mm / 1000]));
  }, [workspace.routes]);

  const findingsByCircuit = useMemo(() => {
    const totals = new Map<string, number>();
    for (const finding of openFindings(workspace.validations)) {
      if (finding.entityType !== "circuit") continue;
      totals.set(finding.entityId, (totals.get(finding.entityId) ?? 0) + 1);
    }
    return totals;
  }, [workspace.validations]);

  const rooms = useMemo(
    () => new Map(workspace.rooms.map((room) => [room.id, room])),
    [workspace.rooms],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return workspace.circuits;
    return workspace.circuits.filter((circuit) => {
      const load = loads.get(circuit.id);
      return [circuit.name, circuit.type, circuit.description, load?.circuitName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [workspace.circuits, loads, query]);

  const connectedVA = loadSchedule.totalConnectedVA;
  const demandVA = loadSchedule.totalDemandVA;
  const overloaded = workspace.circuits.filter((circuit) => {
    const current = loads.get(circuit.id)?.currentA ?? 0;
    return current > circuit.breakerRatingA;
  }).length;
  const unassigned = workspace.equipment.filter((item) => item.circuitId === null).length;

  return (
    <div className="view-panel">
      <div className="view-head">
        <div>
          <div className="view-kicker">Electrical / distribution</div>
          <h1 className="view-title">Circuit schedule</h1>
          <p className="view-sub">
            One row per way in the board. Connected load is read from placed equipment; demand uses
            the recorded factor. Breaker utilization is a comparison, not a verified co-ordination
            study.
          </p>
        </div>
        <div className="view-actions">
          <button
            type="button"
            className="btn"
            onClick={onRunValidation}
            disabled={pending || !canValidate}
            title={canValidate ? "Re-run the advisory rule set" : "Your role cannot run validation"}
          >
            <RefreshCw size={14} aria-hidden="true" />
            {pending ? "Checking…" : "Re-run validation"}
          </button>
          {canWrite && (
            <button type="button" className="btn btn-primary" onClick={onNewCircuit}>
              <Plus size={14} aria-hidden="true" />
              New circuit
            </button>
          )}
        </div>
      </div>

      <div className="view-summary">
        <div className="view-metric">
          <span className="l">Circuits</span>
          <strong>{formatNumber(workspace.circuits.length)}</strong>
          <span className="s">{unassigned} unassigned device{unassigned === 1 ? "" : "s"}</span>
        </div>
        <div className="view-metric">
          <span className="l">Connected</span>
          <strong>{formatVA(connectedVA)}</strong>
          <span className="s">catalogue + overrides</span>
        </div>
        <div className="view-metric">
          <span className="l">Demand</span>
          <strong>{formatVA(demandVA)}</strong>
          <span className="s">recorded factors</span>
        </div>
        <div className="view-metric" data-tone={overloaded > 0 ? "error" : undefined}>
          <span className="l">Above breaker</span>
          <strong>{overloaded}</strong>
          <span className="s">{overloaded > 0 ? "review design current" : "within rating"}</span>
        </div>
      </div>

      <div className="register">
        <div className="register-toolbar">
          <div className="search-box">
            <Search size={13} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter circuits"
              aria-label="Filter circuits"
            />
          </div>
          <span className="register-count mono">
            {filtered.length} / {workspace.circuits.length}
          </span>
          <span className="register-note">
            <ShieldCheck size={12} aria-hidden="true" /> Advisory schedule
          </span>
        </div>

        <div className="register-scroll">
          <table className="register-table circuit-table">
            <thead>
              <tr>
                <th scope="col">Circuit</th>
                <th scope="col">Protection</th>
                <th scope="col">Cable</th>
                <th scope="col" className="num">Connected</th>
                <th scope="col" className="num">Demand</th>
                <th scope="col" className="num">Current</th>
                <th scope="col">Utilization</th>
                <th scope="col" className="num">Route</th>
                <th scope="col" className="num">Findings</th>
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((circuit) => {
                const load = loads.get(circuit.id);
                const current = load?.currentA ?? 0;
                const percent = utilization(circuit, current);
                const tone = utilizationTone(percent);
                const members = workspace.equipment.filter((item) => item.circuitId === circuit.id);
                const findingCount = findingsByCircuit.get(circuit.id) ?? 0;
                return (
                  <tr
                    key={circuit.id}
                    data-active={selectionId === circuit.id}
                    data-isolated={activeCircuitId === circuit.id}
                    tabIndex={0}
                    onClick={() => onSelectCircuit(circuit.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelectCircuit(circuit.id);
                      }
                    }}
                  >
                    <td>
                      <div className="circuit-cell">
                        <span className="circuit-bar" style={{ background: circuit.color }} />
                        <span>
                          <span className="circuit-name">{circuit.name}</span>
                          <span className="circuit-meta">
                            {circuitTypeLabel(circuit.type)} · {members.length} device
                            {members.length === 1 ? "" : "s"}
                            {circuit.phaseMode === "three_phase" ? " · 3φ" : " · 1φ"}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="mono">
                      {formatNumber(circuit.breakerRatingA)} A {circuit.breakerCurve}
                      {circuit.rcdSensitivityMa ? ` · ${circuit.rcdSensitivityMa} mA` : ""}
                    </td>
                    <td className="mono">
                      {circuit.cableSectionMm2} mm²
                      <span className="cell-sub">{circuit.cableTypeKey}</span>
                    </td>
                    <td className="num mono">{formatVA(load?.connectedVA ?? 0)}</td>
                    <td className="num mono">{formatVA(load?.demandVA ?? 0)}</td>
                    <td className="num mono">
                      {formatNumber(current, 1)} A
                      {current > circuit.breakerRatingA && (
                        <AlertTriangle
                          size={11}
                          aria-label="Design current exceeds breaker rating"
                          style={{ color: "var(--danger)", marginLeft: 4 }}
                        />
                      )}
                    </td>
                    <td>
                      <div className="util-cell">
                        <div className="load-bar" style={{ width: 76 }}>
                          <span
                            data-tone={tone}
                            style={{ width: `${Math.min(100, Math.max(2, percent))}%` }}
                          />
                        </div>
                        <span className="mono" data-tone={tone}>
                          {formatPercent(percent, 0)}
                        </span>
                      </div>
                    </td>
                    <td className="num mono">
                      {formatMetres(routeMetres.get(circuit.id) ?? 0, 1)}
                    </td>
                    <td className="num">
                      {findingCount > 0 ? (
                        <span className="chip" data-tone={overloaded ? "warning" : "info"}>
                          {findingCount}
                        </span>
                      ) : (
                        <span className="dash">—</span>
                      )}
                    </td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn btn-sm btn-quiet"
                        title="Isolate this circuit on the plan drawing"
                        onClick={(event) => {
                          event.stopPropagation();
                          onIsolate(circuit.id);
                        }}
                      >
                        Isolate
                        <ArrowUpRight size={12} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state">
                      <strong>
                        {workspace.circuits.length === 0 ? "No circuits yet" : "No circuit matches"}
                      </strong>
                      {workspace.circuits.length === 0
                        ? canWrite
                          ? "Create the first circuit to group equipment and routes."
                          : "No circuits are recorded for this project."
                        : "Clear the filter or create a circuit."}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="view-footnote">
        <span className="mono">Load method {loadSchedule.methodVersion}</span>
        <span>
          Phase totals · L1 {formatNumber(loadSchedule.phaseTotalsA.L1, 1)} A · L2{" "}
          {formatNumber(loadSchedule.phaseTotalsA.L2, 1)} A · L3{" "}
          {formatNumber(loadSchedule.phaseTotalsA.L3, 1)} A
        </span>
        <span>{rooms.size} rooms on this level</span>
      </div>
    </div>
  );
}
