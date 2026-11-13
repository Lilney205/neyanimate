import { fetchMediaCorePlayback, MediaCoreError } from "@/lib/media-core";

type Context = { params: Promise<{ assetId: string; path: string[] }> };

function playbackCookie(header: string | null) {
  const pair = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith("ney_playback="));
  return pair ? pair.slice("ney_playback=".length) : null;
}

export async function GET(request: Request, context: Context) {
  const { assetId, path } = await context.params;
  if (!/^[a-f0-9]{32}$/.test(assetId) || !path.length
    || path.some((part) => !part || part === "." || part === ".." || /[\/\\\0]/.test(part))) {
    return Response.json({ error: "Invalid playback path." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const token = playbackCookie(request.headers.get("cookie"));
  if (!token) return Response.json({ error: "Playback authorization required." }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const relativePath = path.map((part) => encodeURIComponent(part)).join("/");
  try {
    const upstream = await fetchMediaCorePlayback(`/playback/${assetId}/${relativePath}`, `ney_playback=${token}`);
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    if (error instanceof MediaCoreError) {
      return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Media Core playback proxy failed", error instanceof Error ? `${error.name}: ${error.message}` : "Unknown error");
    return Response.json({ error: "Playback is temporarily unavailable." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
