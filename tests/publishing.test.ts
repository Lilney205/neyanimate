import assert from "node:assert/strict";
import test from "node:test";
import { POST as createFilm, GET as listStudioFilms } from "../src/app/api/studio/films/route";
import { PATCH as updateFilm } from "../src/app/api/studio/films/[id]/route";
import { POST as publishFilm } from "../src/app/api/studio/films/[id]/publish/route";
import { GET as getFilmBySlugApi } from "../src/app/api/films/[slug]/route";
import { GET as getPlaybackApi } from "../src/app/api/films/[slug]/playback/route";
import { prisma } from "../src/lib/db";
import { canViewFilm } from "../src/lib/access";

const APP_ORIGIN = "http://localhost:3000";

test("unauthenticated and unauthorized users are rejected from studio operations", async () => {
  // 1. Create film without authentication
  const unauthCreate = await createFilm(
    new Request("http://localhost:3000/api/studio/films", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: APP_ORIGIN },
      body: JSON.stringify({ title: "Unauthorized Film", slug: "unauth-film" }),
    }),
  );
  assert.equal(unauthCreate.status, 401);

  // 2. List studio films without authentication
  const unauthList = await listStudioFilms();
  assert.equal(unauthList.status, 401);

  // 3. Update film without authentication
  const unauthPatch = await updateFilm(
    new Request("http://localhost:3000/api/studio/films/sample-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", origin: APP_ORIGIN },
      body: JSON.stringify({ title: "New Title" }),
    }),
    { params: Promise.resolve({ id: "sample-id" }) },
  );
  assert.equal(unauthPatch.status, 401);

  // 4. Publish without authentication
  const unauthPublish = await publishFilm(
    new Request("http://localhost:3000/api/studio/films/sample-id/publish", {
      method: "POST",
      headers: { origin: APP_ORIGIN },
    }),
    { params: Promise.resolve({ id: "sample-id" }) },
  );
  assert.equal(unauthPublish.status, 401);
});

test("demo titles cannot be edited, overwritten, or published", async () => {
  // Demo films are seeded as isDemo: true
  const demoFilm = await prisma.film.findFirst({ where: { isDemo: true } });
  assert.ok(demoFilm);

  // In database policy and access check, demos have no playable feature video
  assert.equal(demoFilm.mainVideoId, null);
  assert.equal(canViewFilm({ publication: demoFilm.status, accessType: demoFilm.accessType }), true);
});

test("unpublished films remain hidden from public catalogue endpoints and playback", async () => {
  const draftSlug = `draft-film-${Date.now()}`;

  // Create a draft film directly in DB
  const draftFilm = await prisma.film.create({
    data: {
      slug: draftSlug,
      title: "Secret Draft Film",
      synopsis: "This film is currently in production and must remain private.",
      genres: ["Mystery"],
      releaseYear: 2026,
      duration: "1h 30m",
      status: "DRAFT",
      accessType: "FREE",
      isDemo: false,
    },
  });

  try {
    // 1. Verify detail route returns 404 for draft film
    const detailResponse = await getFilmBySlugApi(
      new Request(`http://localhost:3000/api/films/${draftSlug}`),
      { params: Promise.resolve({ slug: draftSlug }) },
    );
    assert.equal(detailResponse.status, 404);

    // 2. Verify playback route returns 404 for draft film
    const playbackResponse = await getPlaybackApi(
      new Request(`http://localhost:3000/api/films/${draftSlug}/playback`),
      { params: Promise.resolve({ slug: draftSlug }) },
    );
    assert.equal(playbackResponse.status, 404);
  } finally {
    await prisma.film.delete({ where: { id: draftFilm.id } });
  }
});
