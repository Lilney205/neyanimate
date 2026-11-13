"use client";

import { useCallback, useEffect, useState } from "react";
import { MAX_TUS_UPLOAD_BYTES, TUS_CHUNK_SIZE_BYTES, isValidTusOffset, uploadFingerprint } from "@/lib/tus-upload";

type Asset = { id: string; assetType: string; processingStatus: string; providerVideoId: string };
type FilmRow = {
  id: string; slug: string; title: string; synopsis: string; releaseYear: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"; accessType: "FREE" | "PREMIUM";
  isDemo: boolean; mainVideoId: string | null; videoAssets: Asset[];
  targetAgeMin: number | null;
  learningObjectives: string[]; parentNotes: string | null;
};

export function StudioLibrary({ initialFilms }: { initialFilms: FilmRow[] }) {
  const [films, setFilms] = useState<FilmRow[]>(initialFilms);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await fetch("/api/studio/films", { cache: "no-store" });
      const result = await response.json() as { films?: FilmRow[]; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not load studio films.");
      setFilms(result.films ?? []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load studio films.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleRefresh = () => { void refresh(); };
    window.addEventListener("studio:refresh", handleRefresh);
    return () => window.removeEventListener("studio:refresh", handleRefresh);
  }, [refresh]);

  return (
    <section className="mt-10" aria-labelledby="studio-library-title">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div><h2 id="studio-library-title" className="text-2xl font-bold">Film catalogue</h2><p className="mt-1 text-sm text-slate-400">Add a feature video to a draft, verify it is ready, then publish.</p></div>
        <button onClick={() => void refresh()} disabled={loading} className="rounded-full border border-slate-600 px-4 py-2 text-sm hover:border-sky-400 disabled:opacity-50">Refresh</button>
      </div>
      {error && <p role="alert" className="mb-4 text-sm text-rose-300">{error}</p>}
      {loading && <p className="text-sm text-slate-400">Loading your films…</p>}
      {!loading && films.length === 0 && <p className="glass-panel rounded-2xl p-6 text-slate-300">No films yet. Create your first draft above.</p>}
      <div className="space-y-4">{films.map((film) => <FilmCard key={film.id} film={film} onRefresh={refresh} />)}</div>
    </section>
  );
}

