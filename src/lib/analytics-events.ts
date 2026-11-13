export function creditedPlaybackSeconds(input: {
  wasPlaying: boolean;
  event: "play" | "heartbeat" | "pause" | "ended";
  elapsedSeconds: number;
  previousPosition: number;
  currentPosition: number;
}) {
  if (!input.wasPlaying || input.event === "play" || input.elapsedSeconds < 4) return 0;
  const positionDelta = Math.floor(input.currentPosition) - input.previousPosition;
  if (positionDelta <= 0 || positionDelta > 45) return 0;
  return Math.min(positionDelta, Math.floor(input.elapsedSeconds) + 3, 30);
}

export function playbackReachedCompletion(position: number, duration: number | null) {
  return duration !== null && duration > 0 && position / duration >= 0.9;
}
