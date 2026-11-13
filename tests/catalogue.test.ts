import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../src/app/api/films/route";

// Do not let a developer's shell environment accidentally point these tests at a real DB.
process.env.DATABASE_URL = "postgresql://USER:PASSWORD@localhost:5432/ney_animate?schema=public";

async function request(path: string) {
  const response = await GET(new Request(`http://localhost${path}`));
  return { response, body: await response.json() as { items?: Array<{ slug: string }>; total?: number; source?: string; error?: string } };
}

test("catalogue API exposes only published fictional demo films", async () => {
  const { response, body } = await request("/api/films");
  assert.equal(response.status, 200);
  assert.equal(body.source, "fictional-demo");
  assert.ok(body.items && body.items.length > 0);
  assert.ok(!body.items?.some((film) => film.slug.includes("draft")));
});

test("catalogue API supports search and genre filters", async () => {
  const { body } = await request("/api/films?q=skyline&genre=Sci-Fi");
  assert.equal(body.total, 1);
  assert.equal(body.items?.[0]?.slug, "skyline-harbor");
  const empty = await request("/api/films?q=not-a-real-film");
  assert.equal(empty.body.total, 0);
});

test("catalogue API accepts blank filter fields and bounds pagination", async () => {
  const blank = await request("/api/films?q=&genre=&year=&page=1&limit=12");
  assert.equal(blank.response.status, 200);
  const tooMany = await request("/api/films?limit=1000");
  assert.equal(tooMany.response.status, 400);
  const badPage = await request("/api/films?page=0");
  assert.equal(badPage.response.status, 400);
});
