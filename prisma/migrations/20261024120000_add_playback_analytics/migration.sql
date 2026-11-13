-- Store short-lived playback sessions for watch time, viewer counts, and retention analytics.
CREATE TABLE "PlaybackSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT,
    "filmId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstPlayedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
    "lastPosition" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER,
    "isPlaying" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PlaybackSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlaybackSession_tokenHash_key" ON "PlaybackSession"("tokenHash");
CREATE INDEX "User_role_status_createdAt_idx" ON "User"("role", "status", "createdAt");
CREATE INDEX "PlaybackSession_lastHeartbeatAt_endedAt_idx" ON "PlaybackSession"("lastHeartbeatAt", "endedAt");
CREATE INDEX "PlaybackSession_firstPlayedAt_idx" ON "PlaybackSession"("firstPlayedAt");
CREATE INDEX "PlaybackSession_filmId_firstPlayedAt_idx" ON "PlaybackSession"("filmId", "firstPlayedAt");
CREATE INDEX "PlaybackSession_userId_firstPlayedAt_idx" ON "PlaybackSession"("userId", "firstPlayedAt");

ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlaybackSession" ADD CONSTRAINT "PlaybackSession_filmId_fkey"
    FOREIGN KEY ("filmId") REFERENCES "Film"("id") ON DELETE CASCADE ON UPDATE CASCADE;
