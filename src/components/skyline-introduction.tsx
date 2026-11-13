"use client";

import { useState } from "react";

const introSources = ["/videos/ambient-2.mp4", "/videos/ambient-1.mp4"];

export function SkylineIntroduction() {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [unavailable, setUnavailable] = useState(false);

  function handleVideoError() {
    if (sourceIndex < introSources.length - 1) setSourceIndex((index) => index + 1);
    else setUnavailable(true);
  }

  return (
    <section className="relative overflow-hidden rounded-[1.5rem] border border-sky-300/30 bg-slate-950 shadow-[0_24px_60px_rgba(14,116,144,0.28)]" aria-label="Skyline Harbor introduction">
      <div className="relative aspect-video overflow-hidden rounded-[1.2rem] bg-[radial-gradient(circle_at_70%_20%,rgba(56,189,248,.32),transparent_35%),linear-gradient(135deg,#071329,#10264c)]">
        {!unavailable ? (
          <video
            key={introSources[sourceIndex]}
            className="absolute inset-0 h-full w-full object-cover opacity-75"
            controls
            muted
            playsInline
            preload="metadata"
            onError={handleVideoError}
            aria-label="Silent sample introduction footage for the fictional Skyline Harbor preview"
          >
            <source src={introSources[sourceIndex]} type="video/mp4" />
          </video>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-slate-300">
            Add an introduction clip at <code className="mx-1 text-sky-200">public/videos/ambient-2.mp4</code> to enable this preview.
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent px-5 pb-5 pt-20">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-sky-200">Fictional title · sample introduction</p>
          <h2 className="mt-2 text-2xl font-black text-white md:text-3xl">Skyline Harbor</h2>
          <p className="mt-1 text-sm text-slate-200">Sample ambient footage only—not footage from an actual NEY ANIMATE production.</p>
        </div>
      </div>
    </section>
  );
}
