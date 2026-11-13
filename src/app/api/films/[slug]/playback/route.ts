import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getCurrentUser, isSameOriginRequest, newSessionToken } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { canViewFilm } from "@/lib/access";
import { mediaCorePlaybackUrl } from "@/lib/playback";
import { authorizeMediaCorePlayback, MediaCoreError } from "@/lib/media-core";

type Context = { params: Promise<{ slug: string }> };
type PlayableFilm = {
  filmId: string;
  playerUrl: string;
  providerVideoId: string;
};

async function resolvePlayableFilm(slug: string): Promise<NextResponse | PlayableFilm> {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Playback is unavailable until a database is configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const film = await prisma.film.findFirst({
      where: { slug, status: "PUBLISHED" },
      select: {
        id: true,
        accessType: true,
        isDemo: true,
        mainVideoId: true,
        videoAssets: {
          where: { assetType: "FEATURE", processingStatus: "READY", provider: "MEDIA_CORE" },
          select: { provider: true, providerVideoId: true },
          take: 10,
        },
      },
    });
    if (!film) return NextResponse.json({ error: "Film not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    if (!canViewFilm({ publication: "PUBLISHED", accessType: film.accessType })) {
      return NextResponse.json({ error: "Premium playback requires a verified entitlement and signed playback setup." }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    if (film.isDemo || !film.mainVideoId) return NextResponse.json({ error: "This film does not have a ready feature video." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    const readyAsset = film.videoAssets.find((asset) => asset.providerVideoId === film.mainVideoId);
    if (!readyAsset) return NextResponse.json({ error: "This film does not have a verified playable feature video." }, { status: 409, headers: { "Cache-Control": "no-store" } });

    const playerUrl = mediaCorePlaybackUrl(readyAsset.providerVideoId);
    if (!playerUrl) return NextResponse.json({ error: "This film does not have a verified playable feature video." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    return { filmId: film.id, playerUrl, providerVideoId: readyAsset.providerVideoId };
  } catch (error) {
    console.error("Could not resolve film playback", error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error");
    return NextResponse.json({ error: "Playback is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

async function playbackResponse(film: PlayableFilm, sessionToken?: string) {
  const headers = new Headers({ "Cache-Control": "private, no-store, max-age=0" });
  try {
    const grant = await authorizeMediaCorePlayback(film.providerVideoId);
    const cookie = process.env.NODE_ENV === "production" && !/(^|;)\s*Secure(?:;|$)/i.test(grant.setCookie)
      ? `${grant.setCookie}; Secure`
      : grant.setCookie;
    headers.set("Set-Cookie", cookie);
  } catch (error) {
    if (error instanceof MediaCoreError) {
      const status = error.status === 503 ? 503 : 502;
      return NextResponse.json({ error: `NEY Media Core playback could not be authorized: ${error.message}` }, { status, headers });
    }
    console.error("NEY Media Core playback authorization failed", error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error");
    return NextResponse.json({ error: "NEY Media Core playback could not be authorized." }, { status: 502, headers });
  }
  return NextResponse.json({
    playerUrl: film.playerUrl,
    ...(sessionToken ? { sessionToken } : {}),
  }, { headers });
}

export async function GET(_request: Request, context: Context) {
  const { slug } = await context.params;
  const result = await resolvePlayableFilm(slug);
  if (result instanceof NextResponse) return result;
  return playbackResponse(result);
}

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const limit = await checkRateLimit(`playback-start:${getClientIp(request)}`, 60, 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "Too many playback requests. Please wait and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
  const { slug } = await context.params;
  const result = await resolvePlayableFilm(slug);
  if (result instanceof NextResponse) return result;

  try {
    const user = await getCurrentUser();
    const sessionToken = newSessionToken();
    await prisma.playbackSession.create({
      data: {
        tokenHash: createHash("sha256").update(sessionToken).digest("hex"),
        filmId: result.filmId,
        userId: user?.id,
      },
    });
    return await playbackResponse(result, sessionToken);
  } catch {
    return NextResponse.json({ error: "Could not start playback analytics. Please retry." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
