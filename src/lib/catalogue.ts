import { isDatabaseConfigured, prisma } from "@/lib/db";
import { allFilms, type Film } from "@/lib/films";

export type CatalogueFilters = {
  q?: string;
  genre?: string;
  year?: number;
  access?: "free" | "premium" | "all";
  sort?: "newest" | "title";
};

function mapDatabaseFilm(film: {
  id: string;
  slug: string;
  title: string;
  synopsis: string;
  genres: string[];
  releaseYear: number;
  duration: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  status: "PUBLISHED" | "DRAFT" | "ARCHIVED";
  accessType: "FREE" | "PREMIUM";
  isDemo: boolean;
  featured: boolean;
  contentRating: string | null;
  targetAgeMin: number | null;
  learningObjectives: string[];
  parentNotes: string | null;
  trailerVideo: string | null;
  publishedAt: Date | null;
}): Film {
  return {
    id: film.id,
    slug: film.slug,
    title: film.title,
    synopsis: film.synopsis,
    genres: film.genres,
    year: film.releaseYear,
    duration: film.duration,
    rating: film.contentRating ?? "Unrated",
    access: film.accessType.toLowerCase() as Film["access"],
    status: film.status.toLowerCase() as Film["status"],
    isDemo: film.isDemo,
    featured: film.featured,
    targetAgeMin: film.targetAgeMin,
    learningObjectives: film.learningObjectives,
    parentNotes: film.parentNotes,
    trailer: film.trailerVideo,
    posterStyle: film.posterUrl ? `url("${film.posterUrl}") center / cover` : "linear-gradient(135deg, #10264c, #050b17)",
    backdropStyle: film.backdropUrl ? `url("${film.backdropUrl}") center / cover` : "linear-gradient(135deg, #071329, #101e3b)",
    accent: "#5cc8ff",
  };
}

export async function getPublishedFilms(filters: CatalogueFilters = {}) {
  let films: Film[];

  if (isDatabaseConfigured()) {
    const rows = await prisma.film.findMany({
      where: {
        status: "PUBLISHED",
        ...(filters.q ? { OR: [
          { title: { contains: filters.q, mode: "insensitive" } },
          { synopsis: { contains: filters.q, mode: "insensitive" } },
        ] } : {}),
        ...(filters.genre ? { genres: { has: filters.genre } } : {}),
        ...(filters.year ? { releaseYear: filters.year } : {}),
        ...(filters.access && filters.access !== "all" ? { accessType: filters.access.toUpperCase() as "FREE" | "PREMIUM" } : {}),
      },
      orderBy: filters.sort === "title" ? { title: "asc" } : [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });
    films = rows.map(mapDatabaseFilm);
  } else {
    films = allFilms.filter((film) => film.status === "published");
    if (filters.q) {
      const query = filters.q.toLocaleLowerCase();
      films = films.filter((film) => `${film.title} ${film.synopsis}`.toLocaleLowerCase().includes(query));
    }
    if (filters.genre) films = films.filter((film) => film.genres.some((genre) => genre.toLocaleLowerCase() === filters.genre?.toLocaleLowerCase()));
    if (filters.year) films = films.filter((film) => film.year === filters.year);
    if (filters.access && filters.access !== "all") films = films.filter((film) => film.access === filters.access);
    if (filters.sort === "title") films = films.toSorted((a, b) => a.title.localeCompare(b.title));
  }

  return films;
}

export async function getPublishedFilmBySlug(slug: string) {
  if (isDatabaseConfigured()) {
    const film = await prisma.film.findFirst({ where: { slug, status: "PUBLISHED" } });
    return film ? mapDatabaseFilm(film) : undefined;
  }
  return allFilms.find((film) => film.slug === slug && film.status === "published");
}
