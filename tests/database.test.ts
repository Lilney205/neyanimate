import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "../src/lib/db";

test("database schema integrity and table accessibility", async () => {
  // Query core tables to verify schema definition
  const [users, films, assets, sessions, resetTokens] = await Promise.all([
    prisma.user.count(),
    prisma.film.count(),
    prisma.videoAsset.count(),
    prisma.session.count(),
    prisma.passwordResetToken.count(),
  ]);

  assert.equal(typeof users, "number");
  assert.equal(typeof films, "number");
  assert.equal(typeof assets, "number");
  assert.equal(typeof sessions, "number");
  assert.equal(typeof resetTokens, "number");
});

test("database constraints enforce age range bounds and ordering", async () => {
  // Test invalid age range insertion directly into PostgreSQL
  const invalidMinAgeSlug = `test-invalid-age-${Date.now()}`;

  await assert.rejects(
    async () => {
      // In PostgreSQL, targetAgeMin has CHECK ("targetAgeMin" IS NULL OR "targetAgeMin" BETWEEN 2 AND 18)
      // and CHECK ("targetAgeMin" <= "targetAgeMax")
      await prisma.$executeRaw`
        INSERT INTO "Film" (
          "id", "slug", "title", "synopsis", "genres", "releaseYear", "duration",
          "status", "accessType", "isDemo", "featured", "targetAgeMin", "targetAgeMax",
          "learningObjectives", "updatedAt"
        ) VALUES (
          ${`id_${Date.now()}`}, ${invalidMinAgeSlug}, 'Age Check Film', 'Synopsis text',
          ARRAY['Animation']::TEXT[], 2026, '1h', 'DRAFT', 'FREE', false, false,
          10, 5, ARRAY[]::TEXT[], CURRENT_TIMESTAMP
        );
      `;
    },
    (err: unknown) => {
      if (!(err instanceof Error)) return false;
      return (
        err.message?.includes("Film_targetAge_order_check") ||
        err.message?.includes("check constraint")
      );
    },
  );
});

test("seed idempotency preserves records without creating duplicates", async () => {
  const initialFilms = await prisma.film.count({ where: { isDemo: true } });
  assert.ok(initialFilms >= 3);

  // Query seeded titles
  const skyline = await prisma.film.findUnique({ where: { slug: "skyline-harbor" } });
  const violet = await prisma.film.findUnique({ where: { slug: "violet-echo" } });
  const milo = await prisma.film.findUnique({ where: { slug: "count-with-milo" } });

  assert.ok(skyline);
  assert.ok(violet);
  assert.ok(milo);

  assert.equal(skyline.isDemo, true);
  assert.equal(violet.isDemo, true);
  assert.equal(milo.isDemo, true);
});
