import type { MemberRole } from "./enums";

/**
 * Server-side authorization. The UI uses the same capability list to hide
 * controls, but the server always re-checks; hiding a button is not security.
 */
export const CAPABILITIES = [
  "project:read",
  "project:write",
  "project:delete",
  "design:write",
  "validation:run",
  "validation:resolve",
  "estimate:read",
  "field:read",
  "field:write",
  "org:manage",
  "audit:read",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<MemberRole, readonly Capability[]> = {
  owner: [...CAPABILITIES],
  admin: CAPABILITIES.filter((c) => c !== "project:delete"),
  engineer: [
    "project:read",
    "project:write",
    "design:write",
    "validation:run",
    "validation:resolve",
    "estimate:read",
    "field:read",
    "field:write",
    "audit:read",
  ],
  technician: ["project:read", "field:read", "field:write", "estimate:read"],
  viewer: ["project:read", "estimate:read"],
};

export function can(role: MemberRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function requireCapability(role: MemberRole, capability: Capability): void {
  if (!can(role, capability)) {
    throw new AuthorizationError(capability);
  }
}

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";
  constructor(public readonly capability: Capability) {
    super(`Your role does not allow this action (${capability}).`);
    this.name = "AuthorizationError";
  }
}
