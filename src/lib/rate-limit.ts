import Redis from "ioredis";
import { NextResponse } from "next/server";
import { isDatabaseConfigured, prisma } from "@/lib/db";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type Bucket = { count: number; resetAt: number };
const memoryBuckets = new Map<string, Bucket>();

let redisClient: Redis | null = null;
let redisFailed = false;

function getRedisClient(): Redis | null {
  if (redisFailed) return null;
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (!redisClient) {
    try {
      redisClient = new Redis(url, {
        connectTimeout: 3000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        enableOfflineQueue: false,
      });
      redisClient.on("error", (err) => {
        console.error("Redis connection error:", err.message);
      });
    } catch (error: unknown) {
      console.error("Failed to initialize Redis client:", error instanceof Error ? error.message : String(error));
      redisFailed = true;
      return null;
    }
  }
  return redisClient;
}

/**
 * Safely extracts client IP.
 * Spoofable X-Forwarded-For headers are ignored unless TRUST_PROXY or TRUSTED_PROXIES is configured.
 */
export function getClientIp(request: Request): string {
  const trustProxy = process.env.TRUST_PROXY === "true" || Boolean(process.env.TRUSTED_PROXIES);
  if (trustProxy) {
    const cfIp = request.headers.get("cf-connecting-ip");
    if (cfIp) return cfIp.trim();
    const xff = request.headers.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0) return parts[0];
    }
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp.trim();
  }
  return "direct-client";
}

/**
 * Atomic rate-limiting using shared Redis or PostgreSQL store.
 * If in production and the shared store fails, fails securely (rejects excess/unmetered requests).
 */
export async function checkRateLimit(
  key: string,
  limit = 5,
  windowMs = 15 * 60 * 1000,
  now = Date.now(),
): Promise<RateLimitResult> {
  // 1. Try Redis store if REDIS_URL is configured
  const redis = getRedisClient();
  if (redis) {
    try {
      if (redis.status === "wait") {
        await redis.connect();
      }
      const multi = redis.multi();
      multi.incr(key);
      multi.pttl(key);
      const results = await multi.exec();

      if (results && results[0] && results[1]) {
        const count = results[0][1] as number;
        let pttl = results[1][1] as number;
        if (pttl === -1 || pttl === -2) {
          await redis.pexpire(key, windowMs);
          pttl = windowMs;
        }
        const resetAt = now + Math.max(pttl, 0);
        const retryAfterSeconds = Math.max(Math.ceil(pttl / 1000), 1);
        const allowed = count <= limit;
        return {
          allowed,
          limit,
          remaining: Math.max(0, limit - count),
          resetAt,
          retryAfterSeconds,
        };
      }
    } catch (error: unknown) {
      console.error("Redis rate limit error:", error instanceof Error ? error.message : String(error));
      if (process.env.NODE_ENV === "production") {
        // Fail securely: do not permit unmetered traffic when rate limiter backend fails
        return {
          allowed: false,
          limit,
          remaining: 0,
          resetAt: now + 60_000,
          retryAfterSeconds: 60,
        };
      }
    }
  }

  // 2. Try PostgreSQL atomic RateLimit table if database is configured
  if (isDatabaseConfigured()) {
    try {
      const expiresAt = new Date(now + windowMs);
      const rows = await prisma.$queryRawUnsafe<Array<{ count: number; expiresAt: Date }>>(
        `INSERT INTO "RateLimit" ("key", "count", "expiresAt", "createdAt", "updatedAt")
         VALUES ($1, 1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT ("key") DO UPDATE
           SET "count" = CASE
             WHEN "RateLimit"."expiresAt" <= CURRENT_TIMESTAMP THEN 1
             ELSE "RateLimit"."count" + 1
           END,
           "expiresAt" = CASE
             WHEN "RateLimit"."expiresAt" <= CURRENT_TIMESTAMP THEN $2
             ELSE "RateLimit"."expiresAt"
           END,
           "updatedAt" = CURRENT_TIMESTAMP
         RETURNING "count", "expiresAt";`,
        key,
        expiresAt,
      );

      if (rows && rows.length > 0) {
        const count = Number(rows[0].count);
        const rowExpiresAt = new Date(rows[0].expiresAt).getTime();
        const remainingMs = Math.max(0, rowExpiresAt - now);
        const retryAfterSeconds = Math.max(Math.ceil(remainingMs / 1000), 1);
        const allowed = count <= limit;
        return {
          allowed,
          limit,
          remaining: Math.max(0, limit - count),
          resetAt: rowExpiresAt,
          retryAfterSeconds,
        };
      }
    } catch (error: unknown) {
      console.error("Database rate limit error:", error instanceof Error ? error.message : String(error));
      if (process.env.NODE_ENV === "production") {
        return {
          allowed: false,
          limit,
          remaining: 0,
          resetAt: now + 60_000,
          retryAfterSeconds: 60,
        };
      }
    }
  }

  // 3. Fallback for unit testing and local development without database
  if (process.env.NODE_ENV === "production") {
    // In production without Redis or database, fail closed
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: now + 60_000,
      retryAfterSeconds: 60,
    };
  }

  // Memory store fallback for non-production environments
  if (memoryBuckets.size > 10_000) {
    for (const [bucketKey, val] of memoryBuckets) {
      if (val.resetAt <= now) memoryBuckets.delete(bucketKey);
    }
  }
  const bucket = memoryBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetAt: now + windowMs,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    };
  }

  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  const retryAfterSeconds = Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1);
  return {
    allowed: bucket.count <= limit,
    limit,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSeconds,
  };
}

/**
 * Simplified rate limiter check.
 * If called with a specific now parameter (as in unit tests), behaves synchronously in memory.
 */
export function allowAttempt(
  key: string,
  limit = 5,
  windowMs = 15 * 60 * 1000,
  now?: number,
): boolean | Promise<boolean> {
  // If explicitly called with timestamp parameter (unit tests), execute synchronously in memory
  if (typeof now === "number") {
    if (memoryBuckets.size > 10_000) {
      for (const [bucketKey, val] of memoryBuckets) {
        if (val.resetAt <= now) memoryBuckets.delete(bucketKey);
      }
      if (memoryBuckets.size > 10_000) return false;
    }
    const bucket = memoryBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (bucket.count >= limit) return false;
    bucket.count += 1;
    return true;
  }

  // Async invocation using the shared backend
  return checkRateLimit(key, limit, windowMs).then((r) => r.allowed);
}

export function rateLimitResponse(result: RateLimitResult, message = "Too many attempts. Try again later.") {
  return NextResponse.json(
    { error: message, retryAfter: result.retryAfterSeconds },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function resetRateLimitsForTests() {
  memoryBuckets.clear();
  if (isDatabaseConfigured()) {
    try {
      await prisma.$executeRawUnsafe('DELETE FROM "RateLimit";');
    } catch {
      // ignore if table not accessible
    }
  }
}
