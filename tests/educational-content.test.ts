import assert from "node:assert/strict";
import test from "node:test";
import { formatMinimumAge, isValidMinimumAge } from "../src/lib/educational-content";
import { getFilmBySlug } from "../src/lib/films";

test("minimum age recommendations are optional and limited to 2 through 18", () => {
  assert.equal(isValidMinimumAge(null), true);
  assert.equal(isValidMinimumAge(undefined), true);
  assert.equal(isValidMinimumAge(3), true);
  assert.equal(isValidMinimumAge(2), true);
  assert.equal(isValidMinimumAge(18), true);
  assert.equal(isValidMinimumAge(1), false);
  assert.equal(isValidMinimumAge(19), false);
  assert.equal(isValidMinimumAge(3.5), false);
});

test("minimum age formatting is open-ended and does not invent a rating", () => {
  assert.equal(formatMinimumAge(3), "Ages 3+");
  assert.equal(formatMinimumAge(null), null);
});

test("Count with Milo is a clearly fictional, free, non-playable educational example", () => {
  const film = getFilmBySlug("count-with-milo");
  assert.ok(film);
  assert.equal(film.title, "Count with Milo");
  assert.equal(film.isDemo, true);
  assert.equal(film.access, "free");
  assert.equal(film.targetAgeMin, 3);
  assert.ok(film.learningObjectives?.some((goal) => goal.includes("1 to 10")));
  assert.ok(film.parentNotes?.includes("Fictional sample"));
  assert.equal(film.trailer, undefined);
});
