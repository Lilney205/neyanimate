import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isSameOriginRequest, roleCanManageFilms } from "@/lib/auth";
import { isDatabaseConfigured, prisma } from "@/lib/db";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { createMediaCoreUploadGrant, MediaCoreError } from "@/lib/media-core";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  fileSize: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  contentType: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
});

export async function POST(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!roleCanManageFilms(actor.role)) return NextResponse.json({ error: "You are not authorized to resume video uploads." }, { status: 403 });
  if (!isDatabaseConfigured()) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload details." }, { status: 400 });

  const { id } = await context.params;
  const rate = await checkRateLimit(`video-upload-grant:${actor.id}`, 60, 60 * 1000);
  if (!rate.allowed) return rateLimitResponse(rate, "Too many upload resume requests. Please wait before trying again.");

  try {
    const asset = await prisma.videoAsset.findUnique({
      where: { id },
      include: { film: { select: { isDemo: true, status: true } } },
    });
    if (!asset || asset.provider !== "MEDIA_CORE") return NextResponse.json({ error: "Media Core video asset not found." }, { status: 404 });
    if (asset.film.isDemo || asset.film.status !== "DRAFT") {
      return NextResponse.json({ error: "Only an unfinished upload for a draft film can be resumed." }, { status: 409 });
    }

    const grant = await createMediaCoreUploadGrant(asset.providerVideoId, parsed.data.fileSize, parsed.data.contentType);
    return NextResponse.json({ upload: grant }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof MediaCoreError) {
      const status = [400, 409, 413, 415, 429, 503].includes(error.status) ? error.status : 502;
      return NextResponse.json({ error: error.message }, { status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Media Core upload grant renewal failed", error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error");
    return NextResponse.json({ error: "Could not renew the upload grant. Check the Media Core connection." }, { status: 502 });
  }
}
