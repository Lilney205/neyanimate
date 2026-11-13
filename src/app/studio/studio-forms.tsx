"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

function slugFromTitle(title: string) {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  if (slug || !title.trim()) return slug;

  let hash = 2166136261;
  for (const character of title) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  }
  return `film-${(hash >>> 0).toString(36)}`;
}

export function FilmDraftForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [customDuration, setCustomDuration] = useState(false);
  const [customGenre, setCustomGenre] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const genreChoice = String(data.get("genreChoice") ?? "");
    const genreValue = genreChoice === "other" ? String(data.get("customGenre") ?? "").trim() : genreChoice;
    const genres = genreValue ? [genreValue] : [];
    const objectives = String(data.get("learningObjectives") ?? "").split(/[,\n]/).map((objective) => objective.trim()).filter(Boolean);
    const minimumAge = String(data.get("targetAgeMin") ?? "").trim();
    const durationPreset = String(data.get("durationPreset") ?? "");
    const payload = {
      title: data.get("title"),
      slug: data.get("slug"),
      synopsis: data.get("synopsis"),
      genres,
      releaseYear: Number(data.get("releaseYear")),
      duration: durationPreset === "custom" ? data.get("durationCustom") : durationPreset,
      accessType: data.get("accessType"),
      targetAgeMin: minimumAge ? Number(minimumAge) : null,
      learningObjectives: objectives,
      parentNotes: String(data.get("parentNotes") ?? "").trim() || null,
    };
    try {
      const response = await fetch("/api/studio/films", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) setMessage(result.error ?? "Could not create draft.");
      else {
        setMessage("Draft created.");
        form.reset();
        setTitle("");
        setSlug("");
        setSlugEdited(false);
        setCustomDuration(false);
        setCustomGenre(false);
        router.refresh();
      }
    } catch {
      setMessage("Studio is temporarily unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2">
      <label className="text-sm text-slate-200">Title<input name="title" value={title} onChange={(event) => { const value = event.target.value; setTitle(value); if (!slugEdited) setSlug(slugFromTitle(value)); }} required maxLength={120} className="studio-input" /></label>
      <label className="text-sm text-slate-200">URL slug<input name="slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(event.target.value); }} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} className="studio-input" /><span className="mt-1 block text-xs text-slate-400">Generated from the title. You can edit it if needed.</span></label>
      <label className="text-sm text-slate-200">Release year
        <select name="releaseYear" required defaultValue="" className="studio-input">
          <option value="" disabled>Select a year</option>
          {Array.from({ length: 201 }, (_, index) => 2100 - index).map((year) => <option key={year} value={year}>{year}</option>)}
        </select>
      </label>
      <div>
        <label htmlFor="film-duration" className="text-sm text-slate-200">Duration</label>
        <select id="film-duration" name="durationPreset" required defaultValue="" onChange={(event) => setCustomDuration(event.target.value === "custom")} className="studio-input">
          <option value="" disabled>Select a duration</option>
          <option value="5 min">5 minutes</option>
          <option value="10 min">10 minutes</option>
          <option value="12 min">12 minutes</option>
          <option value="15 min">15 minutes</option>
          <option value="20 min">20 minutes</option>
          <option value="24 min">24 minutes</option>
          <option value="30 min">30 minutes</option>
          <option value="45 min">45 minutes</option>
          <option value="1h">1 hour</option>
          <option value="1h 15m">1 hour 15 minutes</option>
          <option value="1h 30m">1 hour 30 minutes</option>
          <option value="1h 45m">1 hour 45 minutes</option>
          <option value="2h">2 hours</option>
          <option value="2h 15m">2 hours 15 minutes</option>
          <option value="2h 30m">2 hours 30 minutes</option>
          <option value="3h">3 hours</option>
          <option value="custom">Other (enter exact duration)</option>
        </select>
        {customDuration && <label className="mt-3 block text-sm text-slate-200">Exact duration<input name="durationCustom" placeholder="e.g. 1h 54m" required maxLength={30} className="studio-input" /></label>}
      </div>
      <div>
        <label htmlFor="film-genre" className="text-sm text-slate-200">Genre</label>
        <select id="film-genre" name="genreChoice" required defaultValue="" onChange={(event) => setCustomGenre(event.target.value === "other")} className="studio-input">
          <option value="" disabled>Select a genre</option>
          <option value="Action">Action</option>
          <option value="Adventure">Adventure</option>
          <option value="Comedy">Comedy</option>
          <option value="Drama">Drama</option>
          <option value="Fantasy">Fantasy</option>
          <option value="Mystery">Mystery</option>
          <option value="Romance">Romance</option>
          <option value="Science Fiction">Science Fiction</option>
          <option value="Slice of Life">Slice of Life</option>
          <option value="Sports">Sports</option>
          <option value="Supernatural">Supernatural</option>
          <option value="Thriller">Thriller</option>
          <option value="other">Other</option>
        </select>
        {customGenre && <label className="mt-3 block text-sm text-slate-200">Enter genre<input name="customGenre" placeholder="Your genre" required maxLength={40} className="studio-input" /></label>}
      </div>
      <label className="text-sm text-slate-200">Access<select name="accessType" className="studio-input"><option value="FREE">Free</option><option value="PREMIUM">Premium (not playable yet)</option></select></label>
      <fieldset className="rounded-xl border border-slate-700 p-4 sm:col-span-2">
        <legend className="px-2 text-sm font-semibold text-sky-200">Educational / family metadata (optional)</legend>
        <p className="mb-3 text-xs leading-5 text-slate-400">Suggested age is guidance, not an official rating or legal classification.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-slate-200 sm:col-span-2">Minimum age recommendation (optional)
            <select name="targetAgeMin" defaultValue="" className="studio-input">
              <option value="">No minimum age recommendation</option>
              {Array.from({ length: 17 }, (_, index) => index + 2).map((age) => <option key={age} value={age}>{age}+</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-200 sm:col-span-2">Learning goals (comma or line separated)<textarea name="learningObjectives" rows={3} maxLength={1600} placeholder="Count objects from 1 to 10, Recognize numerals" className="studio-input" /></label>
          <label className="text-sm text-slate-200 sm:col-span-2">Parent / caregiver note<textarea name="parentNotes" rows={3} maxLength={600} placeholder="Optional discussion prompt or context for an adult watching with a child." className="studio-input" /></label>
        </div>
      </fieldset>
      <label className="text-sm text-slate-200 sm:col-span-2">Synopsis<textarea name="synopsis" rows={4} minLength={12} maxLength={4000} required className="studio-input" /></label>
      <p role="status" aria-live="polite" className="text-sm text-amber-200 sm:col-span-2">{message}</p>
      <button disabled={busy} className="rounded-full bg-sky-400 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-60 sm:col-span-2">{busy ? "Saving…" : "Save draft"}</button>
      <style jsx>{`.studio-input { display:block; width:100%; margin-top:.5rem; border:1px solid rgb(71 85 105); border-radius:.75rem; background:rgb(2 6 23); padding:.7rem .85rem; color:white; outline:none; } .studio-input:focus { border-color:rgb(56 189 248); box-shadow:0 0 0 2px rgb(56 189 248 / .35); }`}</style>
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (response.ok) router.push("/login");
    } finally {
      setBusy(false);
    }
  }
  return <button type="button" onClick={logout} disabled={busy} className="rounded-full border border-slate-600 px-5 py-3 text-sm font-semibold text-white hover:border-rose-400">{busy ? "Signing out…" : "Sign out"}</button>;
}
