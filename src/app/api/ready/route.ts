import { NextResponse } from "next/server";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

export async function GET() {
  const checks: Record<string, "healthy" | "unhealthy" | "unconfigured"> = {
    database: "unconfigured",
    rateLimiter: "unhealthy",
  };

  let allReady = true;

  // 1. Check database connectivity
  if (isDatabaseConfigured()) {
    try {
      await prisma.$queryRawUnsafe("SELECT 1;");
      checks.database = "healthy";
    } catch {
      checks.database = "unhealthy";
      allReady = false;
    }
  } else {
    // In production without database, application is not ready
    if (process.env.NODE_ENV === "production") {
      allReady = false;
    }
  }

  // 2. Check rate limiter responsiveness
  try {
    const rateCheck = await checkRateLimit("readiness-probe", 1000, 60_000);
    if (rateCheck.allowed) {
      checks.rateLimiter = "healthy";
    } else {
      checks.rateLimiter = "unhealthy";
      allReady = false;
    }
  } catch {
    checks.rateLimiter = "unhealthy";
    allReady = false;
  }

  const statusCode = allReady ? 200 : 503;

  return NextResponse.json(
    {
      status: allReady ? "ready" : "unready",
      checks,
      timestamp: new Date().toISOString(),
    },
    {
      status: statusCode,
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    },
  );
}
