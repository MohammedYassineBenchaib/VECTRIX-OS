/**
 * Deterministic orthogonal routing.
 *
 * The engine is deliberately conservative:
 *  - Walls are obstacles. A wall is never crossed automatically, even when the
 *    wall is marked as accepting penetrations; penetrations are an explicit
 *    design decision and are surfaced as diagnostics.
 *  - The grid resolution and clearance become part of the output assumptions.
 *  - Two identical inputs always produce the same path (stable tie-breaking).
 *
 * A feasible path means "the engine found a path on its discretised model".
 * It does NOT mean the route is physically constructible, approved or safe to
 * drill. That distinction is enforced by the route lifecycle, not UI copy.
 */

import {
  distance,
  distancePointToSegment,
  polylineLength,
  polylineSegments,
  segmentIntersection,
  segmentsIntersect,
  simplifyPolyline,
  type Bounds,
  type Point,
} from "@vectrix/core";
import type { RouteDiagnostic } from "@vectrix/core";

export const ROUTING_METHOD_VERSION = "route-astar-2026.10";

export interface RoutingWall {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  thicknessMm: number;
  allowPenetration: boolean;
}

export interface RoutingOptions {
  /** Grid resolution in millimetres. Smaller is slower and can look more precise. */
  gridMm: number;
  /** Required free distance from a wall centreline, beyond half its thickness. */
  clearanceMm: number;
  /** Added cost for a 90° change of direction, in millimetres of equivalent length. */
  turnPenaltyMm: number;
  maxCells: number;
}

export const DEFAULT_ROUTING_OPTIONS: RoutingOptions = {
  gridMm: 250,
  clearanceMm: 50,
  turnPenaltyMm: 400,
  maxCells: 120_000,
};

export interface RoutingRequest {
  bounds: Bounds;
  walls: RoutingWall[];
  start: Point;
  end: Point;
  options?: Partial<RoutingOptions>;
}

export interface RoutingResult {
  feasible: boolean;
  points: Point[];
  lengthMm: number;
  turns: number;
  cellsExplored: number;
  diagnostics: RouteDiagnostic[];
  assumptions: string[];
  methodVersion: string;
}

interface Grid {
  originX: number;
  originY: number;
  gridMm: number;
  cols: number;
  rows: number;
  blocked: Uint8Array;
}

function buildGrid(bounds: Bounds, walls: RoutingWall[], options: RoutingOptions): Grid {
  const gridMm = options.gridMm;
  const cols = Math.floor((bounds.maxX - bounds.minX) / gridMm) + 1;
  const rows = Math.floor((bounds.maxY - bounds.minY) / gridMm) + 1;
  const blocked = new Uint8Array(cols * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = bounds.minX + col * gridMm;
      const y = bounds.minY + row * gridMm;
      let isBlocked = false;
      for (const wall of walls) {
        const radius = wall.thicknessMm / 2 + options.clearanceMm;
        const d = distancePointToSegment(
          { x, y },
          { x: wall.startX, y: wall.startY },
          { x: wall.endX, y: wall.endY },
        );
        if (d <= radius) {
          isBlocked = true;
          break;
        }
      }
      blocked[row * cols + col] = isBlocked ? 1 : 0;
    }
  }
  return { originX: bounds.minX, originY: bounds.minY, gridMm, cols, rows, blocked };
}

function cellPoint(grid: Grid, index: number): Point {
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  return { x: grid.originX + col * grid.gridMm, y: grid.originY + row * grid.gridMm };
}

function nearestFreeCell(grid: Grid, target: Point, maxRadiusCells = 12): number | null {
  const targetCol = Math.round((target.x - grid.originX) / grid.gridMm);
  const targetRow = Math.round((target.y - grid.originY) / grid.gridMm);
  const clampCol = Math.max(0, Math.min(grid.cols - 1, targetCol));
  const clampRow = Math.max(0, Math.min(grid.rows - 1, targetRow));
  for (let radius = 0; radius <= maxRadiusCells; radius += 1) {
    let best: { index: number; d: number } | null = null;
    for (let row = clampRow - radius; row <= clampRow + radius; row += 1) {
      for (let col = clampCol - radius; col <= clampCol + radius; col += 1) {
        if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue;
        if (Math.max(Math.abs(col - clampCol), Math.abs(row - clampRow)) !== radius) continue;
        const index = row * grid.cols + col;
        if (grid.blocked[index]) continue;
        const d = distance(cellPoint(grid, index), target);
        if (!best || d < best.d) best = { index, d };
      }
    }
    if (best) return best.index;
  }
  return null;
}

