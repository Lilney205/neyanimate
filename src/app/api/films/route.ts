import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublishedFilms } from "@/lib/catalogue";
import { isDatabaseConfigured } from "@/lib/db";

const querySchema = z.object({
  q: z.string().trim().optional(),
  genre: z.string().trim().optional(),
  year: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().int().min(1900).max(2100).optional()),
  access: z.enum(["free", "premium", "all"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  sort: z.enum(["newest", "title"]).default("newest"),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters." }, { status: 400 });
  }

  const { q, genre, year, access, page, limit, sort } = parsed.data;
  try {
    const items = await getPublishedFilms({ q, genre, year, access, sort });
    const total = items.length;
    const paginated = items.slice((page - 1) * limit, page * limit);

    return NextResponse.json(
      {
        items: paginated,
        page,
        limit,
        total,
        source: isDatabaseConfigured() ? "database" : "fictional-demo",
        filters: { q: q ?? null, genre: genre ?? null, year: year ?? null, access: access ?? "all", sort },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json({ error: "Catalogue is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
