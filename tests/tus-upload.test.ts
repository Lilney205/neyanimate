import assert from "node:assert/strict";
import test from "node:test";
import { isValidTusOffset, MAX_TUS_UPLOAD_BYTES, TUS_CHUNK_SIZE_BYTES, uploadFingerprint } from "../src/lib/tus-upload";

test("Media Core resumable uploads retain the 30 GB ceiling and bounded chunk size", () => {
  assert.equal(TUS_CHUNK_SIZE_BYTES, 50 * 1024 * 1024);
  assert.equal(TUS_CHUNK_SIZE_BYTES % (5 * 1024 * 1024), 0);
  assert.equal(MAX_TUS_UPLOAD_BYTES, 30 * 1024 * 1024 * 1024);
  assert.equal(isValidTusOffset(0, MAX_TUS_UPLOAD_BYTES), true);
  assert.equal(isValidTusOffset(MAX_TUS_UPLOAD_BYTES, MAX_TUS_UPLOAD_BYTES), true);
  assert.equal(isValidTusOffset(MAX_TUS_UPLOAD_BYTES + 1, MAX_TUS_UPLOAD_BYTES), false);
});

test("Media Core resume fingerprint is stable for the same file and distinct across films/assets", () => {
  const file = { name: "feature.mp4", size: 900_000_000, lastModified: 1234 } as File;
  const first = uploadFingerprint({ filmId: "film-a", kind: "FEATURE", file });
  assert.equal(first, uploadFingerprint({ filmId: "film-a", kind: "FEATURE", file }));
  assert.notEqual(first, uploadFingerprint({ filmId: "film-b", kind: "FEATURE", file }));
  assert.notEqual(first, uploadFingerprint({ filmId: "film-a", kind: "TRAILER", file }));
});
