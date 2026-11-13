import { NextResponse } from "next/server";
import { getCurrentUser, roleCanManageFilms } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { getMediaCoreAsset, MediaCoreError } from "@/lib/media-core";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!roleCanManageFilms(actor.role)) return NextResponse.json({ error: "You are not authorized to check video processing." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const { id } = await context.params;
  try {
    const asset = await prisma.videoAsset.findUnique({ where: { id }, include: { film: true } });
    if (!asset) return NextResponse.json({ error: "Video asset not found." }, { status: 404 });
    if (asset.provider === "MEDIA_CORE") {
      const providerAsset = await getMediaCoreAsset(asset.providerVideoId);
      const failed = ["failed", "cancelled", "deleting", "deleted"].includes(providerAsset.state);
      const processingStatus = providerAsset.state === "ready" ? "READY" : failed ? "FAILED"
        : providerAsset.state === "created" ? "QUEUED" : "PROCESSING";
      const duration = providerAsset.metadata?.durationSeconds;
      const ready = processingStatus === "READY";
      const updated = await prisma.$transaction(async (tx) => {
        const current = await tx.videoAsset.update({
          where: { id: asset.id },
          data: {
            processingStatus,
            duration: typeof duration === "number" && Number.isFinite(duration) ? Math.round(duration) : null,
            processedAt: ready || failed ? new Date() : null,
          },
        });
        if (ready && asset.assetType === "FEATURE") {
          await tx.film.update({ where: { id: asset.filmId }, data: { mainVideoId: asset.providerVideoId } });
        }
        return current;
      });
      return NextResponse.json({ asset: { id: updated.id, status: updated.processingStatus, duration: updated.duration } }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(
      { error: "This video asset uses an unsupported provider. Upload the video again to NEY Media Core." },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof MediaCoreError) {
      const status = error.status === 503 ? 503 : 502;
      return NextResponse.json({ error: error.message }, { status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Video processing status check failed", error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error");
    return NextResponse.json({ error: "Could not verify video processing status." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
