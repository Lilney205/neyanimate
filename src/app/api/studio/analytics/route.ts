import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, roleCanAdminister } from "@/lib/auth";
import { getAdminAnalytics } from "@/lib/analytics";
import { isDatabaseConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

const querySchema = z.object({ days: z.coerce.number().int().refine((value) => [7, 30, 90].includes(value)).default(30) });

export async function GET(request: Request) {
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Analytics requires a configured database." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    if (!roleCanAdminister(user.role)) return NextResponse.json({ error: "Administrator access required." }, { status: 403, headers: { "Cache-Control": "no-store" } });

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ error: "Choose a 7, 30, or 90 day range." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    const analytics = await getAdminAnalytics(parsed.data.days as 7 | 30 | 90);
    return NextResponse.json(analytics, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "Analytics data is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
