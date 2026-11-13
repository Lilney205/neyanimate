import Link from "next/link";
import { getPublishedFilms, type CatalogueFilters } from "@/lib/catalogue";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function FilmsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const genre = typeof params.genre === "string" ? params.genre.slice(0, 60) : "";
  const yearValue = typeof params.year === "string" ? Number(params.year) : undefined;
  const accessValue = typeof params.access === "string" ? params.access : "all";
  const sortValue = typeof params.sort === "string" ? params.sort : "newest";
  const filters: CatalogueFilters = {
    q: query || undefined,
    genre: genre || undefined,
    year: Number.isInteger(yearValue) && yearValue && yearValue > 1900 && yearValue < 2101 ? yearValue : undefined,
    access: accessValue === "free" || accessValue === "premium" ? accessValue : "all",
    sort: sortValue === "title" ? "title" : "newest",
  };
  const allFilms = await getPublishedFilms(filters);
  const allPublishedFilms = await getPublishedFilms();
  const years = [...new Set(allPublishedFilms.map((film) => film.year))].sort((a, b) => b - a);
  const allGenres = [...new Set(allPublishedFilms.flatMap((film) => film.genres))].sort();

  return (
    <main className="mx-auto max-w-7xl px-6 py-10 lg:px-10">
      <header className="mb-8 space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-sky-300">Catalogue</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-white">Discover the library</h1>
        </div>
        <div className="glass-panel flex items-center gap-3 rounded-full px-4 py-3 text-sm text-slate-200">
          <span className="text-sky-300">●</span>
          {allFilms.length} published {allFilms.length === 1 ? "film" : "films"}
        </div>
        </div>

      {allFilms.some((film) => film.isDemo) && <p className="mb-5 text-sm text-amber-200">Preview catalogue · titles shown are fictional examples, not NEY ANIMATE productions.</p>}

      <form action="/films" method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div className="glass-panel rounded-2xl border border-slate-700/80 p-3">
          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Search</label>
          <input
            name="q"
            aria-label="Search films"
            defaultValue={query}
            placeholder="Title, genre..."
            className="mt-3 w-full rounded-xl border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
          />
        </div>
        <div className="glass-panel rounded-2xl border border-slate-700/80 p-3">
          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Genre</label>
          <select name="genre" defaultValue={genre} className="mt-3 w-full rounded-xl border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400">
            <option value="">All genres</option>
            {allGenres.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </div>
        <div className="glass-panel rounded-2xl border border-slate-700/80 p-3">
          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Year</label>
          <select name="year" defaultValue={filters.year ?? ""} className="mt-3 w-full rounded-xl border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400">
            <option value="">All years</option>
            {years.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
        </div>
        <div className="glass-panel rounded-2xl border border-slate-700/80 p-3">
          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Access</label>
          <select name="access" defaultValue={filters.access} className="mt-3 w-full rounded-xl border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400">
            <option value="all">All access</option>
            <option value="free">Free</option>
            <option value="premium">Premium</option>
          </select>
        </div>
        <div className="glass-panel rounded-2xl border border-slate-700/80 p-3">
          <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Sort</label>
          <select name="sort" defaultValue={filters.sort} className="mt-3 w-full rounded-xl border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400">
            <option value="newest">Newest</option><option value="title">Title A–Z</option>
          </select>
        </div>
        <button className="rounded-2xl bg-sky-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300">Find films</button>
      </form>
      </header>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {allFilms.map((film) => (
          <Link
            key={film.slug}
            href={`/films/${film.slug}`}
            className="group overflow-hidden rounded-[1.6rem] border border-slate-700/80 bg-slate-900/60 transition hover:-translate-y-1 hover:border-sky-400/40"
          >
            <div className="aspect-[4/5] p-4" style={{ background: film.posterStyle }}>
              <div className="flex h-full flex-col justify-between rounded-[1rem] border border-white/10 bg-slate-950/15 p-4">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100">
                  <span>{film.isDemo ? "Demo title" : film.access === "free" ? "Free" : "Premium"}</span>
                  <span>{film.year}</span>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-100">{film.genres.join(" • ")}</p>
                  <h2 className="mt-3 text-3xl font-black text-white">{film.title}</h2>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
      {allFilms.length === 0 && <div className="glass-panel rounded-3xl p-10 text-center"><h2 className="text-xl font-bold">No films match those filters</h2><p className="mt-2 text-slate-300">Try another title, genre, year or access type.</p><Link href="/films" className="mt-5 inline-flex rounded-full bg-sky-400 px-5 py-2.5 font-semibold text-slate-950">Clear filters</Link></div>}
    </main>
  );
}
