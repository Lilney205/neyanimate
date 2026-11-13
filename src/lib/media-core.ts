const ASSET_ID = /^[a-f0-9]{32}$/;

export type MediaCoreState = "created" | "uploading" | "uploaded" | "processing" | "ready" | "failed" | "cancelled" | "deleting" | "deleted";

export type MediaCoreAsset = {
  id: string;
  state: MediaCoreState;
  published: boolean;
  metadata: Record<string, unknown> | null;
};

export type MediaCoreUploadGrant = {
  assetId: string;
  uploadUrl: string;
  uploadToken: string;
  expiresAt: string;
  maxUploadBytes: number;
};

export class MediaCoreError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MediaCoreError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMediaCoreState(value: unknown): value is MediaCoreState {
  return typeof value === "string" && ["created", "uploading", "uploaded", "processing", "ready", "failed", "cancelled", "deleting", "deleted"].includes(value);
}

function mediaCoreConfig() {
  const rawUrl = process.env.NEY_MEDIA_CORE_URL?.trim();
  const serviceKey = process.env.NEY_MEDIA_CORE_SERVICE_KEY?.trim();
  if (!rawUrl || !serviceKey) throw new MediaCoreError("NEY Media Core is not configured on the server.", 503);

  let base: URL;
  try {
    base = new URL(rawUrl);
  } catch {
    throw new MediaCoreError("NEY_MEDIA_CORE_URL must be a valid absolute URL.", 503);
  }
  if (!["http:", "https:"].includes(base.protocol) || base.pathname !== "/" || base.search || base.hash || base.username || base.password) {
    throw new MediaCoreError("NEY_MEDIA_CORE_URL must be an origin without a path or credentials.", 503);
  }
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:") {
    throw new MediaCoreError("NEY_MEDIA_CORE_URL must use HTTPS in production.", 503);
  }
  return { base, serviceKey };
}

function assetPath(assetId: string, action = "") {
  if (!ASSET_ID.test(assetId)) throw new MediaCoreError("Invalid Media Core asset ID.", 400);
  return `/api/v1/assets/${assetId}${action ? `/${action}` : ""}`;
}

async function mediaCoreRequest(path: string, init: RequestInit = {}) {
  const { base, serviceKey } = mediaCoreConfig();
  const target = new URL(path, base);
  if (target.origin !== base.origin) throw new MediaCoreError("Media Core request URL is invalid.", 500);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${serviceKey}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(target, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  let payload: unknown = null;
  if (response.status !== 204) {
    try {
      payload = await response.json();
    } catch {
      if (response.ok) throw new MediaCoreError("Media Core returned an invalid response.", 502);
    }
  }
  if (!response.ok) {
    const body = isRecord(payload) ? payload.error : null;
    const message = isRecord(body) && typeof body.message === "string" ? body.message : "Media Core request failed.";
    throw new MediaCoreError(message, response.status);
  }
  return { response, payload };
}

function expectRecord(value: unknown, message: string): Record<string, unknown> {
  if (!isRecord(value)) throw new MediaCoreError(message, 502);
  return value;
}

function expectAssetId(value: unknown): string {
  if (typeof value !== "string" || !ASSET_ID.test(value)) throw new MediaCoreError("Media Core returned an invalid asset ID.", 502);
  return value;
}

export async function createMediaCoreAsset(title: string, idempotencyKey: string) {
  const { base } = mediaCoreConfig();
  const { payload } = await mediaCoreRequest("/api/v1/assets", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ title }),
  });
  const result = expectRecord(payload, "Media Core returned an invalid asset response.");
  const assetId = expectAssetId(result.id);
  return {
    assetId,
    uploadUrl: new URL(assetPath(assetId, "upload"), base).toString(),
  };
}

export async function createMediaCoreUploadGrant(assetId: string, bytes: number, contentType: string): Promise<MediaCoreUploadGrant> {
  const { base } = mediaCoreConfig();
  const { payload } = await mediaCoreRequest(assetPath(assetId, "upload-grant"), {
    method: "POST",
    body: JSON.stringify({ bytes, contentType }),
  });
  const result = expectRecord(payload, "Media Core returned an invalid upload grant.");
  const returnedAssetId = expectAssetId(result.assetId);
  let uploadUrl: URL | null = null;
  try { uploadUrl = typeof result.uploadUrl === "string" ? new URL(result.uploadUrl, base) : null; }
  catch { uploadUrl = null; }
  const maxUploadBytes = result.maxUploadBytes;
  if (returnedAssetId !== assetId || !uploadUrl || uploadUrl.origin !== base.origin
    || uploadUrl.pathname !== assetPath(assetId, "upload") || uploadUrl.search || uploadUrl.hash
    || typeof result.uploadToken !== "string" || !result.uploadToken
    || typeof result.expiresAt !== "string" || typeof maxUploadBytes !== "number" || !Number.isSafeInteger(maxUploadBytes)) {
    throw new MediaCoreError("Media Core returned an invalid upload grant.", 502);
  }
  return {
    assetId: returnedAssetId,
    uploadUrl: uploadUrl.toString(),
    uploadToken: result.uploadToken,
    expiresAt: result.expiresAt,
    maxUploadBytes,
  };
}

export async function getMediaCoreAsset(assetId: string): Promise<MediaCoreAsset> {
  const { payload } = await mediaCoreRequest(assetPath(assetId));
  const result = expectRecord(payload, "Media Core returned an invalid asset response.");
  if (expectAssetId(result.id) !== assetId || !isMediaCoreState(result.state)
    || typeof result.published !== "boolean"
    || (result.metadata !== null && !isRecord(result.metadata))) {
    throw new MediaCoreError("Media Core returned an invalid asset response.", 502);
  }
  return {
    id: assetId,
    state: result.state,
    published: result.published,
    metadata: isRecord(result.metadata) ? result.metadata : null,
  };
}

export async function publishMediaCoreAsset(assetId: string) {
  const { payload } = await mediaCoreRequest(assetPath(assetId, "publish"), { method: "POST" });
  const result = expectRecord(payload, "Media Core returned an invalid publish response.");
  if (expectAssetId(result.id) !== assetId || result.state !== "ready" || result.published !== true) {
    throw new MediaCoreError("Media Core did not confirm that the asset is published and ready.", 502);
  }
}

export async function deleteMediaCoreAsset(assetId: string) {
  await mediaCoreRequest(assetPath(assetId), { method: "DELETE" });
}

export async function authorizeMediaCorePlayback(assetId: string) {
  const { response, payload } = await mediaCoreRequest(assetPath(assetId, "playback"), { method: "POST" });
  const result = expectRecord(payload, "Media Core returned an invalid playback response.");
  const expectedPlaylist = `/playback/${assetId}/index.m3u8`;
  const setCookie = response.headers.get("set-cookie");
  if (result.assetId !== assetId || result.playlistUrl !== expectedPlaylist || !setCookie) {
    throw new MediaCoreError("Media Core returned an incomplete playback grant.", 502);
  }
  return { playlistUrl: expectedPlaylist, setCookie };
}

export async function fetchMediaCorePlayback(path: string, cookie: string) {
  const { base } = mediaCoreConfig();
  const target = new URL(path, base);
  if (target.origin !== base.origin || !target.pathname.startsWith("/playback/")) {
    throw new MediaCoreError("Media Core playback path is invalid.", 400);
  }
  return fetch(target, {
    headers: { cookie },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
}
