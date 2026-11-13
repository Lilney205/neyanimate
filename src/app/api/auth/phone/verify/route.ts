import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOriginRequest, createSession } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { isTwilioVerifyConfigured } from "@/lib/oauth-auth";
import { checkPhoneVerification } from "@/lib/phone-auth";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/),
  code: z.string().trim().regex(/^\d{4,10}$/),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!isDatabaseConfigured() || !isTwilioVerifyConfigured()) {
    return NextResponse.json({ error: "Phone sign-in is not configured yet." }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request payload." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter your name, phone number and verification code." }, { status: 400 });
  const { name, phone, code } = parsed.data;

  const ipLimit = await checkRateLimit(`phone-verify-ip:${getClientIp(request)}`, 10, 15 * 60 * 1000);
  if (!ipLimit.allowed) return rateLimitResponse(ipLimit, "Too many verification attempts. Please try again later.");
  const phoneKey = createHash("sha256").update(phone).digest("hex");
  const phoneLimit = await checkRateLimit(`phone-verify:${phoneKey}`, 5, 15 * 60 * 1000);
  if (!phoneLimit.allowed) return rateLimitResponse(phoneLimit, "Too many verification attempts for this number. Please wait before trying again.");

  try {
    const verification = await checkPhoneVerification(phone, code);
    if (verification?.status !== "approved") {
      return NextResponse.json({ error: "That code is invalid or expired. Request a new code and try again." }, { status: 401 });
    }

    let user = await prisma.user.findUnique({ where: { phone } });
    if (user?.status === "DISABLED") {
      return NextResponse.json({ error: "This account is unavailable." }, { status: 403 });
    }
    if (!user) {
      try {
        user = await prisma.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: { phone, phoneVerifiedAt: new Date(), name, role: "VIEWER", status: "ACTIVE" },
          });
          await tx.auditLog.create({
            data: {
              actorId: created.id,
              action: "user.registered_phone",
              resourceType: "User",
              resourceId: created.id,
            },
          });
          return created;
        });
      } catch {
        // A repeated verified request may race with a second request for the same number.
        user = await prisma.user.findUnique({ where: { phone } });
        if (!user) throw new Error("Could not create the phone account.");
      }
    }
    if (user.status !== "ACTIVE") {
      return NextResponse.json({ error: "This account is unavailable." }, { status: 403 });
    }

    await createSession(user.id);
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "user.login_phone",
        resourceType: "User",
        resourceId: user.id,
      },
    }).catch(() => null);
    return NextResponse.json(
      { user: { id: user.id, email: user.email, name: user.name, role: user.role } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Phone sign-in is temporarily unavailable." }, { status: 503 });
  }
}
