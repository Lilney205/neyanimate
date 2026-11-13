import { NextResponse } from "next/server";
import { getCurrentUser, isSameOriginRequest, roleCanManageFilms } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { getMediaCoreAsset, MediaCoreError, publishMediaCoreAsset } from "@/lib/media-core";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const actor = await getCurrentUser();
  if (!actor) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  if (!roleCanManageFilms(actor.role)) {
    return NextResponse.json({ error: "You are not authorized to publish films." }, { status: 403 });
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const rate = await checkRateLimit(`publish:${actor.id}`, 10, 60 * 1000);
  if (!rate.allowed) {
    return rateLimitResponse(rate, "Too many publishing requests. Please wait before retrying.");
  }

  const { id } = await context.params;

  try {
    // 1. Fetch film and its associated assets
    const existing = await prisma.film.findUnique({
      where: { id },
      include: {
        videoAssets: {
          where: { assetType: "FEATURE" },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Film not found." }, { status: 404 });
    }

    if (existing.isDemo) {
      return NextResponse.json({ error: "Fictional demo titles cannot be published." }, { status: 409 });
    }

    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        { error: `Only draft films can be published. Current status is ${existing.status}.` },
        { status: 409 },
      );
    }

    // 2. Identify the feature asset
    const featureAsset = existing.videoAssets.find((a) =>
      existing.mainVideoId ? a.providerVideoId === existing.mainVideoId : true
    ) ?? existing.videoAssets[0];

    if (!featureAsset || !featureAsset.providerVideoId) {
      return NextResponse.json(
        { error: "Film cannot be published without an associated feature video." },
        { status: 409 },
      );
    }

    // 3. Verify video readiness with its configured provider
    if (featureAsset.provider === "MEDIA_CORE") {
      try {
        const coreAsset = await getMediaCoreAsset(featureAsset.providerVideoId);
        const failed = ["failed", "cancelled", "deleting", "deleted"].includes(coreAsset.state);
        if (coreAsset.state !== "ready") {
          await prisma.videoAsset.update({
            where: { id: featureAsset.id },
            data: { processingStatus: failed ? "FAILED" : coreAsset.state === "created" ? "QUEUED" : "PROCESSING" },
          });
          return NextResponse.json(
            { error: failed
              ? "Feature video processing failed in NEY Media Core. Upload the video again before publishing."
              : "Feature video is still being processed by NEY Media Core. Video must be ready before publishing." },
            { status: 409 },
          );
        }
        await publishMediaCoreAsset(featureAsset.providerVideoId);
        const duration = coreAsset.metadata?.durationSeconds;
        await prisma.videoAsset.update({
          where: { id: featureAsset.id },
          data: {
            processingStatus: "READY",
            duration: typeof duration === "number" && Number.isFinite(duration) ? Math.round(duration) : featureAsset.duration,
            processedAt: new Date(),
          },
        });
      } catch (error) {
        if (error instanceof MediaCoreError) {
          const status = error.status === 503 ? 503 : 502;
          return NextResponse.json({ error: `NEY Media Core could not verify the feature video: ${error.message}` }, { status });
        }
        throw error;
      }
    } else {
      return NextResponse.json(
        { error: "This feature video must be uploaded to NEY Media Core before it can be published." },
        { status: 409 },
      );
    }

    // 4. Atomic publication transition with race-condition guard
    const published = await prisma.$transaction(async (tx) => {
      // Atomic condition: must still be DRAFT and not demo
      const result = await tx.film.updateMany({
        where: { id, status: "DRAFT", isDemo: false },
        data: {
          status: "PUBLISHED",
          mainVideoId: featureAsset.providerVideoId,
          publishedAt: new Date(),
        },
      });

      if (result.count === 0) {
        throw new Error("CONCURRENT_MODIFICATION");
      }

      const updated = await tx.film.findUnique({
        where: { id },
        include: { videoAssets: true },
      });

      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "film.published",
          resourceType: "Film",
          resourceId: id,
          metadata: {
            title: updated?.title,
            slug: updated?.slug,
            mainVideoId: featureAsset.providerVideoId,
          },
        },
      });

      return updated;
    });

    return NextResponse.json({ film: published }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "CONCURRENT_MODIFICATION") {
      return NextResponse.json(
        { error: "Film could not be published because its state was modified concurrently." },
        { status: 409 },
      );
    }
    console.error("Film publishing failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not publish film." }, { status: 500 });
  }
}
