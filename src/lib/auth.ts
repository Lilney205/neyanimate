import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "ney_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
export type Role = "VIEWER" | "EDITOR" | "ADMIN";

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function roleCanManageFilms(role: Role) {
  return role === "ADMIN";
}

export function roleCanAdminister(role: Role) {
  return role === "ADMIN";
}

export async function createSession(userId: string) {
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);
  await prisma.session.create({ data: { tokenHash: hashSessionToken(token), userId, expiresAt } });

  try {
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  } catch {
    // Gracefully handle execution outside Next.js request context (e.g. CLI or unit test runners)
  }

  return token;
}

export async function getCurrentUser() {
  let token: string | undefined;
  try {
    const cookieStore = await cookies();
    token = cookieStore.get(SESSION_COOKIE)?.value;
  } catch {
    token = undefined;
  }

  if (!token || token.length > 128) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true, status: true } } },
  });
  if (!session || session.expiresAt <= new Date() || session.user.status !== "ACTIVE") return null;
  return session.user;
}

export async function deleteCurrentSession() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (token && token.length <= 128) {
      await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
    }
    cookieStore.delete(SESSION_COOKIE);
  } catch {
    // Gracefully handle execution outside Next.js request context
  }
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
