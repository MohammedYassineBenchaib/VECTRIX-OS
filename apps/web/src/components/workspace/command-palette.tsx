"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Boxes,
  Cable,
  Calculator,
  Check,
  Download,
  Hand,
  MousePointer2,
  PenLine,
  Play,
  Plus,
  Route as RouteIcon,
  Search,
  Square,
  TableProperties,
  AlertTriangle,
} from "lucide-react";
import { findEquipmentDefinition } from "@vectrix/core";
import type { WorkspacePayloadClient, PlanTool, Selection, WorkspaceView } from "@/lib/workspace-types";
import { formatMetres, formatVA } from "@/lib/format";

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  payload,
  canDesign,
  canValidate,
  onView,
  onSelect,
  onTool,
  onNewCircuit,
  onValidate,
  onExport,
  onFit,
}: {
  open: boolean;
  onClose: () => void;
  payload: WorkspacePayloadClient;
  canDesign: boolean;
  canValidate: boolean;
  onView: (view: WorkspaceView) => void;
  onSelect: (selection: Selection) => void;
  onTool: (tool: PlanTool) => void;
  onNewCircuit: () => void;
  onValidate: () => void;
  onExport: () => void;
  onFit: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { workspace } = payload;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const go = (view: WorkspaceView, label: string, hint: string, icon: ReactNode) => ({
      id: `view-${view}`,
      group: "Go to",
      label,
      hint,
      icon,
      run: () => {
        onView(view);
        onClose();
      },
    });

    const rows: PaletteItem[] = [
      go("plan", "Plan drawing", "Level sheet", <PenLine size={15} />),
      go("circuits", "Circuit schedule", `${workspace.circuits.length} circuits`, <TableProperties size={15} />),
      go("materials", "Material take-off", `${payload.takeoff.lines.length} lines`, <Boxes size={15} />),
      go("findings", "Findings register", `${payload.stats.errors + payload.stats.warnings} open`, <AlertTriangle size={15} />),
      {
        id: "tool-select",
        group: "Drawing tools",
        label: "Select and move",
        hint: "V",
        icon: <MousePointer2 size={15} />,
        run: () => {
          onTool("select");
          onView("plan");
          onClose();
        },
      },
      {
        id: "tool-pan",
        group: "Drawing tools",
        label: "Pan the sheet",
        hint: "H",
        icon: <Hand size={15} />,
        run: () => {
          onTool("pan");
          onView("plan");
          onClose();
        },
      },
      {
        id: "tool-wall",
        group: "Drawing tools",
        label: "Draw a wall",
        hint: "W",
        icon: <PenLine size={15} />,
        run: () => {
          onTool("wall");
          onView("plan");
          onClose();
        },
      },
      {
        id: "tool-room",
        group: "Drawing tools",
        label: "Close a room polygon",
        hint: "R",
        icon: <Square size={15} />,
        run: () => {
          onTool("room");
          onView("plan");
          onClose();
        },
      },
      {
        id: "tool-route",
        group: "Drawing tools",
        label: "Draw a cable route",
        hint: "C",
        icon: <RouteIcon size={15} />,
        run: () => {
          onTool("route");
          onView("plan");
          onClose();
        },
      },
      {
        id: "action-new-circuit",
        group: "Actions",
        label: "New circuit",
        icon: <Plus size={15} />,
        run: () => {
          onClose();
          onNewCircuit();
        },
      },
      {
        id: "action-validate",
        group: "Actions",
        label: "Run validation now",
        icon: <Play size={15} />,
        run: () => {
          onClose();
          onValidate();
        },
      },
      {
        id: "action-fit",
        group: "Actions",
        label: "Fit drawing to the sheet",
        icon: <Calculator size={15} />,
        run: () => {
          onView("plan");
          onFit();
          onClose();
        },
      },
      {
        id: "action-export",
        group: "Actions",
        label: "Export take-off as CSV",
        icon: <Download size={15} />,
        run: () => {
          onClose();
          onExport();
        },
      },
    ];

    for (const item of workspace.equipment) {
      const definition = findEquipmentDefinition(item.definitionKey);
      rows.push({
        id: `equipment-${item.id}`,
        group: "Equipment",
        label: item.label,
        hint: definition?.name ?? item.definitionKey,
        icon: <Cable size={15} />,
        run: () => {
          onView("plan");
          onSelect({ kind: "equipment", id: item.id });
          onClose();
        },
      });
    }

    for (const circuit of workspace.circuits) {
      const load = payload.loadSchedule.circuits.find((row) => row.circuitId === circuit.id);
      rows.push({
        id: `circuit-${circuit.id}`,
        group: "Circuits",
        label: circuit.name,
        hint: `${circuit.breakerRatingA} A · ${formatVA(load?.demandVA ?? 0)} demand`,
        icon: (
          <span
            className="palette-swatch"
            style={{ background: circuit.color }}
            aria-hidden="true"
          />
        ),
        run: () => {
          onView("circuits");
          onSelect({ kind: "circuit", id: circuit.id });
          onClose();
        },
      });
    }

    for (const room of workspace.rooms) {
      const count = workspace.equipment.filter((item) => item.roomId === room.id).length;
      rows.push({
        id: `room-${room.id}`,
        group: "Rooms",
        label: room.name,
        hint: `${room.number} · ${count} device${count === 1 ? "" : "s"}`,
        icon: <Square size={15} />,
        run: () => {
          onView("plan");
          onSelect({ kind: "room", id: room.id });
          onClose();
        },
      });
    }

    for (const route of workspace.routes) {
      const circuit = workspace.circuits.find((row) => row.id === route.circuitId);
      rows.push({
        id: `route-${route.id}`,
        group: "Routes",
        label: `Route ${route.id.replace(/^rte_/, "RTE-").toUpperCase()}`,
        hint: `${circuit?.name ?? "Unassigned"} · ${formatMetres(route.lengthMm / 1000)}`,
        icon: <RouteIcon size={15} />,
        run: () => {
          onView("plan");
          onSelect({ kind: "route", id: route.id });
          onClose();
        },
      });
    }

    return rows.filter((item) => {
      if (!canDesign && ["tool-wall", "tool-room", "tool-route", "action-new-circuit"].includes(item.id)) {
        return false;
      }
      if (!canValidate && item.id === "action-validate") return false;
      return true;
    });
  }, [
    canDesign,
    canValidate,
    payload,
    workspace,
    onClose,
    onExport,
    onFit,
    onNewCircuit,
    onSelect,
    onTool,
    onValidate,
    onView,
  ]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      `${item.group} ${item.label} ${item.hint ?? ""}`.toLowerCase().includes(needle),
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    filtered.forEach((item) => {
      const rows = map.get(item.group) ?? [];
      rows.push(item);
      map.set(item.group, rows);
    });
    return [...map.entries()];
  }, [filtered]);

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(
      `[data-palette-index="${active}"]`,
    );
    element?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  function runAt(index: number) {
    const item = filtered[index];
    if (item) item.run();
  }

  let flatIndex = -1;

  return (
    <div
      className="palette-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-search">
          <Search size={15} aria-hidden="true" />
          <input
            ref={inputRef}
            className="palette-input"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((current) => (filtered.length === 0 ? 0 : (current + 1) % filtered.length));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((current) =>
                  filtered.length === 0 ? 0 : (current - 1 + filtered.length) % filtered.length,
                );
              }
              if (event.key === "Enter") {
                event.preventDefault();
                runAt(active);
              }
            }}
            placeholder="Search actions, equipment, circuits, rooms…"
            aria-label="Command palette search"
            aria-controls="palette-results"
            aria-activedescendant={filtered[active] ? `palette-${filtered[active]!.id}` : undefined}
          />
          <span className="kbd">ESC</span>
        </div>
        <div className="palette-list" id="palette-results" role="listbox" ref={listRef}>
          {grouped.map(([group, rows]) => (
            <div key={group}>
              <div className="palette-group">{group}</div>
              {rows.map((item) => {
                flatIndex += 1;
                const index = flatIndex;
                return (
                  <button
                    key={item.id}
                    id={`palette-${item.id}`}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className="palette-item"
                    data-active={index === active}
                    data-palette-index={index}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => item.run()}
                  >
                    <span className="palette-icon" aria-hidden="true">
                      {item.icon ?? <Check size={14} />}
                    </span>
                    <span className="palette-label">{item.label}</span>
                    {item.hint && <span className="palette-hint">{item.hint}</span>}
                    <ArrowRight size={13} aria-hidden="true" className="palette-enter" />
                  </button>
                );
              })}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="empty-state">
              <strong>No match</strong>
              Try a circuit name, a room, or an action such as “validate”.
            </div>
          )}
        </div>
        <div className="palette-foot">
          <span>
            <span className="kbd">↑</span> <span className="kbd">↓</span> navigate
          </span>
          <span>
            <span className="kbd">↵</span> open
          </span>
          <span className="spacer" />
          <span>Command palette</span>
        </div>
      </div>
    </div>
  );
}
