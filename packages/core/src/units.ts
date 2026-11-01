/**
 * Units are not decoration. Mixing metres, millimetres and "plan units" is one
 * of the most common sources of silent engineering error, so VECTRIX stores
 * every geometric value in integer millimetres and converts only at the edge
 * (display, import/export, PDF).
 */

export const MM_PER_M = 1000;
export const MM_PER_CM = 10;
export const MM2_PER_M2 = 1_000_000;

export function mmToM(mm: number): number {
  return mm / MM_PER_M;
}

export function mToMm(m: number): number {
  return Math.round(m * MM_PER_M);
}

export function m2FromMm2(mm2: number): number {
  return mm2 / MM2_PER_M2;
}

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function formatLengthMm(mm: number): string {
  if (!Number.isFinite(mm)) return "—";
  if (Math.abs(mm) < MM_PER_M) return `${Math.round(mm)} mm`;
  return `${roundTo(mm / MM_PER_M, 2)} m`;
}

export function formatAreaMm2(mm2: number): string {
  if (!Number.isFinite(mm2)) return "—";
  return `${roundTo(mm2 / MM2_PER_M2, 2)} m²`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