class MinHeap<T> {
  private items: Array<{ priority: number; tie: number; value: T }> = [];

  push(priority: number, tie: number, value: T): void {
    this.items.push({ priority, tie, value });
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined;
    const first = this.items[0]!;
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return first.value;
  }

  get size(): number {
    return this.items.length;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.less(index, parent)) {
        const tmp = this.items[index]!;
        this.items[index] = this.items[parent]!;
        this.items[parent] = tmp;
        index = parent;
      } else break;
    }
  }

  private sinkDown(index: number): void {
    for (;;) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.items.length && this.less(left, smallest)) smallest = left;
      if (right < this.items.length && this.less(right, smallest)) smallest = right;
      if (smallest === index) break;
      const tmp = this.items[index]!;
      this.items[index] = this.items[smallest]!;
      this.items[smallest] = tmp;
      index = smallest;
    }
  }

  private less(a: number, b: number): boolean {
    const left = this.items[a]!;
    const right = this.items[b]!;
    if (left.priority !== right.priority) return left.priority < right.priority;
    return left.tie < right.tie;
  }
}

const DIRECTIONS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

function joinOrthogonal(from: Point, to: Point, preferHorizontalFirst: boolean): Point[] {
  if (from.x === to.x || from.y === to.y) return [{ ...from }, { ...to }];
  const elbow = preferHorizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  return [{ ...from }, elbow, { ...to }];
}

