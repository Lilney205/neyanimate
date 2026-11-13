import assert from "node:assert/strict";
import test from "node:test";
import { mediaCorePlaybackUrl } from "../src/lib/playback";
import { canViewFilm } from "../src/lib/access";

test("Media Core playback URLs stay on the application origin and require a Core asset ID", () => {
  assert.equal(mediaCorePlaybackUrl("0123456789abcdef0123456789abcdef"), "/playback/0123456789abcdef0123456789abcdef/index.m3u8");
  assert.equal(mediaCorePlaybackUrl("../other-host"), null);
});

test("published free film is allowed but premium playback stays blocked without entitlement", () => {
  assert.equal(canViewFilm({ publication: "PUBLISHED", accessType: "FREE" }), true);
  assert.equal(canViewFilm({ publication: "PUBLISHED", accessType: "PREMIUM" }), false);
  assert.equal(canViewFilm({ publication: "PUBLISHED", accessType: "PREMIUM", hasValidEntitlement: true }), true);
  assert.equal(canViewFilm({ publication: "DRAFT", accessType: "FREE" }), false);
});