function FilmCard({ film, onRefresh }: { film: FilmRow; onRefresh: () => Promise<void> }) {
  const [kind, setKind] = useState<"FEATURE" | "TRAILER">("FEATURE");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const featureReady = film.videoAssets.some((asset) => asset.assetType === "FEATURE" && asset.processingStatus === "READY" && asset.providerVideoId === film.mainVideoId);

  async function checkStatus(assetId: string) {
    const response = await fetch(`/api/studio/videos/${encodeURIComponent(assetId)}/status`, { cache: "no-store" });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Unable to check processing status.");
    await onRefresh();
  }

  async function upload() {
    if (!file) return;
    if (!file.type.startsWith("video/")) { setMessage("Choose a recognized video file."); return; }
    if (file.size > MAX_TUS_UPLOAD_BYTES) { setMessage("This uploader supports videos up to 30 GB. Contact the studio administrator for larger files."); return; }
    if (!["video/mp4", "video/webm", "video/quicktime"].includes(file.type)) { setMessage("Choose an MP4, WebM, or QuickTime video."); return; }
    setBusy(true); setMessage(""); setProgress(0);
    try {
      const session = await getOrCreateTusSession({ film, file, kind });
      setMessage("Resumable upload to NEY Media Core. If interrupted, choose the same file again to resume.");
      await transferTus(session, file, setProgress, () => renewTusSession(session, file));
      try { sessionStorage.removeItem(session.storageKey); } catch { /* Optional resume cache may be unavailable. */ }
      setMessage("Upload sent. Checking Media Core processing…");
      const assetId = session.assetId;
      const state = await pollUntilProcessed(assetId, checkStatus, setMessage);
      if (state === "READY") setMessage("NEY Media Core reports the video is ready. You may publish when a feature video is ready.");
      else if (state === "FAILED") setMessage("NEY Media Core could not process this video. Try an H.264 MP4 and check the Core logs.");
      else setMessage("Upload is stored. Processing is still underway; use Check status later.");
      setFile(null);
      await onRefresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Upload failed.");
    } finally { setBusy(false); }
  }

  async function publish() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/studio/films/${encodeURIComponent(film.id)}/publish`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not publish film.");
      setMessage("Film published.");
      await onRefresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not publish film.");
    } finally { setBusy(false); }
  }

  return (
    <article className="glass-panel rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="text-lg font-bold">{film.title}</h3><p className="mt-1 text-sm text-slate-400">/{film.slug} · {film.releaseYear} · {film.accessType}{film.targetAgeMin != null ? ` · minimum age ${film.targetAgeMin}+` : ""}</p></div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${film.status === "PUBLISHED" ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200"}`}>{film.isDemo ? "DEMO" : film.status}</span>
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{film.synopsis}</p>
      {film.learningObjectives.length > 0 && <div className="mt-3"><p className="text-xs font-semibold uppercase tracking-wide text-sky-200">Learning goals</p><ul className="mt-1 list-inside list-disc text-sm text-slate-300">{film.learningObjectives.map((goal) => <li key={goal}>{goal}</li>)}</ul></div>}
      <div className="mt-4 space-y-2">
        {film.videoAssets.map((asset) => (
          <div key={asset.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm">
            <span>{asset.assetType} · <strong>{asset.processingStatus}</strong></span>
            {film.status === "DRAFT" && asset.processingStatus !== "READY" && <button onClick={() => void checkStatus(asset.id).catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : "Status check failed."))} className="text-sky-300 hover:text-sky-100">Check status</button>}
          </div>
        ))}
      </div>
      {film.status === "DRAFT" && !film.isDemo && (
        <div className="mt-5 grid gap-3 rounded-xl border border-slate-700 bg-slate-950/40 p-4 md:grid-cols-[150px_1fr_auto] md:items-end">
          <label className="text-xs text-slate-400">Asset type<select value={kind} onChange={(event) => setKind(event.target.value as "FEATURE" | "TRAILER")} className="studio-input"><option value="FEATURE">Feature</option><option value="TRAILER">Trailer</option></select></label>
          <label className="text-xs text-slate-400">Video file<input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-2 block w-full text-sm text-slate-200 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-400 file:px-3 file:py-2 file:font-semibold file:text-slate-950" /><span className="mt-1 block text-[11px] leading-4 text-slate-500">Uploads resume in 50 MB chunks (up to 30 GB by default). If interrupted, choose the same file again in this browser tab.</span></label>
          <button disabled={busy || !file} onClick={() => void upload()} className="rounded-full bg-sky-400 px-5 py-2.5 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Working…" : "Upload to Media Core"}</button>
          {progress !== null && <div className="md:col-span-3"><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-sky-400 transition-[width]" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-xs text-slate-400">{progress}% uploaded</p></div>}
        </div>
      )}
      {film.status === "DRAFT" && !film.isDemo && <div className="mt-4 flex flex-wrap items-center gap-3"><button onClick={() => void publish()} disabled={!featureReady || busy} className="rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Working…" : "Publish film"}</button><span className="text-xs text-slate-400">{featureReady ? "Feature video ready to publish" : "Requires a verified ready feature video"}</span></div>}
      {message && <p role="status" aria-live="polite" className="mt-4 text-sm text-amber-200">{message}</p>}
    </article>
  );
}

type TusSession = {
  assetId: string;
  providerVideoId: string;
  uploadUrl: string;
  uploadToken: string;
  expiresAt: string;
  maxUploadBytes: number;
  storageKey: string;
};

