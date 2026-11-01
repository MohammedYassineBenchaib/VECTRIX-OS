import type { MemberRole, RouteStatus, ValidationSeverity, ValidationStatus } from "./enums";

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Owner",
  admin: "Administrator",
  engineer: "Engineer",
  technician: "Technician",
  viewer: "Viewer",
};

export const SEVERITY_LABELS: Record<ValidationSeverity, string> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
};

export const VALIDATION_STATUS_LABELS: Record<ValidationStatus, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  accepted_risk: "Accepted risk",
  resolved: "Resolved",
};

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  visual: "Visual only",
  proposed: "Proposed",
  validated: "Checked",
  installed: "Installed",
};

export const ROUTE_STATUS_DESCRIPTION: Record<RouteStatus, string> = {
  visual: "Drawn for coordination. No engineering check has been run.",
  proposed: "A proposed path with stated assumptions. Not verified on site.",
  validated: "Passed the configured geometric and electrical checks. Not a site approval.",
  installed: "Recorded as installed from field evidence.",
};

export function percent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function amps(value: number, digits = 1): string {
  return `${value.toFixed(digits)} A`;
}

export function va(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} kVA` : `${Math.round(value)} VA`;
}
