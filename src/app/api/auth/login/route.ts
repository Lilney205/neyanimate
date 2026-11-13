import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Buffer } from "node:buffer";
import { createSession, isSameOriginRequest } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

function getSafeRedirectUrl(target: string | null, fallback: string, request: Request) {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
    return fallback;
  }

  try {
    const destination = new URL(target, request.url);
    if (destination.origin !== new URL(request.url).origin) return fallback;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return fallback;
  }
}

export async function POST(request: Request) {
  const isFormSubmission = !request.headers.get("content-type")?.includes("application/json");
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Sign-in is not configured yet." }, { status: 503 });

  const ip = getClientIp(request);
  const ipLimit = await checkRateLimit(`login-ip:${ip}`, 10, 15 * 60 * 1000);
  if (!ipLimit.allowed) {
    return rateLimitResponse(ipLimit, "Too many login attempts from this network. Try again later.");
  }

  let body: unknown;
  let requestedRedirect: string | null = null;
  try {
    if (isFormSubmission) {
      const formData = await request.formData();
      body = {
        email: formData.get("email"),
        password: formData.get("password"),
      };
      const redirectValue = formData.get("redirect");
      requestedRedirect = typeof redirectValue === "string" ? redirectValue : null;
    } else {
      body = await request.json();
    }
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });

  const normalizedEmail = parsed.data.email.toLowerCase();
  if (Buffer.byteLength(parsed.data.password, "utf8") > 72) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  const accountLimit = await checkRateLimit(`login-account:${normalizedEmail}`, 5, 15 * 60 * 1000);
  if (!accountLimit.allowed) {
    return rateLimitResponse(accountLimit, "Too many login attempts for this account. Try again later.");
  }

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const validPassword = user?.password ? await bcrypt.compare(parsed.data.password, user.password) : false;
  if (!user || user.status !== "ACTIVE" || !validPassword) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  await createSession(user.id);
  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      action: "user.login",
      resourceType: "User",
      resourceId: user.id,
      metadata: { role: user.role },
    },
  }).catch(() => null);

  if (isFormSubmission) {
    const defaultDestination = user.role === "ADMIN" ? "/studio" : "/films";
    const destination = getSafeRedirectUrl(requestedRedirect, defaultDestination, request);
    return NextResponse.redirect(new URL(destination, request.url), 303);
  }

  return NextResponse.json(
    { user: { id: user.id, email: user.email, name: user.name, role: user.role } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
