"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  Info,
  LocateFixed,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { LevelWorkspace, ValidationResult } from "@vectrix/core";
import type { WorkspacePayloadClient } from "@/lib/workspace-types";
import { formatDate } from "@/lib/format";
import {
  findingEntityLabel,
  openFindings,
  sortFindings,
  validationStatusLabel,
} from "./helpers";

type SeverityFilter = "all" | ValidationResult["severity"];
type StatusFilter = "active" | "resolved" | "all";

const SEVERITY_LABEL: Record<ValidationResult["severity"], string> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
};

function entityName(finding: ValidationResult, workspace: LevelWorkspace): string {
  switch (finding.entityType) {
    case "equipment":
      return (
        workspace.equipment.find((item) => item.id === finding.entityId)?.label ??
        finding.entityId
      );
    case "circuit":
      return (
        workspace.circuits.find((item) => item.id === finding.entityId)?.name ??
        finding.entityId
      );
    case "room":
      return (
        workspace.rooms.find((item) => item.id === finding.entityId)?.name ?? finding.entityId
      );
    case "route":
      return `RTE-${finding.entityId.replace(/^rte_/, "").toUpperCase()}`;
    case "connection":
      return finding.entityId;
    default:
      return workspace.project.code;
  }
}

function entityDetail(finding: ValidationResult): string {
  if (finding.entityType === "project") return "Project-wide finding";
  return finding.entityId;
}

