import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Buffer } from "node:buffer";
import { hashSessionToken, isSameOriginRequest } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const resetSchema = z.object({
  token: z.string().trim().min(20).max(128),
  password: z.string().min(14, "Password must be at least 14 characters long."),
  confirmPassword: z.string().min(1, "Confirm your password."),
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: "custom",
      path: ["confirmPassword"],
      message: "Passwords do not match.",
    });
  }
  if (Buffer.byteLength(data.password, "utf8") > 72) {
    ctx.addIssue({
      code: "custom",
      path: ["password"],
      message: "Password cannot exceed 72 UTF-8 bytes.",
    });
  }
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Password reset service is temporarily unavailable." }, { status: 503 });
  }

  const ip = getClientIp(request);
  const ipLimit = await checkRateLimit(`reset-pw-ip:${ip}`, 10, 15 * 60 * 1000);
  if (!ipLimit.allowed) {
    return rateLimitResponse(ipLimit, "Too many reset attempts. Please try again later.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid reset request.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { token, password } = parsed.data;
  const tokenHash = hashSessionToken(token);

  try {
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, status: true } } },
    });

    const now = new Date();
    if (!record || record.usedAt !== null || record.expiresAt <= now || !record.user || record.user.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "This password reset link is invalid, expired, or has already been used. Please request a new one." },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.$transaction(async (tx) => {
      // Invalidate the reset token
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: now },
      });

      // Update the user's password
      await tx.user.update({
        where: { id: record.userId },
        data: { password: passwordHash },
      });

      // Invalidate all existing sessions across devices
      await tx.session.deleteMany({
        where: { userId: record.userId },
      });

      // Log the reset event
      await tx.auditLog.create({
        data: {
          actorId: record.userId,
          action: "user.password_reset_completed",
          resourceType: "User",
          resourceId: record.userId,
        },
      });
    });

    return NextResponse.json(
      { ok: true, message: "Your password has been reset successfully. You may now sign in." },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Password reset error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not reset password. Please try again." }, { status: 500 });
  }
}
