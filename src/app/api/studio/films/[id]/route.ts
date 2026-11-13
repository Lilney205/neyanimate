import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isSameOriginRequest, roleCanManageFilms } from "@/lib/auth";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  synopsis: z.string().trim().min(12).max(4000).optional(),
  genres: z.array(z.string().trim().min(2).max(40)).min(1).max(12).optional(),
  releaseYear: z.number().int().min(1900).max(2100).optional(),
  duration: z.string().trim().min(2).max(30).optional(),
  accessType: z.enum(["FREE", "PREMIUM"]).optional(),
  contentRating: z.string().trim().max(20).nullable().optional(),
  posterUrl: z.string().url().max(2048).nullable().optional(),
  backdropUrl: z.string().url().max(2048).nullable().optional(),
  targetAgeMin: z.number().int().min(2).max(18).nullable().optional(),
  learningObjectives: z.array(z.string().trim().min(3).max(160)).max(10).optional(),
  parentNotes: z.string().trim().max(600).nullable().optional(),
}).strict();

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!roleCanManageFilms(actor.role)) return NextResponse.json({ error: "You are not authorized to manage films." }, { status: 403 });
  const { id } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) return NextResponse.json({ error: "Invalid film changes." }, { status: 400 });

  try {
    const film = await prisma.$transaction(async (tx) => {
      const existing = await tx.film.findUnique({ where: { id } });
      if (!existing || existing.status !== "DRAFT" || existing.isDemo) throw new Error("NOT_EDITABLE");
      const updated = await tx.film.update({ where: { id }, data: { ...parsed.data, targetAgeMax: null } });
      await tx.auditLog.create({ data: { actorId: actor.id, action: "film.updated", resourceType: "Film", resourceId: id } });
      return updated;
    });
    return NextResponse.json({ film }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_EDITABLE") return NextResponse.json({ error: "Film not found or not editable." }, { status: 404 });
    return NextResponse.json({ error: "Could not update film. The slug may already be in use." }, { status: 409 });
  }
}