export function FindingsView({
  payload,
  focusValidationId,
  canValidate,
  canResolve,
  onLocate,
  onResolve,
  onRunValidation,
  pending,
}: {
  payload: WorkspacePayloadClient;
  focusValidationId: string | null;
  canValidate: boolean;
  canResolve: boolean;
  onLocate: (finding: ValidationResult) => void;
  onResolve: (
    id: string,
    status: "acknowledged" | "accepted_risk" | "resolved",
  ) => Promise<boolean>;
  onRunValidation: () => void;
  pending: boolean;
}) {
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [query, setQuery] = useState("");
  const { workspace } = payload;

  const all = useMemo(() => sortFindings(workspace.validations), [workspace.validations]);
  const active = useMemo(() => openFindings(workspace.validations), [workspace.validations]);

  const counts = useMemo(
    () => ({
      errors: active.filter((finding) => finding.severity === "error").length,
      warnings: active.filter((finding) => finding.severity === "warning").length,
      infos: active.filter((finding) => finding.severity === "info").length,
      acknowledged: all.filter((finding) => finding.status === "acknowledged").length,
      accepted: all.filter((finding) => finding.status === "accepted_risk").length,
      resolved: all.filter((finding) => finding.status === "resolved").length,
    }),
    [active, all],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return all.filter((finding) => {
      if (severity !== "all" && finding.severity !== severity) return false;
      if (status === "active" && finding.status === "resolved") return false;
      if (status === "resolved" && finding.status !== "resolved") return false;
      if (!needle) return true;
      return [finding.message, finding.ruleId, entityName(finding, workspace), finding.entityType]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [all, severity, status, query, workspace]);

  const severityOptions: Array<{ key: SeverityFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: active.length },
    { key: "error", label: "Errors", count: counts.errors },
    { key: "warning", label: "Warnings", count: counts.warnings },
    { key: "info", label: "Info", count: counts.infos },
  ];

  return (
    <div className="view-panel">
      <div className="view-head">
        <div>
          <div className="view-kicker">Assurance / evidence</div>
          <h1 className="view-title">Findings register</h1>
          <p className="view-sub">
            Every finding comes from the current model and a named rule set. Acknowledging,
            accepting a risk or resolving records a project decision. It does not make the
            installation compliant and it is not an engineering approval.
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
            <RefreshCw
              size={14}
              aria-hidden="true"
              className={pending ? "is-spinning" : undefined}
            />
            {pending ? "Checking…" : "Re-run validation"}
          </button>
        </div>
      </div>

      <div className="view-summary">
        <div className="view-metric" data-tone={counts.errors > 0 ? "error" : "ok"}>
          <span className="l">Errors</span>
          <strong>{counts.errors}</strong>
          <span className="s">blocking design review</span>
        </div>
        <div className="view-metric" data-tone={counts.warnings > 0 ? "warning" : undefined}>
          <span className="l">Warnings</span>
          <strong>{counts.warnings}</strong>
          <span className="s">review before issue</span>
        </div>
        <div className="view-metric">
          <span className="l">Information</span>
          <strong>{counts.infos}</strong>
          <span className="s">coverage and status notes</span>
        </div>
        <div className="view-metric">
          <span className="l">Decisions</span>
          <strong>{counts.acknowledged + counts.accepted}</strong>
          <span className="s">
            {counts.acknowledged} acknowledged · {counts.accepted} accepted risk
          </span>
        </div>
      </div>

      <div className="register">
        <div className="register-toolbar">
          <div className="search-box">
            <Search size={13} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by rule, message or entity"
              aria-label="Filter findings"
            />
          </div>
          <div className="filter-seg" role="group" aria-label="Filter by severity">
            {severityOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                data-active={severity === option.key}
                aria-pressed={severity === option.key}
                onClick={() => setSeverity(option.key)}
              >
                {option.label} <span>{option.count}</span>
              </button>
            ))}
          </div>
          <div className="filter-seg" role="group" aria-label="Filter by status">
            {(
              [
                ["active", "Active"],
                ["resolved", `Resolved ${counts.resolved}`],
                ["all", "All"],
              ] as Array<[StatusFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                data-active={status === key}
                aria-pressed={status === key}
                onClick={() => setStatus(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="register-count mono">
            {filtered.length} / {all.length}
          </span>
          <span className="register-note">
            <ShieldCheck size={12} aria-hidden="true" /> Rule set {payload.advisory.ruleSetVersion}
          </span>
        </div>

        <div className="register-scroll">
          <table className="register-table findings-table">
            <thead>
              <tr>
                <th scope="col">Severity</th>
                <th scope="col">Rule</th>
                <th scope="col">Entity</th>
                <th scope="col">Finding</th>
                <th scope="col">Status</th>
                <th scope="col">Decided</th>
                <th scope="col" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((finding) => {
                const resolved = finding.status === "resolved";
                return (
                  <tr
                    key={finding.id}
                    data-active={focusValidationId === finding.id}
                    data-severity={finding.severity}
                    tabIndex={0}
                    onClick={() => onLocate(finding)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onLocate(finding);
                      }
                    }}
                  >
                    <td>
                      <span
                        className="chip"
                        data-tone={
                          finding.severity === "error" ? "error" : finding.severity
                        }
                      >
                        {finding.severity === "error" ? (
                          <CircleAlert size={9} aria-hidden="true" />
                        ) : finding.severity === "warning" ? (
                          <AlertTriangle size={9} aria-hidden="true" />
                        ) : (
                          <Info size={9} aria-hidden="true" />
                        )}
                        {SEVERITY_LABEL[finding.severity]}
                      </span>
                    </td>
                    <td className="mono rule-cell">{finding.ruleId}</td>
                    <td>
                      <span className="finding-entity">{entityName(finding, workspace)}</span>
                      <span className="cell-sub">
                        {findingEntityLabel(finding)} · {entityDetail(finding)}
                      </span>
                    </td>
                    <td className="finding-cell">
                      <span className="finding-message">{finding.message}</span>
                    </td>
                    <td>
                      <span
                        className="chip"
                        data-tone={
                          resolved
                            ? "ok"
                            : finding.status === "accepted_risk"
                              ? "warning"
                              : finding.status === "acknowledged"
                                ? "info"
                                : undefined
                        }
                      >
                        {resolved && <Check size={9} aria-hidden="true" />}
                        {validationStatusLabel(finding.status)}
                      </span>
                    </td>
                    <td className="mono decided-cell">{formatDate(finding.decidedAt ?? finding.resolvedAt)}</td>
                    <td className="row-actions">
                      <div className="finding-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-quiet"
                          title="Show this entity on the plan and open its detail"
                          onClick={(event) => {
                            event.stopPropagation();
                            onLocate(finding);
                          }}
                        >
                          <LocateFixed size={11} aria-hidden="true" />
                          Locate
                        </button>
                        {canResolve && !resolved && finding.status === "open" && (
                          <button
                            type="button"
                            className="btn btn-sm btn-quiet"
                            onClick={(event) => {
                              event.stopPropagation();
                              void onResolve(finding.id, "acknowledged");
                            }}
                          >
                            Acknowledge
                          </button>
                        )}
                        {canResolve && !resolved && finding.status !== "accepted_risk" && (
                          <button
                            type="button"
                            className="btn btn-sm btn-quiet"
                            onClick={(event) => {
                              event.stopPropagation();
                              void onResolve(finding.id, "accepted_risk");
                            }}
                          >
                            Accept risk
                          </button>
                        )}
                        {canResolve && !resolved && (
                          <button
                            type="button"
                            className="btn btn-sm btn-quiet"
                            onClick={(event) => {
                              event.stopPropagation();
                              void onResolve(finding.id, "resolved");
                            }}
                          >
                            <Check size={11} aria-hidden="true" />
                            Resolve
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <strong>
                        {status === "active" && counts.errors + counts.warnings + counts.infos === 0
                          ? "No open findings in this rule set"
                          : "No finding matches this view"}
                      </strong>
                      {status === "active" && counts.errors + counts.warnings + counts.infos === 0
                        ? "Re-run validation after model changes. A clear register is evidence for review, not a compliance certificate."
                        : "Clear the filters or search text to see the rest of the register."}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="view-footnote">
        <span>
          {payload.advisory.jurisdiction} · rule set {payload.advisory.ruleSetVersion}
        </span>
        <span>
          {active.length} open · {counts.resolved} resolved · errors first
        </span>
        <span>{payload.advisory.notice}</span>
      </div>
    </div>
  );
}
