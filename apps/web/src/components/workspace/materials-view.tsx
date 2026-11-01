"use client";

import { useMemo, useState } from "react";
import { Boxes, Download, Info, Package, Ruler, Search, Wrench } from "lucide-react";
import type { MaterialTakeoff, TakeoffLine } from "@vectrix/electrical";
import type { WorkspacePayloadClient } from "@/lib/workspace-types";
import { formatNumber } from "@/lib/format";

const CATEGORY_LABEL: Record<TakeoffLine["category"], string> = {
  equipment: "Equipment",
  cable: "Cable",
  containment: "Containment",
  accessory: "Accessories",
};

const BASIS_LABEL: Record<string, string> = {
  counted: "Counted",
  catalogue_default: "Catalogue default",
  measured_route: "Measured route",
  route_slack: "Route + slack",
  per_route: "Per route",
  allowance: "Allowance",
};

function basisLabel(basis: string) {
  return BASIS_LABEL[basis] ?? basis.replaceAll("_", " ");
}

function quantity(line: TakeoffLine) {
  if (line.unit === "m") return `${formatNumber(line.quantity, line.quantity < 10 ? 2 : 1)} m`;
  return `${formatNumber(line.quantity)} ${line.unit}`;
}

export function MaterialsView({
  payload,
  takeoff,
  onExport,
}: {
  payload: WorkspacePayloadClient;
  takeoff: MaterialTakeoff;
  onExport: () => void;
}) {
  const [category, setCategory] = useState<"all" | TakeoffLine["category"]>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const map = new Map<TakeoffLine["category"], number>();
    for (const line of takeoff.lines) map.set(line.category, (map.get(line.category) ?? 0) + 1);
    return map;
  }, [takeoff.lines]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return takeoff.lines.filter((line) => {
      if (category !== "all" && line.category !== category) return false;
      if (!needle) return true;
      return [line.description, line.source, line.note, line.basis]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [takeoff.lines, category, query]);

  const circuitsWithRoutes = new Set(
    payload.workspace.routes.map((route) => route.circuitId).filter(Boolean),
  ).size;

  return (
    <div className="view-panel">
      <div className="view-head">
        <div>
          <div className="view-kicker">Procurement / take-off</div>
          <h1 className="view-title">Material take-off</h1>
          <p className="view-sub">
            Quantities derived from the current model only. Cable follows each route plus recorded
            slack; containment counts one conduit per route. Fittings, boxes and fixings are
            excluded unless a line says otherwise.
          </p>
        </div>
        <div className="view-actions">
          <button type="button" className="btn btn-primary" onClick={onExport}>
            <Download size={14} aria-hidden="true" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="view-summary">
        <div className="view-metric">
          <span className="l">Equipment units</span>
          <strong>{formatNumber(takeoff.totals.equipmentUnits)}</strong>
          <span className="s">placed on this project</span>
        </div>
        <div className="view-metric">
          <span className="l">Cable</span>
          <strong>{formatNumber(takeoff.totals.cableMetres, 1)} m</strong>
          <span className="s">route length + slack</span>
        </div>
        <div className="view-metric">
          <span className="l">Containment</span>
          <strong>{formatNumber(takeoff.totals.containmentMetres, 1)} m</strong>
          <span className="s">one conduit per route</span>
        </div>
        <div className="view-metric">
          <span className="l">Lines</span>
          <strong>{takeoff.lines.length}</strong>
          <span className="s">{circuitsWithRoutes} routed circuits</span>
        </div>
      </div>

      <div className="register">
        <div className="register-toolbar">
          <div className="search-box">
            <Search size={13} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter take-off lines"
              aria-label="Filter take-off lines"
            />
          </div>
          <div className="filter-seg" role="group" aria-label="Material category">
            <button
              type="button"
              data-active={category === "all"}
              onClick={() => setCategory("all")}
            >
              All <span>{takeoff.lines.length}</span>
            </button>
            {(Object.keys(CATEGORY_LABEL) as TakeoffLine["category"][]).map((key) => (
              <button
                key={key}
                type="button"
                data-active={category === key}
                onClick={() => setCategory(key)}
              >
                {CATEGORY_LABEL[key]} <span>{counts.get(key) ?? 0}</span>
              </button>
            ))}
          </div>
          <span className="register-count mono">{filtered.length} lines</span>
        </div>

        <div className="register-scroll">
          <table className="register-table takeoff-register">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Description</th>
                <th scope="col" className="num">Quantity</th>
                <th scope="col">Basis</th>
                <th scope="col">Source</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((line) => (
                <tr key={`${line.category}-${line.key}-${line.source}`}>
                  <td>
                    <span className="category-tag" data-category={line.category}>
                      {line.category === "equipment" ? (
                        <Package size={11} aria-hidden="true" />
                      ) : line.category === "cable" ? (
                        <Boxes size={11} aria-hidden="true" />
                      ) : line.category === "containment" ? (
                        <Ruler size={11} aria-hidden="true" />
                      ) : (
                        <Wrench size={11} aria-hidden="true" />
                      )}
                      {CATEGORY_LABEL[line.category]}
                    </span>
                  </td>
                  <td>
                    <span className="line-description">{line.description}</span>
                    <span className="cell-sub mono">{line.key}</span>
                  </td>
                  <td className="num mono">{quantity(line)}</td>
                  <td>
                    <span className="basis-chip">{basisLabel(line.basis)}</span>
                  </td>
                  <td className="mono source-cell">{line.source}</td>
                  <td className="note-cell">{line.note || "—"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <strong>No take-off line matches</strong>
                      Clear the filter or change the category.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="materials-foot">
        <section className="assumption-card">
          <div className="assumption-head">
            <Info size={13} aria-hidden="true" />
            <span>Basis and assumptions</span>
            <span className="mono">Method {takeoff.methodVersion}</span>
          </div>
          <ul>
            {takeoff.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </section>
        <section className="assumption-card advisory">
          <div className="assumption-head">
            <Info size={13} aria-hidden="true" />
            <span>Advisory only</span>
            <span className="mono">{payload.advisory.ruleSetVersion}</span>
          </div>
          <p>
            Take-off quantities support procurement and review. They do not confirm that the
            installation is compliant with any code, that the cable selection is valid for the
            installed conditions, or that a supplier can deliver the listed items. {payload.advisory.notice}
          </p>
          <p className="mono jurisdiction">
            Jurisdiction {payload.advisory.jurisdiction} · cable selection limited to PVC copper,
            reference method C.
          </p>
        </section>
      </div>
    </div>
  );
}
