import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Buffer } from "node:buffer";
import { createSession, isSameOriginRequest } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";

const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(100, "Name is too long."),
  email: z.string().trim().email("Enter a valid email address.").max(254),
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
    return NextResponse.json({ error: "Account registration is temporarily unavailable." }, { status: 503 });
  }

  const ip = getClientIp(request);
  const ipLimit = await checkRateLimit(`register-ip:${ip}`, 5, 60 * 60 * 1000);
  if (!ipLimit.allowed) {
    return rateLimitResponse(ipLimit, "Too many registration attempts. Please try again later.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message ?? "Invalid registration details.";
    return NextResponse.json({ error: firstIssue, details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const emailLimit = await checkRateLimit(`register-email:${normalizedEmail}`, 3, 60 * 60 * 1000);
  if (!emailLimit.allowed) {
    return rateLimitResponse(emailLimit, "Too many registration attempts for this email. Try again later.");
  }

  // Check if an account already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "Registration could not be completed. If you already have an account, please sign in." },
      { status: 409 },
    );
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: normalizedEmail,
          name,
          password: passwordHash,
          role: "VIEWER",
          status: "ACTIVE",
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: created.id,
          action: "user.registered",
          resourceType: "User",
          resourceId: created.id,
          metadata: { email: created.email, role: created.role },
        },
      });

      return created;
    });

    await createSession(user.id);

    return NextResponse.json(
      { user },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("User registration failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not complete registration. Please try again later." }, { status: 500 });
  }
}
