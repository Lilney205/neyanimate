"use client";

import { useEffect, useState } from "react";

// Keep this list to videos that actually exist in public/videos.
const clips = ["/videos/ambient-1.mp4"];

export function AmbientBackground() {
  const [clipIndex, setClipIndex] = useState(0);
  const [videoUnavailable, setVideoUnavailable] = useState(false);
  const [failedClips, setFailedClips] = useState<string[]>([]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setVideoUnavailable(media.matches);
    updateMotionPreference();
    media.addEventListener("change", updateMotionPreference);
    return () => media.removeEventListener("change", updateMotionPreference);
  }, []);

  function handleClipError() {
    const failed = clips[clipIndex];
    const updatedFailures = [...failedClips, failed];
    setFailedClips(updatedFailures);
    const nextAvailableIndex = clips.findIndex((clip) => !updatedFailures.includes(clip));
    if (nextAvailableIndex < 0) setVideoUnavailable(true);
    else setClipIndex(nextAvailableIndex);
  }

  function playNextClip() {
    setClipIndex((index) => (index + 1) % clips.length);
  }

  return (
    <div className="ambient-background" aria-hidden="true">
      {!videoUnavailable && (
        <video
          key={clips[clipIndex]}
          className="ambient-background__video"
          autoPlay
          muted
          loop={clips.length === 1}
          playsInline
          preload="metadata"
          onEnded={playNextClip}
          onError={handleClipError}
        >
          <source src={clips[clipIndex]} type="video/mp4" />
        </video>
      )}
      <div className="ambient-background__shade" />
    </div>
  );
}