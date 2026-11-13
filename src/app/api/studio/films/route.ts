import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isSameOriginRequest, roleCanManageFilms } from "@/lib/auth";
import { prisma } from "@/lib/db";

const filmSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  synopsis: z.string().trim().min(12).max(4000),
  genres: z.array(z.string().trim().min(2).max(40)).min(1).max(12),
  releaseYear: z.number().int().min(1900).max(2100),
  duration: z.string().trim().min(2).max(30),
  accessType: z.enum(["FREE", "PREMIUM"]).default("FREE"),
  contentRating: z.string().trim().max(20).optional(),
  posterUrl: z.string().url().max(2048).optional(),
  backdropUrl: z.string().url().max(2048).optional(),
  targetAgeMin: z.number().int().min(2).max(18).nullable().optional(),
  learningObjectives: z.array(z.string().trim().min(3).max(160)).max(10).optional(),
  parentNotes: z.string().trim().max(600).nullable().optional(),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!roleCanManageFilms(actor.role)) return NextResponse.json({ error: "You are not authorized to manage films." }, { status: 403 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const parsed = filmSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid film details.", fields: parsed.error.flatten().fieldErrors }, { status: 400 });

  try {
    const film = await prisma.$transaction(async (tx) => {
      const created = await tx.film.create({
        data: {
          ...parsed.data,
          status: "DRAFT",
          posterUrl: parsed.data.posterUrl ?? null,
          backdropUrl: parsed.data.backdropUrl ?? null,
          contentRating: parsed.data.contentRating ?? null,
          targetAgeMin: parsed.data.targetAgeMin ?? null,
          targetAgeMax: null,
          learningObjectives: parsed.data.learningObjectives ?? [],
          parentNotes: parsed.data.parentNotes ?? null,
        },
      });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "film.created", resourceType: "Film", resourceId: created.id } });
      return created;
    });
    return NextResponse.json({ film }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not create film. The slug may already be in use." }, { status: 409 });
  }
}

export async function GET() {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!roleCanManageFilms(actor.role)) return NextResponse.json({ error: "You are not authorized to view studio films." }, { status: 403, headers: { "Cache-Control": "no-store" } });

  try {
    const films = await prisma.film.findMany({
      orderBy: [{ updatedAt: "desc" }],
      take: 100,
      include: { videoAssets: { orderBy: { createdAt: "desc" }, take: 5 } },
    });
    return NextResponse.json({ films }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Studio catalogue is temporarily unavailable." }, { status: 503 });
  }
}
