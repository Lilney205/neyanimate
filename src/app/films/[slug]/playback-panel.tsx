"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

export function PlaybackPanel({ slug, access, demo }: { slug: string; access: "free" | "premium"; demo: boolean }) {
  const [playerUrl, setPlayerUrl] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playingRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!playerUrl || !sessionToken || !video) return;
    let hls: Hls | null = null;
    let refreshing = false;

    const sendEvent = (event: "play" | "heartbeat" | "pause" | "ended", keepalive = false) => {
      const position = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      const duration = Number.isFinite(video.duration) ? video.duration : undefined;
      void fetch("/api/analytics/playback-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, event, position, duration }),
        keepalive,
      }).catch(() => undefined);
    };
    const onPlay = () => { playingRef.current = true; sendEvent("play"); };
    const onPause = () => { playingRef.current = false; sendEvent("pause"); };
    const onEnded = () => { playingRef.current = false; sendEvent("ended", true); };
    const onPageHide = () => sendEvent("ended", true);
    const onVideoError = () => setMessage("The video stream could not be loaded. Check the Media Core connection and try again.");
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onVideoError);
    window.addEventListener("pagehide", onPageHide);
    const heartbeat = window.setInterval(() => {
      if (playingRef.current && !document.hidden && !video.paused) sendEvent("heartbeat");
    }, 15_000);

    const refreshGrant = async (reloadStream: boolean) => {
      if (refreshing) return;
      refreshing = true;
      const position = video.currentTime;
      const wasPlaying = !video.paused;
      try {
        const response = await fetch(`/api/films/${encodeURIComponent(slug)}/playback`, { cache: "no-store" });
        if (!response.ok) throw new Error("Playback authorization expired. Please start playback again.");
        if (reloadStream && hls) {
          hls.loadSource(playerUrl);
          hls.once(Hls.Events.MANIFEST_PARSED, () => {
            video.currentTime = position;
            if (wasPlaying) void video.play().catch(() => undefined);
          });
        }
        setMessage("");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not renew playback authorization.");
      } finally {
        refreshing = false;
      }
    };

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playerUrl;
    } else if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(playerUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.response?.code === 401) void refreshGrant(true);
        else if (data.fatal) setMessage("The video stream could not be loaded. Check the Media Core connection and try again.");
      });
    }

    const grantRefresh = window.setInterval(() => { void refreshGrant(false); }, 10 * 60 * 1000);
    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(grantRefresh);
      window.removeEventListener("pagehide", onPageHide);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onVideoError);
      video.pause();
      video.removeAttribute("src");
      video.load();
      hls?.destroy();
    };
  }, [playerUrl, sessionToken, slug]);

  async function startPlayback() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/films/${encodeURIComponent(slug)}/playback`, { method: "POST", cache: "no-store" });
      const result = await response.json() as { playerUrl?: string; sessionToken?: string; error?: string };
      if (!response.ok || !result.playerUrl) throw new Error(result.error ?? "Playback is unavailable.");
      const video = document.createElement("video");
      if (!video.canPlayType("application/vnd.apple.mpegurl") && !Hls.isSupported()) {
        throw new Error("This browser does not support HLS video playback.");
      }
      setPlayerUrl(result.playerUrl);
      setSessionToken(result.sessionToken ?? "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Playback is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  if (playerUrl) {
    return (
      <div className="mt-8 w-full max-w-4xl">
        <div className="aspect-video overflow-hidden rounded-2xl border border-sky-400/30 bg-black shadow-[0_20px_80px_rgba(0,0,0,.55)]">
          <video ref={videoRef} controls playsInline className="h-full w-full" aria-label={`NEY ANIMATE player: ${slug}`} />
        </div>
        <p className="mt-2 text-xs text-slate-400">Video streams securely through NEY Media Core.</p>
        {message && <p role="status" aria-live="polite" className="mt-2 text-sm text-amber-200">{message}</p>}
      </div>
    );
  }

  const disabled = demo || access === "premium";
  return (
    <div className="mt-8">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => void startPlayback()}
        className="rounded-full bg-sky-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
      >
        {demo ? "Demo title — no video" : access === "premium" ? "Premium playback not enabled" : loading ? "Loading player…" : "Play film"}
      </button>
      {message && <p role="status" aria-live="polite" className="mt-3 max-w-xl text-sm text-amber-200">{message}</p>}
      {access === "premium" && !demo && <p className="mt-3 max-w-xl text-sm text-slate-400">Premium playback stays locked until verified payment entitlements and signed playback are enabled.</p>}
    </div>
  );
}
