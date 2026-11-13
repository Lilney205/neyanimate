import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isSameOriginRequest, roleCanManageFilms } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  createMediaCoreAsset,
  createMediaCoreUploadGrant,
  deleteMediaCoreAsset,
  MediaCoreError,
} from "@/lib/media-core";

const schema = z.object({
  filmId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(150),
  kind: z.enum(["TRAILER", "FEATURE"]).default("FEATURE"),
  fileSize: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  contentType: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
  uploadRequestId: z.string().uuid(),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!roleCanManageFilms(actor.role)) return NextResponse.json({ error: "You are not authorized to upload videos." }, { status: 403 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload details." }, { status: 400 });

  const rate = await checkRateLimit(`video-upload:${actor.id}`, 10, 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate, "Too many upload sessions. Please wait before trying again.");

  let coreAssetId: string | undefined;
  try {
    const film = await prisma.film.findUnique({ where: { id: parsed.data.filmId }, select: { id: true, isDemo: true, status: true, accessType: true } });
    if (!film || film.isDemo) return NextResponse.json({ error: "Film not found or demo content cannot be replaced." }, { status: 404 });
    if (film.status !== "DRAFT") return NextResponse.json({ error: "Only draft films can receive video uploads. Unpublish the film through an authorized workflow first." }, { status: 409 });
    const created = await createMediaCoreAsset(parsed.data.title, `${actor.id}:${parsed.data.uploadRequestId}`);
    const coreId = created.assetId;
    coreAssetId = coreId;
    const grant = await createMediaCoreUploadGrant(coreId, parsed.data.fileSize, parsed.data.contentType);
    const asset = await prisma.$transaction(async (tx) => {
      const created = await tx.videoAsset.create({
        data: { filmId: film.id, provider: "MEDIA_CORE", providerVideoId: coreId, assetType: parsed.data.kind, processingStatus: "QUEUED" },
      });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "video.upload.created", resourceType: "VideoAsset", resourceId: created.id } });
      return created;
    });
    coreAssetId = undefined;
    return NextResponse.json({
      upload: {
        assetId: asset.id,
        providerVideoId: coreId,
        uploadUrl: grant.uploadUrl,
        uploadToken: grant.uploadToken,
        expiresAt: grant.expiresAt,
        maxUploadBytes: grant.maxUploadBytes,
      },
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (coreAssetId) {
      try { await deleteMediaCoreAsset(coreAssetId); }
      catch (cleanupError) {
        console.error("Could not remove an unused Media Core upload asset", cleanupError instanceof Error ? cleanupError.message : "Unknown cleanup error");
      }
    }
    if (error instanceof MediaCoreError) {
      const status = [400, 409, 413, 415, 429, 503].includes(error.status) ? error.status : 502;
      return NextResponse.json({ error: error.message }, { status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Media Core upload session creation failed", error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error");
    return NextResponse.json({ error: "Could not create a Media Core upload session. Check the server connection and configuration." }, { status: 502 });
  }
}
