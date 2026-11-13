import Link from "next/link";
import { getPublishedFilms } from "@/lib/catalogue";
import { SkylineIntroduction } from "@/components/skyline-introduction";

export default async function HomePage() {
  const films = await getPublishedFilms();
  const featuredFilms = films.filter((film) => film.featured);
  const latest = films.slice(0, 4);
  const heroFilm = films.find((film) => film.slug === "skyline-harbor") ?? featuredFilms[0] ?? films[0];

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl px-6 pb-12 lg:px-10">
        <div className="glass-panel relative overflow-hidden rounded-[2rem] border border-sky-400/20 p-6 shadow-[0_0_80px_rgba(59,130,246,0.2)] md:p-10">
          <div className="absolute inset-0 opacity-80 terminal-grid" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-r from-sky-950/80 via-slate-950/40 to-transparent" aria-hidden="true" />

          <div className="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <div className="mb-5 inline-flex rounded-full border border-sky-300/30 bg-sky-500/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.26em] text-sky-200">
                {heroFilm?.isDemo ? "Fictional catalogue preview" : "Independent stories, made to move you"}
              </div>
              <h1 className="max-w-xl text-4xl font-black tracking-tight text-white md:text-6xl">
                Stream cinematic anime stories built for a new era.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-200 md:text-lg">
                Discover imaginative worlds, bold characters, and cinematic anime storytelling. A new independent streaming home is taking shape.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href={heroFilm ? `/films/${heroFilm.slug}` : "/films"}
                  className="rounded-full bg-sky-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300"
                >
                  {heroFilm?.isDemo ? "Explore fictional preview" : "Explore featured film"}
                </Link>
                <Link
                  href="/films"
                  className="rounded-full border border-slate-600 bg-slate-900/60 px-6 py-3 text-sm font-semibold text-white transition hover:border-slate-400"
                >
                  Explore catalogue
                </Link>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-md">
              <SkylineIntroduction />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-8 lg:px-10">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Featured films</h2>
          <Link href="/films" className="text-sm font-medium text-sky-300">View all →</Link>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {featuredFilms.map((film) => (
            <Link key={film.slug} href={`/films/${film.slug}`} className="group overflow-hidden rounded-[1.5rem] border border-slate-700/80 bg-slate-900/70 transition hover:-translate-y-1 hover:border-sky-400/45">
              <div className="aspect-[4/5] p-4" style={{ background: film.posterStyle }}>
                <div className="flex h-full flex-col justify-between rounded-[1rem] border border-white/10 bg-slate-950/10 p-4">
                  <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-sky-100">
                    <span>{film.access === "free" ? "Free" : "Premium"}</span>
                    <span>{film.year}</span>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-200">{film.genres[0]}</p>
                    <h3 className="mt-2 text-2xl font-black text-white">{film.title}</h3>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Latest releases</h2>
          <Link href="/films" className="text-sm font-medium text-sky-300">See full catalogue →</Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {latest.map((film) => (
            <Link key={film.slug} href={`/films/${film.slug}`} className="glass-panel overflow-hidden rounded-[1.3rem] border border-slate-700/80 p-3 transition hover:border-sky-400/40">
              <div className="aspect-[3/4] rounded-[1rem] p-3" style={{ background: film.posterStyle }}>
                <div className="flex h-full flex-col justify-between rounded-[0.8rem] border border-white/10 bg-slate-950/10 p-3">
                  <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.18em] text-sky-100">
                    <span>{film.access}</span>
                    <span>{film.duration}</span>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-100">{film.rating}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{film.title}</h3>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <footer className="mx-auto mt-8 max-w-7xl border-t border-slate-800 px-6 py-8 text-sm text-slate-400 lg:px-10">
        <div className="flex flex-col justify-between gap-3 sm:flex-row">
          <p>© {new Date().getFullYear()} NEY ANIMATE. Independent stories, streaming directly.</p>
          {films.some((film) => film.isDemo) && <p>Fictional demo titles · not actual NEY ANIMATE productions.</p>}
        </div>
      </footer>
    </main>
  );
}
