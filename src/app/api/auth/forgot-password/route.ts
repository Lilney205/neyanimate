import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { hashSessionToken, isSameOriginRequest } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email";

const forgotSchema = z.object({
  email: z.string().trim().email().max(254),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Password recovery is temporarily unavailable." }, { status: 503 });
  }

  const ip = getClientIp(request);
  const ipLimit = await checkRateLimit(`recovery-ip:${ip}`, 5, 15 * 60 * 1000);
  if (!ipLimit.allowed) {
    return rateLimitResponse(ipLimit, "Too many recovery attempts from this network. Try again later.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const parsed = forgotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const normalizedEmail = parsed.data.email.toLowerCase().trim();
  const emailLimit = await checkRateLimit(`recovery-email:${normalizedEmail}`, 3, 15 * 60 * 1000);
  if (!emailLimit.allowed) {
    return rateLimitResponse(emailLimit, "Too many recovery attempts for this email. Try again later.");
  }

  const genericResponse = NextResponse.json(
    { ok: true, message: "If an account exists with this email, password reset instructions have been sent." },
    { headers: { "Cache-Control": "no-store" } },
  );

  try {
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, status: true },
    });

    if (!user || !user.email || user.status !== "ACTIVE") {
      // Safe enumeration prevention: return identical generic response
      return genericResponse;
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashSessionToken(rawToken);
    const expiryMinutes = parseInt(process.env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES || "15", 10);
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      // Invalidate existing unused tokens for this user
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      // Create new reset token
      await tx.passwordResetToken.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "user.password_reset_requested",
          resourceType: "User",
          resourceId: user.id,
        },
      });
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    await sendPasswordResetEmail({
      to: user.email,
      resetUrl,
    });

    return genericResponse;
  } catch (error) {
    console.error("Password recovery request error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Password recovery could not be processed." }, { status: 500 });
  }
}
