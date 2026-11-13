import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isDatabaseConfigured } from "@/lib/db";
import { isSameOriginRequest } from "@/lib/auth";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { isTwilioVerifyConfigured } from "@/lib/oauth-auth";
import { sendPhoneVerification } from "@/lib/phone-auth";

const schema = z.object({
  phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Enter the phone number with country code, such as +14155552671."),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!isDatabaseConfigured() || !isTwilioVerifyConfigured()) {
    return NextResponse.json({ error: "Phone sign-in is not configured yet." }, { status: 503 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request payload." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid phone number." }, { status: 400 });

  const phone = parsed.data.phone;
  const ipLimit = await checkRateLimit(`phone-start-ip:${getClientIp(request)}`, 5, 15 * 60 * 1000);
  if (!ipLimit.allowed) return rateLimitResponse(ipLimit, "Too many code requests. Please wait before trying again.");
  const phoneKey = createHash("sha256").update(phone).digest("hex");
  const phoneLimit = await checkRateLimit(`phone-start:${phoneKey}`, 3, 15 * 60 * 1000);
  if (!phoneLimit.allowed) return rateLimitResponse(phoneLimit, "Too many code requests for this number. Please wait before trying again.");

  try {
    const result = await sendPhoneVerification(phone);
    if (result?.status !== "pending") {
      return NextResponse.json({ error: "We could not send a code to that number. Check it and try again." }, { status: 503 });
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Phone verification is temporarily unavailable." }, { status: 503 });
  }
}
