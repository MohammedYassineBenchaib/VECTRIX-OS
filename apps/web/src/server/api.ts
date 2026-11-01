import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import { can, type Capability, type MemberRole } from "@vectrix/core";
import { prisma } from "./db";
import { getSessionUser, type SessionUser } from "./auth";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiError(status: number, code: string, message: string, details?: unknown): never {
  throw new ApiError(status, code, message, details);
}

export function json<T>(data: T, init?: ResponseInit): NextResponse<T> {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * Same-origin guard for state-changing requests.
 *
 * The session cookie is SameSite=Lax, which already blocks cross-site POSTs in
 * modern browsers. This is defence in depth: if an Origin header is present it
 * must match the request host. Non-browser clients (curl, tests) may omit it.
 */
export function assertSameOrigin(request: Request): void {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    apiError(403, "BAD_ORIGIN", "Request origin is not a valid URL.");
  }
  if (!host || originHost !== host) {
    apiError(403, "BAD_ORIGIN", "Cross-origin state changes are not allowed.");
  }
}

export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) apiError(401, "UNAUTHENTICATED", "Sign in to continue.");
  return user;
}

/**
 * Capability check for routes that are not scoped to a project (for example
 * creating a project). Project-scoped routes use `requireProjectAccess`, which
 * performs the same capability check after establishing organisation scope.
 */
export function requireApiCapability(user: SessionUser, capability: Capability): void {
  if (!can(user.role, capability)) {
    apiError(403, "FORBIDDEN", `Your role (${user.role}) does not allow ${capability}.`);
  }
}

export interface ProjectAccess {
  user: SessionUser;
  projectId: string;
  role: MemberRole;
  project: { id: string; orgId: string; name: string; code: string };
}

/**
 * Project access is derived from the authenticated session, never from a
 * client-supplied organisation id. A project outside the user's organisation is
 * reported as not found so its existence is not leaked.
 */
export async function requireProjectAccess(
  projectId: string,
  capability: Capability,
): Promise<ProjectAccess> {
  const user = await requireApiUser();
  const project = await prisma.project.findFirst({
    where: { id: projectId, orgId: user.orgId },
    select: { id: true, orgId: true, name: true, code: true },
  });
  if (!project) apiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  if (!can(user.role, capability)) {
    apiError(403, "FORBIDDEN", `Your role (${user.role}) does not allow ${capability}.`);
  }
  return { user, projectId: project.id, role: user.role, project };
}

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    apiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    apiError(422, "VALIDATION_FAILED", "Request data is invalid.", parsed.error.issues);
  }
  return parsed.data;
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "Request data is invalid.",
          details: error.issues,
        },
      },
      { status: 422 },
    );
  }
  console.error("api.unhandled", error);
  return json(
    {
      error: {
        code: "INTERNAL",
        message: "An unexpected server error occurred. No changes were saved.",
      },
    },
    { status: 500 },
  );
}

export async function apiRoute(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    return handleApiError(error);
  }
}

// --- Rate limiting ----------------------------------------------------------
// In-memory, per-process. This is adequate for the single-instance MVP and is
// documented as such; a shared Redis limiter is required before horizontal
// scaling. Limits are intentionally generous for normal use.

interface Bucket {
  count: number;
  resetAt: number;
}
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    apiError(429, "RATE_LIMITED", "Too many attempts. Wait a moment and try again.");
  }
}

export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? "local";
  return `${scope}:${ip}`;
}
