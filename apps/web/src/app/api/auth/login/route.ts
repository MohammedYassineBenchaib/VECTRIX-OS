import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { MemberRole } from "@vectrix/core";
import { prisma } from "@/server/db";
import {
  apiRoute,
  assertSameOrigin,
  clientKey,
  json,
  rateLimit,
  readJson,
  apiError,
} from "@/server/api";
import {
  createSession,
  pruneExpiredSessions,
  sessionCookieOptions,
  SESSION_COOKIE,
  verifyPassword,
} from "@/server/auth";
import { loginSchema } from "@/server/schemas";

export async function POST(request: Request) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    rateLimit(clientKey(request, "login"), 10, 60_000);
    const input = await readJson(request, loginSchema);

    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: {
        memberships: { include: { org: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      apiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    const membership = user.memberships[0];
    if (!membership) {
      apiError(403, "NO_ORGANISATION", "This account is not a member of an organisation.");
    }

    await pruneExpiredSessions();
    const session = await createSession(user.id);
    const response = json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        orgId: membership.orgId,
        orgName: membership.org.name,
        role: membership.role as MemberRole,
      },
    });
    response.cookies.set(SESSION_COOKIE, session.token, sessionCookieOptions(session.expiresAt));
    return response;
  });
}

export async function DELETE(request: Request) {
  return apiRoute(async () => {
    assertSameOrigin(request);
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (token) {
      const { destroySessionByToken } = await import("@/server/auth");
      await destroySessionByToken(token);
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  });
}