export function routeOrthogonal(request: RoutingRequest): RoutingResult {
  const options: RoutingOptions = { ...DEFAULT_ROUTING_OPTIONS, ...request.options };
  const diagnostics: RouteDiagnostic[] = [];
  const assumptions = [
    `Orthogonal grid ${options.gridMm} mm; clearance ${options.clearanceMm} mm beyond wall half-thickness; turn penalty ${options.turnPenaltyMm} mm.`,
    "Walls are modelled as solid obstacles. Penetrations are not generated automatically.",
    "This is a geometric proposal on a discretised model, not proof of physical constructibility.",
  ];

  if (options.gridMm < 50) {
    return {
      feasible: false,
      points: [],
      lengthMm: 0,
      turns: 0,
      cellsExplored: 0,
      diagnostics: [
        {
          code: "GRID_TOO_FINE",
          severity: "error",
          message: "Grid resolution below 50 mm is not supported.",
          data: {},
        },
      ],
      assumptions,
      methodVersion: ROUTING_METHOD_VERSION,
    };
  }

  const grid = buildGrid(request.bounds, request.walls, options);
  if (grid.cols * grid.rows > options.maxCells) {
    return {
      feasible: false,
      points: [],
      lengthMm: 0,
      turns: 0,
      cellsExplored: 0,
      diagnostics: [
        {
          code: "GRID_TOO_LARGE",
          severity: "error",
          message: `Plan requires ${grid.cols * grid.rows} cells, above the ${options.maxCells} limit. Increase the grid resolution or split the route.`,
          data: { cols: grid.cols, rows: grid.rows },
        },
      ],
      assumptions,
      methodVersion: ROUTING_METHOD_VERSION,
    };
  }

  const startCell = nearestFreeCell(grid, request.start);
  const endCell = nearestFreeCell(grid, request.end);
  if (startCell === null || endCell === null) {
    return {
      feasible: false,
      points: [],
      lengthMm: 0,
      turns: 0,
      cellsExplored: 0,
      diagnostics: [
        {
          code: "NO_FREE_CELL",
          severity: "error",
          message:
            "No free grid cell was found near an endpoint. Check the plan bounds, wall thickness and clearance.",
          data: {},
        },
      ],
      assumptions,
      methodVersion: ROUTING_METHOD_VERSION,
    };
  }

  const startPoint = cellPoint(grid, startCell);
  const endPoint = cellPoint(grid, endCell);

  const totalCells = grid.cols * grid.rows;
  const gScore = new Float64Array(totalCells * 5).fill(Infinity);
  const cameFrom = new Int32Array(totalCells * 5).fill(-1);
  const visited = new Uint8Array(totalCells * 5);
  const startState = startCell * 5 + 4;
  gScore[startState] = 0;

  const heap = new MinHeap<number>();
  const heuristic = (index: number) => {
    const p = cellPoint(grid, index);
    return Math.abs(p.x - endPoint.x) + Math.abs(p.y - endPoint.y);
  };
  heap.push(heuristic(startCell), 0, startState);

  let cellsExplored = 0;
  let goalState = -1;

  while (heap.size > 0) {
    const state = heap.pop()!;
    if (visited[state]) continue;
    visited[state] = 1;
    cellsExplored += 1;
    const cell = Math.floor(state / 5);
    const direction = state % 5;
    if (cell === endCell) {
      goalState = state;
      break;
    }
    const point = cellPoint(grid, cell);
    for (let dir = 0; dir < DIRECTIONS.length; dir += 1) {
      const { dx, dy } = DIRECTIONS[dir]!;
      const col = (cell % grid.cols) + dx;
      const row = Math.floor(cell / grid.cols) + dy;
      if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue;
      const nextCell = row * grid.cols + col;
      if (grid.blocked[nextCell]) continue;
      const isTurn = direction !== 4 && direction !== dir;
      const stepCost = options.gridMm + (isTurn ? options.turnPenaltyMm : 0);
      const nextState = nextCell * 5 + dir;
      const tentative = gScore[state]! + stepCost;
      if (tentative < gScore[nextState]!) {
        gScore[nextState] = tentative;
        cameFrom[nextState] = state;
        const nextPoint = cellPoint(grid, nextCell);
        // A small tie-break contribution keeps paths stable but never dominates f.
        const tie =
          Math.abs(nextPoint.x - request.end.x) + Math.abs(nextPoint.y - request.end.y);
        heap.push(tentative + heuristic(nextCell), tie, nextState);
      }
    }
    void point;
  }

  if (goalState < 0) {
    return {
      feasible: false,
      points: [],
      lengthMm: 0,
      turns: 0,
      cellsExplored,
      diagnostics: [
        {
          code: "NO_PATH",
          severity: "warning",
          message:
            "No path was found at the configured clearance. The route may be blocked by walls, shafts or the plan boundary.",
          data: { start: request.start, end: request.end },
        },
      ],
      assumptions,
      methodVersion: ROUTING_METHOD_VERSION,
    };
  }

  const cellPath: Point[] = [];
  let cursor = goalState;
  while (cursor !== -1) {
    cellPath.push(cellPoint(grid, Math.floor(cursor / 5)));
    cursor = cameFrom[cursor]!;
  }
  cellPath.reverse();

  const startMoved = distance(startPoint, request.start) > options.gridMm * 0.75;
  const endMoved = distance(endPoint, request.end) > options.gridMm * 0.75;
  if (startMoved || endMoved) {
    diagnostics.push({
      code: "ENDPOINT_SNAPPED",
      severity: "info",
      message:
        "One or more endpoints were moved to the nearest free grid point because the exact point lies inside a wall clearance zone.",
      data: {
        startSnappedTo: startPoint,
        endSnappedTo: endPoint,
      },
    });
  }

  const rawPath: Point[] = [{ ...request.start }];
  const firstAlignHorizontal = Math.abs(request.start.y - startPoint.y) <= Math.abs(request.start.x - startPoint.x);
  rawPath.push(...joinOrthogonal(request.start, startPoint, firstAlignHorizontal).slice(1));
  rawPath.push(...cellPath.slice(1));
  const lastBeforeEnd = rawPath[rawPath.length - 1]!;
  const endAlignHorizontal = Math.abs(lastBeforeEnd.y - endPoint.y) <= Math.abs(lastBeforeEnd.x - endPoint.x);
  rawPath.push(...joinOrthogonal(lastBeforeEnd, request.end, endAlignHorizontal).slice(1));

  const points = simplifyPolyline(rawPath, 1);
  const lengthMm = polylineLength(points);
  const turns = Math.max(0, points.length - 2);

  return {
    feasible: true,
    points,
    lengthMm,
    turns,
    cellsExplored,
    diagnostics,
    assumptions,
    methodVersion: ROUTING_METHOD_VERSION,
  };
}

export interface RouteGeometryCheckInput {
  points: Point[];
  bounds: Bounds;
  walls: RoutingWall[];
  anchors: Array<{ id: string; point: Point }>;
  anchorToleranceMm?: number;
  /** Whether the route is expected to terminate at equipment. */
  requireAnchors?: boolean;
}

function properCrossing(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const intersection = segmentIntersection(a1, a2, b1, b2);
  if (!intersection) return null;
  const nearEndpoint =
    distance(intersection, a1) < 1 ||
    distance(intersection, a2) < 1 ||
    distance(intersection, b1) < 1 ||
    distance(intersection, b2) < 1;
  return nearEndpoint ? null : intersection;
}