async function getOrCreateTusSession({ film, file, kind }: { film: FilmRow; file: File; kind: "FEATURE" | "TRAILER" }): Promise<TusSession> {
  const storageKey = uploadFingerprint({ filmId: film.id, kind, file });
  let saved: { assetId: string; providerVideoId: string } | null = null;
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as { assetId?: unknown; providerVideoId?: unknown };
      if (typeof parsed.assetId === "string" && typeof parsed.providerVideoId === "string"
        && /^[a-z0-9]{20,32}$/.test(parsed.assetId) && /^[a-f0-9]{32}$/.test(parsed.providerVideoId)) {
        saved = { assetId: parsed.assetId, providerVideoId: parsed.providerVideoId };
      } else {
        sessionStorage.removeItem(storageKey);
      }
    }
  } catch {
    saved = null;
  }

  if (saved) {
    try {
      return await renewTusSession({ ...saved, uploadUrl: "", uploadToken: "", expiresAt: "", maxUploadBytes: MAX_TUS_UPLOAD_BYTES, storageKey }, file);
    } catch (error) {
      if (error instanceof UploadRequestError && [404, 409].includes(error.status)) {
        try { sessionStorage.removeItem(storageKey); } catch { /* Optional resume cache may be unavailable. */ }
        throw new Error("The previous upload is no longer resumable. Start a new upload.");
      }
      throw error;
    }
  }

  const response = await fetch("/api/studio/videos/direct-upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filmId: film.id,
      title: `${film.title} ${kind.toLowerCase()}`,
      kind,
      fileSize: file.size,
      contentType: file.type,
      uploadRequestId: crypto.randomUUID(),
    }),
  });
  const result = await response.json() as { upload?: Omit<TusSession, "storageKey">; error?: string };
  if (!response.ok || !result.upload) throw new UploadRequestError(result.error ?? "Could not create a resumable upload session.", response.status);
  const session = { ...result.upload, storageKey };
  validateTusSession(session, file);
  try { sessionStorage.setItem(storageKey, JSON.stringify({ assetId: session.assetId, providerVideoId: session.providerVideoId })); } catch { /* Upload works without resume after page reload. */ }
  return session;
}

class UploadRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

class UploadGrantExpiredError extends Error {}

function isMediaCoreTusUrl(value: string, providerVideoId: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
      && url.pathname === `/api/v1/assets/${providerVideoId}/upload` && !url.search && !url.hash;
  } catch { return false; }
}

function validateTusSession(session: TusSession, file: File) {
  if (!/^[a-z0-9]{20,32}$/.test(session.assetId) || !/^[a-f0-9]{32}$/.test(session.providerVideoId)
    || !isMediaCoreTusUrl(session.uploadUrl, session.providerVideoId)
    || typeof session.uploadToken !== "string" || !session.uploadToken
    || !Number.isSafeInteger(session.maxUploadBytes) || file.size > session.maxUploadBytes) {
    throw new Error("NEY Media Core returned an invalid upload session or the file exceeds its configured limit.");
  }
}

async function renewTusSession(session: TusSession, file: File): Promise<TusSession> {
  const response = await fetch(`/api/studio/videos/${encodeURIComponent(session.assetId)}/upload-grant`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileSize: file.size, contentType: file.type }),
  });
  const result = await response.json() as {
    upload?: { assetId: string; uploadUrl: string; uploadToken: string; expiresAt: string; maxUploadBytes: number };
    error?: string;
  };
  if (!response.ok || !result.upload) throw new UploadRequestError(result.error ?? "Could not renew the resumable upload grant.", response.status);
  if (result.upload.assetId !== session.providerVideoId) throw new Error("NEY Media Core renewed a grant for a different asset.");
  const renewed = {
    ...session,
    uploadUrl: result.upload.uploadUrl,
    uploadToken: result.upload.uploadToken,
    expiresAt: result.upload.expiresAt,
    maxUploadBytes: result.upload.maxUploadBytes,
    storageKey: session.storageKey,
  };
  validateTusSession(renewed, file);
  try { sessionStorage.setItem(session.storageKey, JSON.stringify({ assetId: renewed.assetId, providerVideoId: renewed.providerVideoId })); } catch { /* Upload works without resume after page reload. */ }
  return renewed;
}

