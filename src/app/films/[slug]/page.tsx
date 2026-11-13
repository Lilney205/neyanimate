import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedFilmBySlug } from "@/lib/catalogue";
import type { Metadata } from "next";
import { PlaybackPanel } from "./playback-panel";
import { formatMinimumAge } from "@/lib/educational-content";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const film = await getPublishedFilmBySlug(slug);
  if (!film) return { title: "Film not found | NEY ANIMATE" };
  return { title: `${film.title} | NEY ANIMATE`, description: film.synopsis };
}

export default async function FilmDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const film = await getPublishedFilmBySlug(slug);

  if (!film) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 lg:px-10">
      <Link href="/films" className="mb-6 inline-flex text-sm font-medium text-sky-300">← Back to catalogue</Link>

      <article className="overflow-hidden rounded-[2rem] border border-slate-700/80 bg-slate-900/60 shadow-[0_0_80px_rgba(15,23,42,0.7)]">
        <div className="p-6 md:p-8" style={{ background: film.backdropStyle }}>
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end">
            <div className="h-72 w-full max-w-xs rounded-[1.5rem] border border-white/10 p-4 shadow-[0_24px_60px_rgba(15,23,42,0.4)]" style={{ background: film.posterStyle }}>
              <div className="flex h-full flex-col justify-between rounded-[1rem] border border-white/10 bg-slate-950/15 p-4">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100">
                  <span>{film.access === "free" ? "Free" : "Premium"}</span>
                  <span>{film.year}</span>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-100">{film.rating}</p>
                  <h1 className="mt-3 text-4xl font-black text-white">{film.title}</h1>
                </div>
              </div>
            </div>

            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.34em] text-sky-300">{film.isDemo ? "Fictional demo title" : "Film details"}</p>
              <h2 className="mt-3 text-3xl font-black text-white md:text-5xl">{film.title}</h2>
              <div className="mt-5 flex flex-wrap gap-3 text-sm text-slate-200">
                <span className="rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1">{film.year}</span>
                <span className="rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1">{film.duration}</span>
                <span className="rounded-full border border-slate-600 bg-slate-900/70 px-3 py-1">{film.rating}</span>
                {formatMinimumAge(film.targetAgeMin) && <span className="rounded-full border border-lime-300/40 bg-lime-400/10 px-3 py-1 text-lime-100">Minimum age {formatMinimumAge(film.targetAgeMin)}</span>}
                {film.genres.map((genre) => (
                  <span key={genre} className="rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-sky-100">{genre}</span>
                ))}
              </div>

              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-200">{film.synopsis}</p>

              {film.learningObjectives && film.learningObjectives.length > 0 && (
                <section className="mt-6 max-w-2xl rounded-2xl border border-lime-300/20 bg-lime-300/5 p-5" aria-labelledby="learning-goals-title">
                  <h3 id="learning-goals-title" className="font-bold text-lime-100">Learning goals</h3>
                  <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-200">
                    {film.learningObjectives.map((objective) => <li key={objective}>{objective}</li>)}
                  </ul>
                </section>
              )}
              {film.parentNotes && <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300"><strong className="text-white">For parents and caregivers:</strong> {film.parentNotes}</p>}

              <PlaybackPanel slug={film.slug} access={film.access} demo={Boolean(film.isDemo)} />
              {film.trailer && <p className="mt-4 text-sm text-slate-300">Trailer: {film.trailer}</p>}
            </div>
          </div>
        </div>
      </article>
    </main>
  );
}