export function checkRouteGeometry(input: RouteGeometryCheckInput): RouteDiagnostic[] {
  const diagnostics: RouteDiagnostic[] = [];
  const points = input.points;
  if (points.length < 2) {
    return [
      {
        code: "ROUTE_TOO_SHORT",
        severity: "error",
        message: "A route needs at least two points.",
        data: {},
      },
    ];
  }

  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.x !== b.x && a.y !== b.y) {
      diagnostics.push({
        code: "DIAGONAL_SEGMENT",
        severity: "warning",
        message:
          "Segment is not orthogonal. Diagonal runs must be justified for the selected installation method.",
        data: { segmentIndex: i - 1, from: a, to: b },
      });
    }
    if (distance(a, b) < 1) {
      diagnostics.push({
        code: "ZERO_LENGTH_SEGMENT",
        severity: "warning",
        message: "Duplicate consecutive route point.",
        data: { segmentIndex: i - 1 },
      });
    } else if (distance(a, b) < 100) {
      diagnostics.push({
        code: "SHORT_SEGMENT",
        severity: "info",
        message: "Route segment shorter than 100 mm may be impractical to install.",
        data: { segmentIndex: i - 1, lengthMm: Math.round(distance(a, b)) },
      });
    }
  }

  for (const p of points) {
    if (
      p.x < input.bounds.minX ||
      p.y < input.bounds.minY ||
      p.x > input.bounds.maxX ||
      p.y > input.bounds.maxY
    ) {
      diagnostics.push({
        code: "OUTSIDE_PLAN",
        severity: "warning",
        message: "Route point lies outside the level plan bounds.",
        data: { point: p },
      });
    }
  }

  const crossedWalls = new Set<string>();
  const penetratedWalls = new Set<string>();
  for (let i = 1; i < points.length; i += 1) {
    for (const wall of input.walls) {
      const crossing = properCrossing(
        points[i - 1]!,
        points[i]!,
        { x: wall.startX, y: wall.startY },
        { x: wall.endX, y: wall.endY },
      );
      if (!crossing) continue;
      if (wall.allowPenetration) {
        if (!penetratedWalls.has(wall.id)) {
          penetratedWalls.add(wall.id);
          diagnostics.push({
            code: "PENETRATION_DECLARED",
            severity: "info",
            message: "Route crosses a wall that is marked as accepting a penetration.",
            data: { wallId: wall.id, at: crossing },
          });
        }
      } else if (!crossedWalls.has(wall.id)) {
        crossedWalls.add(wall.id);
        diagnostics.push({
          code: "WALL_CROSSING",
          severity: "warning",
          message:
            "Route crosses a wall that is not marked as accepting a penetration. Declare the penetration or change the route.",
          data: { wallId: wall.id, at: crossing },
        });
      }
    }
  }

  const segments = polylineSegments(points);
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (j === i + 1) continue;
      if (segmentsIntersect(segments[i]!.a, segments[i]!.b, segments[j]!.a, segments[j]!.b)) {
        diagnostics.push({
          code: "SELF_INTERSECTION",
          severity: "warning",
          message: "Route intersects itself. Confirm the physical installation and cable pulling path.",
          data: { segmentA: i, segmentB: j },
        });
      }
    }
  }

  if (input.requireAnchors !== false) {
    const tolerance = input.anchorToleranceMm ?? 300;
    for (const endpoint of [points[0]!, points[points.length - 1]!]) {
      const nearest = input.anchors.reduce<{ id: string; d: number } | null>((best, anchor) => {
        const d = distance(endpoint, anchor.point);
        if (!best || d < best.d) return { id: anchor.id, d };
        return best;
      }, null);
      if (!nearest || nearest.d > tolerance) {
        diagnostics.push({
          code: "DANGLING_ENDPOINT",
          severity: "warning",
          message: `Route endpoint is not within ${tolerance} mm of equipment. A route must connect declared connection points.`,
          data: { endpoint, nearestEquipmentId: nearest?.id ?? null, nearestDistanceMm: nearest ? Math.round(nearest.d) : null },
        });
      }
    }
  }

  return diagnostics;
}

export function summarizeRoute(points: Point[]): { lengthMm: number; turns: number } {
  const simplified = simplifyPolyline(points, 1);
  return {
    lengthMm: polylineLength(simplified),
    turns: Math.max(0, simplified.length - 2),
  };
}
