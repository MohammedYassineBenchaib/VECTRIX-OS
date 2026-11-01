import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { MemberRole } from "@vectrix/core";
import { prisma } from "./db";
import { hashPassword, verifyPassword } from "./password";

export { hashPassword, verifyPassword };

export const SESSION_COOKIE = "vectrix_session";
const SESSION_TTL_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  orgId: string;
  orgName: string;
  role: MemberRole;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

export async function createSession(userId: string): Promise<CreatedSession> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      id: `ses_${randomBytes(12).toString("hex")}`,
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export async function destroySessionByToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

/**
 * Reads the session in a server component or route handler. Memoised per request
 * so a layout and its page do not perform two session queries.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            include: { org: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  const membership = session.user.memberships[0];
  if (!membership) return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    orgId: membership.orgId,
    orgName: membership.org.name,
    role: membership.role as MemberRole,
  };
});

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** Removes expired sessions; called opportunistically after login. */
export async function pruneExpiredSessions(): Promise<void> {
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  };
}
