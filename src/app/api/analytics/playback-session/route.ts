import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOriginRequest } from "@/lib/auth";
import { creditedPlaybackSeconds, playbackReachedCompletion } from "@/lib/analytics-events";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

const eventSchema = z.object({
  sessionToken: z.string().min(32).max(128),
  event: z.enum(["play", "heartbeat", "pause", "ended"]),
  position: z.number().finite().min(0).max(60 * 60 * 12),
  duration: z.number().finite().min(0).max(60 * 60 * 12).optional(),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Playback analytics is unavailable." }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid playback event." }, { status: 400 }); }
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid playback event." }, { status: 400 });

  try {
    const { sessionToken, event, position, duration } = parsed.data;
    const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
    const limit = await checkRateLimit(`playback-analytics:${tokenHash}`, 12, 60 * 1000);
    if (!limit.allowed) return NextResponse.json({ error: "Playback event rate limit exceeded." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
    const session = await prisma.playbackSession.findUnique({ where: { tokenHash } });
    if (!session) return NextResponse.json({ error: "Playback session not found." }, { status: 404 });
    if (session.endedAt) return NextResponse.json({ error: "Playback session has ended." }, { status: 410 });

    const now = new Date();
    const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - session.lastHeartbeatAt.getTime()) / 1000));
    const positionSeconds = Math.floor(position);
    const creditedSeconds = creditedPlaybackSeconds({
      wasPlaying: session.isPlaying,
      event,
      elapsedSeconds,
      previousPosition: session.lastPosition,
      currentPosition: positionSeconds,
    });
    const isPlaying = event === "play" || event === "heartbeat";
    const durationSeconds = duration && duration > 0 ? Math.floor(duration) : session.durationSeconds;
    const completed = playbackReachedCompletion(positionSeconds, durationSeconds);

    await prisma.$transaction(async (tx) => {
      const updated = await tx.playbackSession.updateMany({
        where: { id: session.id, lastHeartbeatAt: session.lastHeartbeatAt, lastPosition: session.lastPosition, endedAt: null },
        data: {
          ...(event === "play" && !session.firstPlayedAt ? { firstPlayedAt: now } : {}),
          lastHeartbeatAt: now,
          lastPosition: positionSeconds,
          durationSeconds,
          isPlaying,
          watchedSeconds: { increment: creditedSeconds },
          ...(event === "ended" ? { endedAt: now } : {}),
          ...(completed && !session.completedAt ? { completedAt: now } : {}),
        },
      });
      if (updated.count > 0 && session.userId) {
        await tx.watchProgress.upsert({
          where: { userId_filmId: { userId: session.userId, filmId: session.filmId } },
          create: { userId: session.userId, filmId: session.filmId, position: positionSeconds },
          update: { position: positionSeconds },
        });
      }
    });

    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not save playback activity." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
