import { NextResponse } from "next/server";
import { getPublishedFilmBySlug } from "@/lib/catalogue";
import { isDatabaseConfigured } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  try {
    const film = await getPublishedFilmBySlug(slug);
    if (!film) return NextResponse.json({ error: "Film not found." }, { status: 404 });
    return NextResponse.json({ film, source: isDatabaseConfigured() ? "database" : "fictional-demo" }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ error: "Catalogue is temporarily unavailable." }, { status: 503 });
  }
}
