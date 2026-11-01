/**
 * Planar geometry used by the 2D plan, the routing engine and validation.
 *
 * Conventions:
 *  - All coordinates are integer millimetres in a right-handed plan space.
 *  - x grows to the right, y grows DOWN (screen/SVG convention) so that plan
 *    rendering never needs a sign flip. Engineering angles (roof pitch,
 *    elevation) are handled separately and are never mixed into this space.
 *  - A polygon is a closed ring: the first point is NOT repeated at the end.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const ORIGIN: Readonly<Point> = Object.freeze({ x: 0, y: 0 });

export function point(x: number, y: number): Point {
  return { x, y };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function manhattanDistance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function pointsEqual(a: Point, b: Point, tolerance = 0.001): boolean {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

export function polygonAreaMm2(polygon: readonly Point[]): number {
  if (polygon.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const current = polygon[i]!;
    const next = polygon[(i + 1) % polygon.length]!;
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

export function polygonCentroid(polygon: readonly Point[]): Point {
  if (polygon.length === 0) return { ...ORIGIN };
  if (polygon.length < 3) {
    return {
      x: polygon.reduce((s, p) => s + p.x, 0) / polygon.length,
      y: polygon.reduce((s, p) => s + p.y, 0) / polygon.length,
    };
  }
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }
  if (Math.abs(twiceArea) < 1e-9) {
    return {
      x: polygon.reduce((s, p) => s + p.x, 0) / polygon.length,
      y: polygon.reduce((s, p) => s + p.y, 0) / polygon.length,
    };
  }
  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
}

function pointOnSegment(p: Point, a: Point, b: Point, tolerance = 0.001): boolean {
  const cross = (p.y - a.y) * (b.x - a.x) - (p.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > tolerance * Math.max(1, distance(a, b))) return false;
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  if (dot < -tolerance) return false;
  const sqLen = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot <= sqLen + tolerance;
}

/** Boundary counts as inside: a socket exactly on a wall belongs to the room. */
export function pointInPolygon(p: Point, polygon: readonly Point[], tolerance = 0.001): boolean {
  if (polygon.length < 3) return false;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    if (pointOnSegment(p, a, b, tolerance)) return true;
  }
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const intersects =
      a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function orientation(a: Point, b: Point, c: Point): number {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : -1;
}

/** True when two closed segments share at least one point (collinear overlap included). */
export function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(b1, a1, a2)) return true;
  if (o2 === 0 && pointOnSegment(b2, a1, a2)) return true;
  if (o3 === 0 && pointOnSegment(a1, b1, b2)) return true;
  if (o4 === 0 && pointOnSegment(a2, b1, b2)) return true;
  return false;
}

/** Robust segment intersection point for non-parallel segments. */
export function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denominator = d1x * d2y - d1y * d2x;
  if (Math.abs(denominator) < 1e-9) return null;
  const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denominator;
  const u = ((b1.x - a1.x) * d1y - (b1.y - a1.y) * d1x) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a1.x + t * d1x, y: a1.y + t * d1y };
}

export function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sqLen = dx * dx + dy * dy;
  if (sqLen === 0) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / sqLen;
  t = Math.max(0, Math.min(1, t));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sqLen = dx * dx + dy * dy;
  if (sqLen === 0) return { ...a };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / sqLen;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

export function polylineLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += distance(points[i - 1]!, points[i]!);
  }
  return total;
}

export function polylineSegments(points: readonly Point[]): Array<{ a: Point; b: Point }> {
  const segments: Array<{ a: Point; b: Point }> = [];
  for (let i = 1; i < points.length; i += 1) {
    segments.push({ a: points[i - 1]!, b: points[i]! });
  }
  return segments;
}

export function isOrthogonalPolyline(points: readonly Point[], toleranceMm = 1): boolean {
  return polylineSegments(points).every(
    (segment) =>
      Math.abs(segment.a.x - segment.b.x) <= toleranceMm ||
      Math.abs(segment.a.y - segment.b.y) <= toleranceMm,
  );
}

/** Removes duplicate consecutive points and points that add no direction change. */
export function simplifyPolyline(points: readonly Point[], toleranceMm = 0.5): Point[] {
  const deduped: Point[] = [];
  for (const p of points) {
    const last = deduped[deduped.length - 1];
    if (!last || distance(last, p) > toleranceMm) deduped.push({ x: p.x, y: p.y });
  }
  if (deduped.length < 3) return deduped;
  const result: Point[] = [deduped[0]!];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const prev = result[result.length - 1]!;
    const current = deduped[i]!;
    const next = deduped[i + 1]!;
    if (!pointOnSegment(current, prev, next, toleranceMm)) result.push({ ...current });
  }
  result.push(deduped[deduped.length - 1]!);
  return result;
}

export function snapValue(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function snapPointToGrid(p: Point, step: number): Point {
  return { x: snapValue(p.x, step), y: snapValue(p.y, step) };
}

/** Snaps to the nearest candidate within `thresholdMm`; returns the input otherwise. */
export function snapPoint(
  p: Point,
  candidates: readonly Point[],
  thresholdMm: number,
): { point: Point; snapped: boolean } {
  let best: Point | null = null;
  let bestDistance = thresholdMm;
  for (const candidate of candidates) {
    const d = distance(p, candidate);
    if (d <= bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best ? { point: { ...best }, snapped: true } : { point: { ...p }, snapped: false };
}

export function polygonBounds(polygon: readonly Point[]): Bounds {
  if (polygon.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polygon) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

export function boundsWidth(bounds: Bounds): number {
  return bounds.maxX - bounds.minX;
}

export function boundsHeight(bounds: Bounds): number {
  return bounds.maxY - bounds.minY;
}

export function boundsCenter(bounds: Bounds): Point {
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

export function expandBounds(bounds: Bounds, margin: number): Bounds {
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
  };
}

export function rectPolygon(x: number, y: number, width: number, height: number): Point[] {
  const x2 = x + width;
  const y2 = y + height;
  return [
    { x, y },
    { x: x2, y },
    { x: x2, y: y2 },
    { x, y: y2 },
  ];
}

export function rectFromDrag(start: Point, end: Point): Point[] {
  const x1 = Math.min(start.x, end.x);
  const y1 = Math.min(start.y, end.y);
  const x2 = Math.max(start.x, end.x);
  const y2 = Math.max(start.y, end.y);
  return rectPolygon(x1, y1, x2 - x1, y2 - y1);
}

/**
 * Douglas–Peucker simplification for imported geometry. Kept separate from
 * `simplifyPolyline` because imported drawings need tolerance-based reduction,
 * not collinearity cleanup.
 */
export function simplifyPointsRdp(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  let maxDistance = 0;
  let index = 0;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  for (let i = 1; i < points.length - 1; i += 1) {
    const d = distancePointToSegment(points[i]!, first, last);
    if (d > maxDistance) {
      maxDistance = d;
      index = i;
    }
  }
  if (maxDistance <= tolerance) return [{ ...first }, { ...last }];
  const left = simplifyPointsRdp(points.slice(0, index + 1), tolerance);
  const right = simplifyPointsRdp(points.slice(index), tolerance);
  return [...left.slice(0, -1), ...right];
}
