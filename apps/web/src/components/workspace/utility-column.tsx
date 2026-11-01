"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
  EQUIPMENT_CATALOG,
  findEquipmentDefinition,
  type EquipmentDefinition,
  type LevelWorkspace,
} from "@vectrix/core";
import { GlyphPreview } from "./equipment-glyph";
import type { LevelSummary, Selection } from "@/lib/workspace-types";
import { formatMm, formatVA } from "@/lib/format";
import { occupancyLabel } from "./helpers";

type UtilityTab = "model" | "library";

export function UtilityColumn({
  workspace,
  levels,
  selection,
  pendingDefinitionKey,
  mobileOpen,
  readOnly,
  onClose,
  onSelectLevel,
  onSelect,
  onArmLibrary,
}: {
  workspace: LevelWorkspace;
  levels: LevelSummary[];
  selection: Selection;
  pendingDefinitionKey: string | null;
  mobileOpen: boolean;
  readOnly: boolean;
  onClose: () => void;
  onSelectLevel: (levelId: string) => void;
  onSelect: (selection: Selection) => void;
  onArmLibrary: (definitionKey: string | null) => void;
}) {
  const [tab, setTab] = useState<UtilityTab>("model");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const { rooms, equipment, circuits } = workspace;

  const circuitsById = useMemo(
    () => new Map(circuits.map((circuit) => [circuit.id, circuit])),
    [circuits],
  );

  const roomsWithCounts = useMemo(
    () =>
      rooms.map((room) => ({
        room,
        count: equipment.filter((item) => item.roomId === room.id).length,
      })),
    [rooms, equipment],
  );

  const unassigned = equipment.filter((item) => item.roomId === null).length;

  const categories = useMemo(() => {
    const values = new Map<string, string>();
    for (const definition of EQUIPMENT_CATALOG) {
      values.set(definition.category, definition.category.replaceAll("_", " "));
    }
    return [...values].sort((a, b) => a[1].localeCompare(b[1]));
  }, []);

  const filteredLibrary = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return EQUIPMENT_CATALOG.filter((definition) => {
      if (category !== "all" && definition.category !== category) return false;
      if (!needle) return true;
      return [definition.name, definition.shortName, definition.description, definition.discipline]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [query, category]);

  return (
    <aside
      className="utility-column"
      data-open={mobileOpen}
      aria-label="Model and equipment library"
    >
      <div className="utility-tabs" role="tablist" aria-label="Utility panels">
        <button
          type="button"
          role="tab"
          className="utility-tab"
          data-active={tab === "model"}
          aria-selected={tab === "model"}
          onClick={() => setTab("model")}
        >
          Model
        </button>
        <button
          type="button"
          role="tab"
          className="utility-tab"
          data-active={tab === "library"}
          aria-selected={tab === "library"}
          onClick={() => setTab("library")}
        >
          Library
        </button>
        <button
          type="button"
          className="icon-btn drawer-close"
          onClick={onClose}
          aria-label="Close model and library drawer"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      {tab === "model" ? (
        <>
          <div className="level-switcher">
            <label className="field-label" htmlFor="level-select">
              Level
            </label>
            <select
              id="level-select"
              value={workspace.level.id}
              onChange={(event) => onSelectLevel(event.target.value)}
            >
              {levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name} · {level.elevationMm >= 0 ? "+" : ""}
                  {formatMm(level.elevationMm)}
                </option>
              ))}
            </select>
          </div>
          <div className="scroll-area">
            <div className="utility-section-title">
              Rooms <span>{rooms.length}</span>
            </div>
            <div className="utility-list">
              {roomsWithCounts.map(({ room, count }) => (
                <button
                  key={room.id}
                  type="button"
                  className="utility-row"
                  data-active={selection?.kind === "room" && selection.id === room.id}
                  onClick={() => onSelect({ kind: "room", id: room.id })}
                >
                  <span className="room-index mono">{room.number}</span>
                  <span
                    style={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {room.name}
                  </span>
                  <span className="count">{count}</span>
                  <span className="sr-only">{occupancyLabel(room.occupancy)}</span>
                </button>
              ))}
              {unassigned > 0 && (
                <div className="utility-note">
                  {unassigned} device{unassigned === 1 ? "" : "s"} not inside a room polygon.
                </div>
              )}
            </div>

            <div className="utility-section-title">
              Placed devices <span>{equipment.length}</span>
            </div>
            <div className="utility-list">
              {equipment.map((item) => {
                const definition = findEquipmentDefinition(item.definitionKey);
                const circuit = item.circuitId ? circuitsById.get(item.circuitId) : undefined;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="utility-row"
                    data-active={selection?.kind === "equipment" && selection.id === item.id}
                    onClick={() => onSelect({ kind: "equipment", id: item.id })}
                  >
                    <span
                      className="device-dot"
                      style={{ background: circuit?.color ?? "var(--line-strong)" }}
                      aria-hidden="true"
                    />
                    <span
                      style={{
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.label}
                    </span>
                    <span className="count">{definition?.shortName ?? item.definitionKey}</span>
                  </button>
                );
              })}
              {equipment.length === 0 && (
                <div className="empty-state">
                  <strong>No devices on this level</strong>
                  Open the Library, choose a device and click the sheet to place it.
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="library-filters">
            <div className="search-box" style={{ width: "100%" }}>
              <Search size={13} aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search the generic catalogue"
                aria-label="Search equipment library"
              />
            </div>
            <select
              aria-label="Filter by category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              style={{ marginTop: 8 }}
            >
              <option value="all">All categories</option>
              {categories.map(([key, label]) => (
                <option key={key} value={key}>
                  {label.charAt(0).toUpperCase() + label.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div className="scroll-area">
            <div className="utility-list">
              {filteredLibrary.map((definition) => (
                <LibraryItem
                  key={definition.key}
                  definition={definition}
                  active={pendingDefinitionKey === definition.key}
                  disabled={readOnly}
                  onChoose={() =>
                    onArmLibrary(pendingDefinitionKey === definition.key ? null : definition.key)
                  }
                />
              ))}
              {filteredLibrary.length === 0 && (
                <div className="empty-state">
                  <strong>No catalogue item matches</strong>
                  Clear the search or choose another category.
                </div>
              )}
            </div>
            <div className="utility-note" style={{ margin: "6px 12px 16px" }}>
              {readOnly
                ? "Read-only role: the catalogue is visible for reference, but placement is disabled."
                : "Generic VECTRIX catalogue. No manufacturer part numbers or proprietary symbols are used. Click a device then the sheet, or drag it onto the plan."}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function LibraryItem({
  definition,
  active,
  disabled,
  onChoose,
}: {
  definition: EquipmentDefinition;
  active: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      className="library-item"
      data-active={active}
      onClick={onChoose}
      disabled={disabled}
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData("application/x-vectrix-equipment", definition.key);
        event.dataTransfer.effectAllowed = "copy";
      }}
      title={
        disabled
          ? "Your role cannot place equipment"
          : `${definition.name}\n${definition.description}`
      }
    >
      <span className="library-glyph">
        <GlyphPreview symbol={definition.symbol} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="library-name">{definition.name}</span>
        <span className="library-meta">
          {definition.discipline.toUpperCase()} ·{" "}
          {definition.electrical.defaultLoadVA === null
            ? "no load"
            : formatVA(definition.electrical.defaultLoadVA)}
        </span>
      </span>
    </button>
  );
}
