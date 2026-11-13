import assert from "node:assert/strict";
import test from "node:test";
import { creditedPlaybackSeconds, playbackReachedCompletion } from "../src/lib/analytics-events";

test("watch time is credited only for bounded forward playback while playing", () => {
  assert.equal(creditedPlaybackSeconds({ wasPlaying: true, event: "heartbeat", elapsedSeconds: 15, previousPosition: 10, currentPosition: 25 }), 15);
  assert.equal(creditedPlaybackSeconds({ wasPlaying: false, event: "heartbeat", elapsedSeconds: 15, previousPosition: 10, currentPosition: 25 }), 0);
  assert.equal(creditedPlaybackSeconds({ wasPlaying: true, event: "heartbeat", elapsedSeconds: 15, previousPosition: 25, currentPosition: 10 }), 0);
});

test("watch time clamps long intervals and ignores large seek jumps", () => {
  assert.equal(creditedPlaybackSeconds({ wasPlaying: true, event: "heartbeat", elapsedSeconds: 120, previousPosition: 0, currentPosition: 40 }), 30);
  assert.equal(creditedPlaybackSeconds({ wasPlaying: true, event: "heartbeat", elapsedSeconds: 15, previousPosition: 0, currentPosition: 90 }), 0);
  assert.equal(creditedPlaybackSeconds({ wasPlaying: true, event: "heartbeat", elapsedSeconds: 3, previousPosition: 0, currentPosition: 3 }), 0);
});

test("completion requires a positive duration and position at or above 90 percent", () => {
  assert.equal(playbackReachedCompletion(90, 100), true);
  assert.equal(playbackReachedCompletion(89, 100), false);
  assert.equal(playbackReachedCompletion(10, 0), false);
  assert.equal(playbackReachedCompletion(10, null), false);
});
