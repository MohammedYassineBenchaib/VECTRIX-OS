"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Minus, Maximize2, Plus } from "lucide-react";
import {
  findEquipmentDefinition,
  type Equipment,
  type LevelWorkspace,
  type PlanPoint,
  type ValidationResult,
} from "@vectrix/core";
import {
  clampToPlan,
  distanceMm,
  nearestEquipment,
  orthogonalPoint,
  polygonBounds,
  roomAtPoint,
  routeStatusLabel,
  snapToGrid,
  sortFindings,
} from "./helpers";
import type { PlanTool, Selection } from "@/lib/workspace-types";
import { EquipmentGlyph } from "./equipment-glyph";

interface PlanCanvasProps {
  workspace: LevelWorkspace;
  activeCircuitId: string | null;
  selection: Selection;
  focusValidationId: string | null;
  tool: PlanTool;
  pendingDefinitionKey: string | null;
  fitNonce: number;
  editable: boolean;
  onSelect: (selection: Selection) => void;
  onPlaceEquipment: (definitionKey: string, point: PlanPoint, roomId: string | null) => Promise<boolean>;
  onMoveEquipment: (equipmentId: string, point: PlanPoint) => Promise<boolean>;
  onCreateWall: (start: PlanPoint, end: PlanPoint) => Promise<boolean>;
  onCreateRoom: (points: PlanPoint[]) => void;
  onCreateRoute: (points: PlanPoint[]) => Promise<boolean>;
  onLocateValidation: (finding: ValidationResult) => void;
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PanState {
  startClientX: number;
  startClientY: number;
  view: ViewBox;
  moved: boolean;
}

interface DragState {
  equipmentId: string;
  startClientX: number;
  startClientY: number;
  origin: PlanPoint;
  point: PlanPoint;
  moved: boolean;
}

const ROUTE_STROKE: Record<string, string> = {
  visual: "5 4",
  proposed: "11 3",
  validated: "",
  installed: "",
};

function fitView(widthMm: number, heightMm: number): ViewBox {
  const pad = Math.max(350, Math.min(widthMm, heightMm) * 0.055);
  return { x: -pad, y: -pad, w: widthMm + pad * 2, h: heightMm + pad * 2 };
}

function clientToPlan(
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
): PlanPoint | null {
  if (!svg) return null;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const transformed = point.matrixTransform(matrix.inverse());
  return { x: transformed.x, y: transformed.y };
}

function snapPlanPoint(
  point: PlanPoint,
  widthMm: number,
  heightMm: number,
  nearest: Equipment | undefined,
): PlanPoint {
  if (nearest) return { x: nearest.xMm, y: nearest.yMm };
  const snapped = { x: snapToGrid(point.x), y: snapToGrid(point.y) };
  return clampToPlan(snapped, widthMm, heightMm);
}

function endpointAnchor(point: PlanPoint, equipment: Equipment[], toleranceMm = 300) {
  return nearestEquipment(equipment, point, toleranceMm);
}

export function PlanCanvas({
  workspace,
  activeCircuitId,
  selection,
  focusValidationId,
  tool,
  pendingDefinitionKey,
  fitNonce,
  editable,
  onSelect,
  onPlaceEquipment,
  onMoveEquipment,
  onCreateWall,
  onCreateRoom,
  onCreateRoute,
  onLocateValidation,
}: PlanCanvasProps) {
  const { level, rooms, walls, routes, equipment, circuits, validations } = workspace;
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panRef = useRef<PanState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  const [view, setView] = useState<ViewBox>(() =>
    fitView(level.planWidthMm, level.planHeightMm),
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const [cursor, setCursor] = useState<PlanPoint | null>(null);
  const [draftPoints, setDraftPoints] = useState<PlanPoint[]>([]);
  const [wallStart, setWallStart] = useState<PlanPoint | null>(null);
  const [dragPoint, setDragPoint] = useState<{ id: string; point: PlanPoint } | null>(null);

  const circuitsById = useMemo(
    () => new Map(circuits.map((circuit) => [circuit.id, circuit])),
    [circuits],
  );

  const openValidationRows = useMemo(
    () =>
      sortFindings(
        validations.filter(
          (row) =>
            row.status !== "resolved" &&
            (row.levelId === null || row.levelId === level.id),
        ),
      ),
    [validations, level.id],
  );

  const viewportScale = useMemo(() => (wrapRef.current?.clientWidth ?? 900) / view.w, [view.w]);

  useEffect(() => {
    setView(fitView(level.planWidthMm, level.planHeightMm));
    setDraftPoints([]);
    setWallStart(null);
    setDragPoint(null);
  }, [level.id, level.planWidthMm, level.planHeightMm, fitNonce]);

  useEffect(() => {
    setDraftPoints([]);
    setWallStart(null);
  }, [tool, pendingDefinitionKey]);

  const finishRoute = useCallback(async () => {
    const cleaned = draftPoints.filter(
      (point, index) => index === 0 || distanceMm(point, draftPoints[index - 1]!) > 1,
    );
    if (cleaned.length < 2) return;
    const success = await onCreateRoute(cleaned);
    if (success) setDraftPoints([]);
  }, [draftPoints, onCreateRoute]);

  const finishRoom = useCallback(() => {
    if (draftPoints.length < 3) return;
    onCreateRoom(draftPoints);
    setDraftPoints([]);
  }, [draftPoints, onCreateRoom]);

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
      if (event.key === "Escape") {
        setDraftPoints([]);
        setWallStart(null);
      }
      if (event.key === "Enter" && draftPoints.length >= 2 && tool === "route" && editable) {
        event.preventDefault();
        void finishRoute();
      }
      if (event.key === "Enter" && draftPoints.length >= 3 && tool === "room" && editable) {
        event.preventDefault();
        finishRoom();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draftPoints, editable, finishRoom, finishRoute, tool]);

  function zoomAt(factor: number, anchor?: PlanPoint) {
    setView((current) => {
      const minWidth = Math.max(1200, level.planWidthMm / 14);
      const maxWidth = Math.max(level.planWidthMm * 2.4, level.planWidthMm + 2400);
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, current.w * factor));
      const ratio = nextWidth / current.w;
      const center = anchor ?? { x: current.x + current.w / 2, y: current.y + current.h / 2 };
      return {
        x: center.x - (center.x - current.x) * ratio,
        y: center.y - (center.y - current.y) * ratio,
        w: nextWidth,
        h: current.h * ratio,
      };
    });
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const anchor = clientToPlan(svgRef.current, event.clientX, event.clientY) ?? undefined;
    zoomAt(event.deltaY < 0 ? 0.88 : 1.13, anchor);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    if (tool !== "select" && tool !== "pan" && event.button !== 1) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-plan-item]")) return;

    panRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      view,
      moved: false,
    };
    suppressClickRef.current = false;
    wrapRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const planPoint = clientToPlan(svgRef.current, event.clientX, event.clientY);
    if (planPoint) setCursor(planPoint);

    const pan = panRef.current;
    if (pan) {
      const dx = event.clientX - pan.startClientX;
      const dy = event.clientY - pan.startClientY;
      if (!pan.moved && Math.hypot(dx, dy) > 4) pan.moved = true;
      if (pan.moved) {
        const rect = wrapRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return;
        const unitsX = (dx * pan.view.w) / rect.width;
        const unitsY = (dy * pan.view.h) / rect.height;
        setView({
          ...pan.view,
          x: pan.view.x - unitsX,
          y: pan.view.y - unitsY,
        });
        suppressClickRef.current = true;
      }
      return;
    }

    const drag = dragRef.current;
    if (drag && planPoint) {
      const originPlan = clientToPlan(
        svgRef.current,
        drag.startClientX,
        drag.startClientY,
      ) ?? { x: drag.origin.x, y: drag.origin.y };
      const dx = planPoint.x - originPlan.x;
      const dy = planPoint.y - originPlan.y;
      if (!drag.moved && Math.hypot(dx, dy) * viewportScale > 4) drag.moved = true;
      const next = clampToPlan(
        { x: drag.origin.x + dx, y: drag.origin.y + dy },
        level.planWidthMm,
        level.planHeightMm,
      );
      drag.point = next;
      if (drag.moved) setDragPoint({ id: drag.equipmentId, point: next });
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (pan) {
      panRef.current = null;
      if (wrapRef.current?.hasPointerCapture(event.pointerId)) {
        wrapRef.current.releasePointerCapture(event.pointerId);
      }
    }
  }

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!(event.target instanceof Element)) return;
    const planPoint = clientToPlan(svgRef.current, event.clientX, event.clientY);
    if (!planPoint) return;
    if (!editable && (pendingDefinitionKey || (tool !== "select" && tool !== "pan"))) return;
    const snapped = snapPlanPoint(
      planPoint,
      level.planWidthMm,
      level.planHeightMm,
      pendingDefinitionKey ? undefined : nearestEquipment(equipment, planPoint, 280),
    );

    if (pendingDefinitionKey) {
      const room = roomAtPoint(rooms, snapped);
      void onPlaceEquipment(pendingDefinitionKey, snapped, room?.id ?? null);
      return;
    }

    if (tool === "wall") {
      if (!wallStart) {
        setWallStart(snapped);
        return;
      }
      const end = snapPlanPoint(planPoint, level.planWidthMm, level.planHeightMm, undefined);
      if (distanceMm(wallStart, end) < 50) return;
      void onCreateWall(wallStart, end).then((success) => {
        if (success) setWallStart(null);
      });
      return;
    }

    if (tool === "route") {
      setDraftPoints((current) => {
        const last = current[current.length - 1];
        const anchor = endpointAnchor(snapped, equipment);
        const point = anchor
          ? { x: anchor.xMm, y: anchor.yMm }
          : orthogonalPoint(snapped, last);
        if (current.length > 0 && distanceMm(point, last!) < 1) return current;
        return [...current, point];
      });
      return;
    }

    if (tool === "room") {
      setDraftPoints((current) => {
        if (current.length > 0 && distanceMm(snapped, current[current.length - 1]!) < 1) {
          return current;
        }
        return [...current, snapped];
      });
      return;
    }

    if (tool === "select") onSelect(null);
  }

  function beginEquipmentDrag(
    event: ReactPointerEvent<SVGGElement>,
    item: Equipment,
  ) {
    if (!editable || tool !== "select" || event.button !== 0) return;
    event.stopPropagation();
    dragRef.current = {
      equipmentId: item.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origin: { x: item.xMm, y: item.yMm },
      point: { x: item.xMm, y: item.yMm },
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function endEquipmentDrag(event: ReactPointerEvent<SVGGElement>, item: Equipment) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragPoint(null);
    if (drag.moved) {
      void onMoveEquipment(item.id, drag.point);
    } else {
      onSelect({ kind: "equipment", id: item.id });
    }
  }

  const glyphSize = Math.min(260, Math.max(120, view.w / 44));
  const labelSize = Math.max(90, view.w / 100);
  const roomLabelSize = Math.max(100, view.w / 110);
  const dimensionSize = Math.max(58, view.w / 190);
  const wallStroke = view.w / 3200;
  const routeStroke = Math.max(1.8, view.w / 5200);
  const zoomPercent = Math.round((fitView(level.planWidthMm, level.planHeightMm).w / view.w) * 100);

  return (
    <div
      className="plan-svg-wrap"
      data-tool={pendingDefinitionKey ? "place" : tool}
      ref={wrapRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (!editable) return;
        const definitionKey = event.dataTransfer.getData("application/x-vectrix-equipment");
        if (!definitionKey) return;
        const planPoint = clientToPlan(svgRef.current, event.clientX, event.clientY);
        if (!planPoint) return;
        const snapped = snapPlanPoint(
          planPoint,
          level.planWidthMm,
          level.planHeightMm,
          undefined,
        );
        const room = roomAtPoint(rooms, snapped);
        void onPlaceEquipment(definitionKey, snapped, room?.id ?? null);
      }}
      onDoubleClick={() => {
        if (tool === "route") void finishRoute();
        if (tool === "room") finishRoom();
      }}
    >
      <svg
        className="plan-svg"
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="application"
        aria-label={`Plan drawing for ${level.name}. Use the toolbar to select, pan, draw walls, rooms or routes.`}
      >
        <defs>
          <pattern id="hatch-wet" width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="36" stroke="var(--sheet-line)" strokeWidth="1" opacity="0.55" />
          </pattern>
        </defs>

        <rect
          x={0}
          y={0}
          width={level.planWidthMm}
          height={level.planHeightMm}
          fill="transparent"
          stroke="var(--sheet-line)"
          strokeWidth={wallStroke * 3}
        />

        {rooms.map((room) => {
          const bounds = polygonBounds(room.polygon);
          const isSelected = selection?.kind === "room" && selection.id === room.id;
          const wet = room.occupancy === "bathroom" || room.occupancy === "laundry";
          return (
            <g key={room.id} data-plan-item>
              <path
                d={`${room.polygon.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ")} Z`}
                fill={wet ? "url(#hatch-wet)" : "rgba(26, 29, 27, 0.018)"}
                stroke={isSelected ? "var(--accent)" : "transparent"}
                strokeWidth={Math.max(4, wallStroke * 6)}
                onClick={(event) => {
                  if (tool !== "select" || pendingDefinitionKey) return;
                  event.stopPropagation();
                  onSelect({ kind: "room", id: room.id });
                }}
                style={{ cursor: "pointer" }}
              >
                <title>{`${room.name} · ${room.occupancy}`}</title>
              </path>
              <text
                x={bounds.center.x}
                y={bounds.center.y - roomLabelSize * 0.15}
                textAnchor="middle"
                className="plan-room-label"
                fontSize={roomLabelSize}
                pointerEvents="none"
              >
                {room.name}
              </text>
              <text
                x={bounds.center.x}
                y={bounds.center.y + roomLabelSize * 0.95}
                textAnchor="middle"
                className="plan-dim"
                fontSize={dimensionSize}
                pointerEvents="none"
              >
                {Math.round(bounds.width)} × {Math.round(bounds.height)} mm
              </text>
            </g>
          );
        })}

        {walls.map((wall) => {
          const isSelected = selection?.kind === "wall" && selection.id === wall.id;
          return (
            <g key={wall.id} data-plan-item>
              <line
                x1={wall.startX}
                y1={wall.startY}
                x2={wall.endX}
                y2={wall.endY}
                stroke={isSelected ? "var(--accent)" : "var(--sheet-wall)"}
                strokeWidth={Math.max(wall.thicknessMm, wallStroke * 4)}
                strokeLinecap="square"
              >
                <title>{`${wall.kind} wall · ${wall.thicknessMm} mm`}</title>
              </line>
              <line
                x1={wall.startX}
                y1={wall.startY}
                x2={wall.endX}
                y2={wall.endY}
                stroke="transparent"
                strokeWidth={Math.max(wall.thicknessMm, wallStroke * 4) + Math.max(10, view.w / 500)}
                strokeLinecap="square"
                onClick={(event) => {
                  if (tool !== "select" || pendingDefinitionKey) return;
                  event.stopPropagation();
                  onSelect({ kind: "wall", id: wall.id });
                }}
                style={{ cursor: "pointer" }}
              />
            </g>
          );
        })}

        {routes.map((route) => {
          const circuit = route.circuitId ? circuitsById.get(route.circuitId) : undefined;
          const program = route.points.map((point) => `${point.x},${point.y}`).join(" ");
          const dimmed = Boolean(activeCircuitId && route.circuitId !== activeCircuitId);
          const isSelected = selection?.kind === "route" && selection.id === route.id;
          const color = circuit?.color ?? "var(--sheet-muted)";
          return (
            <g key={route.id} data-plan-item>
              <polyline
                points={program}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(12, view.w / 300)}
                strokeLinecap="round"
                strokeLinejoin="round"
                onClick={(event) => {
                  if (tool !== "select" || pendingDefinitionKey) return;
                  event.stopPropagation();
                  onSelect({ kind: "route", id: route.id });
                }}
                style={{ cursor: "pointer" }}
              />
              <polyline
                className="plan-route"
                data-dimmed={dimmed}
                data-selected={isSelected}
                points={program}
                stroke={color}
                strokeWidth={isSelected ? routeStroke * 2.1 : routeStroke}
                strokeDasharray={ROUTE_STROKE[route.status] ?? ""}
                opacity={route.status === "visual" ? 0.72 : 0.95}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              >
                <title>{`${circuit?.name ?? "Unassigned route"} · ${routeStatusLabel(route.status)} · ${Math.round(route.lengthMm)} mm`}</title>
              </polyline>
            </g>
          );
        })}

        {equipment.map((item) => {
          const circuit = item.circuitId ? circuitsById.get(item.circuitId) : undefined;
          const definition = findEquipmentDefinition(item.definitionKey);
          const dimmed = Boolean(activeCircuitId && item.circuitId !== activeCircuitId);
          const isSelected = selection?.kind === "equipment" && selection.id === item.id;
          const isHovered = hovered === item.id;
          const drawn = dragPoint?.id === item.id ? dragPoint.point : { x: item.xMm, y: item.yMm };
          const stateColor =
            item.installationState === "issue"
              ? "var(--danger)"
              : item.installationState === "verified"
                ? "var(--ok)"
                : item.installationState === "installed"
                  ? "var(--accent)"
                  : "transparent";
          return (
            <g
              key={item.id}
              className="plan-equipment"
              data-plan-item
              data-selected={isSelected}
              data-hovered={isHovered}
              data-dimmed={dimmed}
              transform={`translate(${drawn.x} ${drawn.y})`}
              tabIndex={0}
              role="button"
              aria-label={`${item.label}, ${circuit?.name ?? "unassigned"}`}
              onPointerDown={(event) => beginEquipmentDrag(event, item)}
              onPointerMove={(event) => {
                if (dragRef.current?.equipmentId === item.id) {
                  handlePointerMove(event as unknown as ReactPointerEvent<HTMLDivElement>);
                }
              }}
              onPointerUp={(event) => endEquipmentDrag(event, item)}
              onPointerEnter={() => setHovered(item.id)}
              onPointerLeave={() => setHovered(null)}
              onClick={(event) => {
                if (tool === "select" && !pendingDefinitionKey) event.stopPropagation();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect({ kind: "equipment", id: item.id });
                }
              }}
            >
              <circle className="selection-ring" r={glyphSize * 0.82} fill="none" stroke="transparent" />
              <g transform={`rotate(${item.rotationDeg} 0 0)`}>
                <EquipmentGlyph
                  symbol={definition?.symbol ?? "socket"}
                  size={glyphSize}
                  tone={isSelected ? "var(--accent)" : "var(--sheet-wall)"}
                />
              </g>
              {circuit && (
                <rect
                  x={-glyphSize * 0.33}
                  y={glyphSize * 0.6}
                  width={glyphSize * 0.66}
                  height={Math.max(3, glyphSize * 0.055)}
                  fill={circuit.color}
                  opacity={dimmed ? 0.35 : 1}
                  pointerEvents="none"
                />
              )}
              {stateColor !== "transparent" && (
                <circle
                  cx={glyphSize * 0.48}
                  cy={-glyphSize * 0.48}
                  r={glyphSize * 0.12}
                  fill={stateColor}
                  stroke="var(--sheet)"
                  strokeWidth={glyphSize * 0.025}
                  pointerEvents="none"
                />
              )}
              <text
                x={0}
                y={glyphSize * 0.98}
                textAnchor="middle"
                fontSize={labelSize}
                fill="var(--sheet-ink)"
                className="mono"
                pointerEvents="none"
              >
                {item.label}
              </text>
            </g>
          );
        })}

        {wallStart && cursor && (
          <line
            x1={wallStart.x}
            y1={wallStart.y}
            x2={cursor.x}
            y2={cursor.y}
            stroke="var(--accent)"
            strokeWidth={Math.max(2, wallStroke * 4)}
            strokeDasharray="8 5"
            pointerEvents="none"
          />
        )}

        {tool === "wall" && wallStart && (
          <circle cx={wallStart.x} cy={wallStart.y} r={glyphSize * 0.12} fill="var(--accent)" pointerEvents="none" />
        )}

        {draftPoints.length > 0 && (
          <>
            {tool === "route" && (
              <polyline
                points={[...draftPoints, ...(cursor ? [cursor] : [])]
                  .map((point) => `${point.x},${point.y}`)
                  .join(" ")}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeDasharray="7 5"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {tool === "room" && (
              <path
                d={`${draftPoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ")}${cursor ? ` L${cursor.x} ${cursor.y}` : ""} Z`}
                fill="rgba(36, 90, 158, 0.10)"
                stroke="var(--accent)"
                strokeWidth={2}
                strokeDasharray="8 5"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            {draftPoints.map((point, index) => (
              <circle
                key={`${point.x}-${point.y}-${index}`}
                cx={point.x}
                cy={point.y}
                r={Math.max(5, view.w / 1700)}
                fill="var(--surface)"
                stroke="var(--accent)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            ))}
          </>
        )}
      </svg>

      <div
        className="plan-hint"
        data-visible={Boolean(pendingDefinitionKey) || tool !== "select"}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {pendingDefinitionKey && (
          <>
            <strong>Place device</strong>
            <span>Click the plan to position it. The room is detected from the polygon.</span>
            <button className="btn btn-sm btn-quiet" type="button" onClick={() => onSelect(null)}>
              Cancel
            </button>
          </>
        )}
        {!pendingDefinitionKey && tool === "wall" && (
          <>
            <strong>Wall tool</strong>
            <span>{wallStart ? "Click the end point." : "Click the start point."}</span>
            {wallStart && (
              <button className="btn btn-sm btn-quiet" type="button" onClick={() => setWallStart(null)}>
                Cancel
              </button>
            )}
          </>
        )}
        {!pendingDefinitionKey && tool === "route" && (
          <>
            <strong>Route tool</strong>
            <span>
              {draftPoints.length === 0
                ? "Start on equipment, within 300 mm of a device."
                : `${draftPoints.length} point(s). Finish on equipment. Enter or double-click to save.`}
            </span>
            <button
              className="btn btn-sm btn-primary"
              type="button"
              disabled={draftPoints.length < 2}
              onClick={() => void finishRoute()}
            >
              Finish route
            </button>
            <button className="btn btn-sm btn-quiet" type="button" onClick={() => setDraftPoints([])}>
              Cancel
            </button>
          </>
        )}
        {!pendingDefinitionKey && tool === "room" && (
          <>
            <strong>Room tool</strong>
            <span>
              {draftPoints.length < 3
                ? "Click at least three corners."
                : `${draftPoints.length} corners. Close the polygon to name the room.`}
            </span>
            <button
              className="btn btn-sm btn-primary"
              type="button"
              disabled={draftPoints.length < 3}
              onClick={finishRoom}
            >
              Close room
            </button>
            <button className="btn btn-sm btn-quiet" type="button" onClick={() => setDraftPoints([])}>
              Cancel
            </button>
          </>
        )}
        {!pendingDefinitionKey && tool === "pan" && (
          <>
            <strong>Pan</strong>
            <span>Drag the sheet or use the wheel to zoom.</span>
          </>
        )}
      </div>

      <div className="plan-legend" aria-hidden="true">
        <div className="l-title">Legend</div>
        <div className="legend-row">
          <span className="legend-swatch" style={{ background: "var(--ok)" }} />
          Validated / installed
        </div>
        <div className="legend-row">
          <span className="legend-swatch" style={{ background: "var(--warning)" }} />
          Proposed
        </div>
        <div className="legend-row">
          <span className="legend-swatch" style={{ background: "var(--sheet-muted)" }} />
          Visual
        </div>
        <div className="legend-row" style={{ marginTop: 5 }}>
          <span className="chip-dot" style={{ background: "var(--danger)" }} />
          Error finding
        </div>
        <div className="legend-row">
          <span className="chip-dot" style={{ background: "var(--warning)" }} />
          Warning
        </div>
        <div className="legend-row">
          <span className="chip-dot" style={{ background: "var(--info)" }} />
          Information
        </div>
        <div className="l-title" style={{ marginTop: 7, marginBottom: 3 }}>
          Schematic symbols
        </div>
        <div className="legend-row" style={{ color: "var(--ink-muted)", lineHeight: 1.35 }}>
          Generic VECTRIX marks, not manufacturer or standard symbols.
        </div>
      </div>

      {openValidationRows.length > 0 && (
        <div className="annotation-rail" aria-label="Open findings on this drawing">
          {openValidationRows.slice(0, 9).map((finding, index) => (
            <button
              key={finding.id}
              type="button"
              className="annotation"
              data-tone={finding.severity}
              data-selected={focusValidationId === finding.id}
              title={`${finding.ruleId}: ${finding.message}`}
              aria-label={`Finding ${index + 1}, ${finding.severity}: ${finding.message}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onLocateValidation(finding);
              }}
            >
              {index + 1}
            </button>
          ))}
          {openValidationRows.length > 9 && (
            <div className="annotation-more mono">+{openValidationRows.length - 9}</div>
          )}
        </div>
      )}

      <div
        className="plan-hud"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-btn"
          style={{ width: 26, height: 26 }}
          onClick={() => zoomAt(1.16)}
          aria-label="Zoom in"
        >
          <Plus size={14} aria-hidden="true" />
        </button>
        <span className="plan-zoom mono">{zoomPercent}%</span>
        <button
          type="button"
          className="icon-btn"
          style={{ width: 26, height: 26 }}
          onClick={() => zoomAt(0.86)}
          aria-label="Zoom out"
        >
          <Minus size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-btn"
          style={{ width: 26, height: 26 }}
          onClick={() => setView(fitView(level.planWidthMm, level.planHeightMm))}
          aria-label="Fit plan to the sheet"
        >
          <Maximize2 size={13} aria-hidden="true" />
        </button>
        <span className="plan-coords mono">
          {cursor
            ? `X ${Math.round(cursor.x)}  Y ${Math.round(cursor.y)}`
            : `${level.planWidthMm} × ${level.planHeightMm} mm`}
        </span>
      </div>
    </div>
  );
}
