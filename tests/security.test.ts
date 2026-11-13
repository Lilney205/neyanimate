import assert from "node:assert/strict";
import test from "node:test";
import { POST as login } from "../src/app/api/auth/login/route";
import { POST as createFilm } from "../src/app/api/studio/films/route";
import { roleCanAdminister, roleCanManageFilms } from "../src/lib/auth";
import { allowAttempt, resetRateLimitsForTests } from "../src/lib/rate-limit";

test("role policy allows editors to manage but only admins to administer", () => {
  assert.equal(roleCanManageFilms("EDITOR"), false);
  assert.equal(roleCanManageFilms("ADMIN"), true);
  assert.equal(roleCanManageFilms("VIEWER"), false);
  assert.equal(roleCanAdminister("EDITOR"), false);
  assert.equal(roleCanAdminister("ADMIN"), true);
});

test("mutations reject missing or foreign origins before session/database access", async () => {
  const loginResponse = await login(new Request("http://localhost/api/auth/login", { method: "POST", body: "{}" }));
  assert.equal(loginResponse.status, 403);
  const filmResponse = await createFilm(new Request("http://localhost/api/studio/films", { method: "POST", headers: { origin: "https://attacker.example" }, body: "{}" }));
  assert.equal(filmResponse.status, 403);
});

test("rate limiter blocks excess attempts in its time window", () => {
  resetRateLimitsForTests();
  assert.equal(allowAttempt("login:test", 2, 1000, 100), true);
  assert.equal(allowAttempt("login:test", 2, 1000, 200), true);
  assert.equal(allowAttempt("login:test", 2, 1000, 300), false);
  assert.equal(allowAttempt("login:test", 2, 1000, 1200), true);
  resetRateLimitsForTests();
});
