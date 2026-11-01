import type { Circuit, Equipment, ValidationResult } from "@vectrix/core";

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatVA(value: number): string {
  if (value >= 1000) return `${formatNumber(value / 1000, 2)} kVA`;
  return `${formatNumber(value)} VA`;
}

export function formatMm(value: number): string {
  return `${formatNumber(value)} mm`;
}

export function formatMetres(value: number, digits = 1): string {
  return `${formatNumber(value, digits)} m`;
}

export function formatPercent(value: number, digits = 0): string {
  return `${formatNumber(value, digits)}%`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function relativeDate(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(date);
}

export function severityRank(severity: ValidationResult["severity"]): number {
  return severity === "error" ? 0 : severity === "warning" ? 1 : 2;
}

export function utilization(circuit: Circuit, currentA: number): number {
  return circuit.breakerRatingA > 0 ? (currentA / circuit.breakerRatingA) * 100 : 0;
}

export function utilizationTone(pct: number): "ok" | "warning" | "error" {
  if (pct > 100) return "error";
  if (pct > 80) return "warning";
  return "ok";
}

export function equipmentDefinitionName(
  definitions: ReadonlyMap<string, { name: string }>,
  key: string,
): string {
  return definitions.get(key)?.name ?? key;
}

export function roomForEquipment(
  equipment: Equipment,
  rooms: Array<{ id: string; name: string }>,
): string {
  return rooms.find((room) => room.id === equipment.roomId)?.name ?? "Unassigned";
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