async function transferTus(session: TusSession, file: File, onProgress: (percent: number) => void, renew: () => Promise<TusSession>) {
  let current = session;
  let offset: number;
  try {
    offset = await getTusOffset(current, file.size);
  } catch (error) {
    if (!(error instanceof UploadGrantExpiredError)) throw error;
    current = await renew();
    offset = await getTusOffset(current, file.size);
  }
  while (offset < file.size) {
    const end = Math.min(offset + TUS_CHUNK_SIZE_BYTES, file.size);
    let nextOffset: number;
    try {
      nextOffset = await sendTusChunk(current, file.slice(offset, end), offset, file.size, (chunkProgress) => {
        onProgress(Math.min(99, Math.floor(((offset + chunkProgress) / file.size) * 100)));
      });
    } catch (error) {
      if (!(error instanceof UploadGrantExpiredError)) throw error;
      current = await renew();
      offset = await getTusOffset(current, file.size);
      continue;
    }
    if (nextOffset <= offset || nextOffset > file.size) throw new Error("NEY Media Core returned an invalid upload offset.");
    offset = nextOffset;
    onProgress(Math.floor((offset / file.size) * 100));
  }
}

function getTusOffset(session: TusSession, fileSize: number) {
  return new Promise<number>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("HEAD", session.uploadUrl);
    xhr.setRequestHeader("Authorization", `Bearer ${session.uploadToken}`);
    xhr.setRequestHeader("Tus-Resumable", "1.0.0");
    xhr.onload = () => {
      if (xhr.status === 401) { reject(new UploadGrantExpiredError()); return; }
      const offsetHeader = xhr.getResponseHeader("Upload-Offset");
      const lengthHeader = xhr.getResponseHeader("Upload-Length");
      const offset = offsetHeader === null ? Number.NaN : Number(offsetHeader);
      const length = lengthHeader === null ? Number.NaN : Number(lengthHeader);
      if (xhr.status !== 204 || !isValidTusOffset(offset, fileSize) || length !== fileSize) {
        reject(new Error("Could not resume this upload session. Check the Media Core URL, CORS origins, and file selection."));
      } else resolve(offset);
    };
    xhr.onerror = () => reject(new Error("Could not check resumable upload progress; verify the Media Core public URL and CORS configuration."));
    xhr.send();
  });
}

function sendTusChunk(session: TusSession, chunk: Blob, offset: number, fileSize: number, onChunkProgress: (loaded: number) => void) {
  return new Promise<number>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PATCH", session.uploadUrl);
    xhr.setRequestHeader("Authorization", `Bearer ${session.uploadToken}`);
    xhr.setRequestHeader("Tus-Resumable", "1.0.0");
    xhr.setRequestHeader("Upload-Offset", String(offset));
    xhr.setRequestHeader("Content-Type", "application/offset+octet-stream");
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onChunkProgress(event.loaded); };
    xhr.onload = () => {
      if (xhr.status === 401) { reject(new UploadGrantExpiredError()); return; }
      const nextOffset = Number(xhr.getResponseHeader("Upload-Offset"));
      if (xhr.status !== 204 || !Number.isSafeInteger(nextOffset) || nextOffset !== offset + chunk.size || nextOffset > fileSize) {
        reject(new Error(`NEY Media Core rejected a resumable chunk (${xhr.status}).`));
      } else resolve(nextOffset);
    };
    xhr.onerror = () => reject(new Error("Network interrupted during upload. Choose the same file again to resume."));
    xhr.onabort = () => reject(new Error("Upload was cancelled. Choose the same file again to resume."));
    xhr.send(chunk);
  });
}

async function pollUntilProcessed(assetId: string, checkStatus: (assetId: string) => Promise<void>, setMessage: (message: string) => void) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await checkStatus(assetId);
    const response = await fetch("/api/studio/films", { cache: "no-store" });
    const result = await response.json() as { films?: FilmRow[] };
    const asset = result.films?.flatMap((film) => film.videoAssets).find((candidate) => candidate.id === assetId);
    if (asset?.processingStatus === "READY" || asset?.processingStatus === "FAILED") return asset.processingStatus;
    setMessage(`NEY Media Core is processing the video… check ${attempt + 1} of 12.`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return "PROCESSING";
}
