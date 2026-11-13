import assert from "node:assert/strict";
import test from "node:test";
import { canViewFilm } from "../src/lib/access";

test("published free films are viewable without an account", () => {
  assert.equal(canViewFilm({ publication: "PUBLISHED", accessType: "FREE" }), true);
});

test("draft and archived films are never available to ordinary viewers", () => {
  assert.equal(canViewFilm({ publication: "DRAFT", accessType: "FREE" }), false);
  assert.equal(canViewFilm({ publication: "ARCHIVED", accessType: "FREE" }), false);
});

test("premium films require a valid trusted entitlement", () => {
  assert.equal(canViewFilm({ publication: "PUBLISHED", accessType: "PREMIUM" }), false);
  assert.equal(canViewFilm({ publication: "PUBLISHED", accessType: "PREMIUM", hasValidEntitlement: false }), false);
  assert.equal(canViewFilm({ publication: "PUBLISHED", accessType: "PREMIUM", hasValidEntitlement: true }), true);
});