import { prisma } from "@/lib/db";

type CountValue = bigint | number;

type TrendRow = {
  day: Date;
  signups: CountValue;
  views: CountValue;
  viewers: CountValue;
  watchSeconds: CountValue;
};

type RetentionRow = {
  cohort: Date;
  users: CountValue;
  day1: CountValue | null;
  day7: CountValue | null;
  day30: CountValue | null;
};

type FilmRow = {
  id: string;
  title: string;
  sessions: CountValue;
  viewers: CountValue;
  watchSeconds: CountValue;
  completions: CountValue;
};

type ViewerRow = {
  id: string;
  name: string;
  email: string | null;
  createdAt: Date;
  lastSeen: Date | null;
  watchSeconds: CountValue;
};

const toNumber = (value: CountValue | null | undefined) => Number(value ?? 0);

export async function getAdminAnalytics(days: 7 | 30 | 90 = 30) {
  const now = new Date();
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - days + 1);
  since.setUTCHours(0, 0, 0, 0);
  const activeSince = new Date(now.getTime() - 2 * 60 * 1000);
  const retentionSince = new Date(now);
  retentionSince.setUTCDate(retentionSince.getUTCDate() - 60);
  retentionSince.setUTCHours(0, 0, 0, 0);

  const [
    viewerAccounts,
    newViewerAccounts,
    activeViewers,
    sessionStats,
    trendRows,
    retentionRows,
    filmRows,
    viewerRows,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "VIEWER", status: "ACTIVE" } }),
    prisma.user.count({ where: { role: "VIEWER", status: "ACTIVE", createdAt: { gte: since } } }),
    prisma.$queryRaw<Array<{ count: CountValue }>>`
      SELECT COUNT(DISTINCT COALESCE("userId", "id")) AS "count"
      FROM "PlaybackSession"
      WHERE "firstPlayedAt" IS NOT NULL AND "endedAt" IS NULL AND "lastHeartbeatAt" >= ${activeSince}
    `,
    prisma.$queryRaw<Array<{ sessions: CountValue; viewers: CountValue; watchSeconds: CountValue; completions: CountValue }>>`
      SELECT
        COUNT(*) AS "sessions",
        COUNT(DISTINCT COALESCE("userId", "id")) AS "viewers",
        COALESCE(SUM("watchedSeconds"), 0) AS "watchSeconds",
        COUNT(*) FILTER (WHERE "completedAt" IS NOT NULL) AS "completions"
      FROM "PlaybackSession"
      WHERE "firstPlayedAt" >= ${since}
    `,
    prisma.$queryRaw<TrendRow[]>`
      WITH days AS (
        SELECT generate_series(
          date_trunc('day', ${since}::timestamp),
          date_trunc('day', ${now}::timestamp),
          interval '1 day'
        )::date AS day
      )
      SELECT
        d.day AS day,
        (SELECT COUNT(*) FROM "User" u WHERE u."role" = 'VIEWER' AND u."status" = 'ACTIVE' AND u."createdAt" >= d.day AND u."createdAt" < d.day + interval '1 day') AS signups,
        (SELECT COUNT(*) FROM "PlaybackSession" p WHERE p."firstPlayedAt" >= d.day AND p."firstPlayedAt" < d.day + interval '1 day') AS views,
        (SELECT COUNT(DISTINCT COALESCE(p."userId", p."id")) FROM "PlaybackSession" p WHERE p."firstPlayedAt" >= d.day AND p."firstPlayedAt" < d.day + interval '1 day') AS viewers,
        (SELECT COALESCE(SUM(p."watchedSeconds"), 0) FROM "PlaybackSession" p WHERE p."firstPlayedAt" >= d.day AND p."firstPlayedAt" < d.day + interval '1 day') AS "watchSeconds"
      FROM days d
      ORDER BY d.day
    `,
    prisma.$queryRaw<RetentionRow[]>`
      WITH cohorts AS (
        SELECT u."id", u."createdAt", date_trunc('day', u."createdAt")::date AS cohort
        FROM "User" u
        WHERE u."role" = 'VIEWER' AND u."status" = 'ACTIVE' AND u."createdAt" >= ${retentionSince}
      )
      SELECT
        c.cohort AS cohort,
        COUNT(*) AS users,
        CASE WHEN c.cohort <= CURRENT_DATE - 1 THEN COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "PlaybackSession" p WHERE p."userId" = c."id" AND p."firstPlayedAt" >= c.cohort + interval '1 day' AND p."firstPlayedAt" < c.cohort + interval '2 days'
        )) ELSE NULL END AS day1,
        CASE WHEN c.cohort <= CURRENT_DATE - 7 THEN COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "PlaybackSession" p WHERE p."userId" = c."id" AND p."firstPlayedAt" >= c.cohort + interval '7 days' AND p."firstPlayedAt" < c.cohort + interval '8 days'
        )) ELSE NULL END AS day7,
        CASE WHEN c.cohort <= CURRENT_DATE - 30 THEN COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "PlaybackSession" p WHERE p."userId" = c."id" AND p."firstPlayedAt" >= c.cohort + interval '30 days' AND p."firstPlayedAt" < c.cohort + interval '31 days'
        )) ELSE NULL END AS day30
      FROM cohorts c
      GROUP BY c.cohort
      ORDER BY c.cohort
    `,
    prisma.$queryRaw<FilmRow[]>`
      SELECT
        f."id" AS id,
        f."title" AS title,
        COUNT(p."id") AS sessions,
        COUNT(DISTINCT COALESCE(p."userId", p."id")) AS viewers,
        COALESCE(SUM(p."watchedSeconds"), 0) AS "watchSeconds",
        COUNT(p."id") FILTER (WHERE p."completedAt" IS NOT NULL) AS completions
      FROM "PlaybackSession" p
      INNER JOIN "Film" f ON f."id" = p."filmId"
      WHERE p."firstPlayedAt" >= ${since}
      GROUP BY f."id", f."title"
      ORDER BY SUM(p."watchedSeconds") DESC, COUNT(p."id") DESC
      LIMIT 8
    `,
    prisma.$queryRaw<ViewerRow[]>`
      SELECT
        u."id" AS id,
        u."name" AS name,
        u."email" AS email,
        u."createdAt" AS "createdAt",
        MAX(p."lastHeartbeatAt") AS "lastSeen",
        COALESCE(SUM(p."watchedSeconds"), 0) AS "watchSeconds"
      FROM "User" u
      LEFT JOIN "PlaybackSession" p ON p."userId" = u."id" AND p."firstPlayedAt" IS NOT NULL
      WHERE u."role" = 'VIEWER' AND u."status" = 'ACTIVE'
      GROUP BY u."id", u."name", u."email", u."createdAt"
      ORDER BY u."createdAt" DESC
      LIMIT 10
    `,
  ]);

  const stats = sessionStats[0] ?? { sessions: 0, viewers: 0, watchSeconds: 0, completions: 0 };
  const sessions = toNumber(stats.sessions);
  return {
    generatedAt: now.toISOString(),
    periodDays: days,
    summary: {
      viewerAccounts,
      newViewerAccounts,
      activeViewers: toNumber(activeViewers[0]?.count),
      sessions,
      uniqueViewers: toNumber(stats.viewers),
      watchMinutes: Math.round(toNumber(stats.watchSeconds) / 60),
      averageSessionMinutes: sessions ? Math.round(toNumber(stats.watchSeconds) / sessions / 60 * 10) / 10 : 0,
      completionRate: sessions ? Math.round(toNumber(stats.completions) / sessions * 100) : 0,
    },
    trend: trendRows.map((row) => ({
      date: row.day.toISOString().slice(0, 10),
      signups: toNumber(row.signups),
      views: toNumber(row.views),
      viewers: toNumber(row.viewers),
      watchMinutes: Math.round(toNumber(row.watchSeconds) / 60),
    })),
    retention: retentionRows.map((row) => {
      const users = toNumber(row.users);
      const percent = (count: CountValue | null) => count === null ? null : users ? Math.round(toNumber(count) / users * 100) : 0;
      return { cohort: row.cohort.toISOString().slice(0, 10), users, day1: percent(row.day1), day7: percent(row.day7), day30: percent(row.day30) };
    }),
    topFilms: filmRows.map((row) => {
      const totalSessions = toNumber(row.sessions);
      return {
        id: row.id,
        title: row.title,
        sessions: totalSessions,
        viewers: toNumber(row.viewers),
        watchMinutes: Math.round(toNumber(row.watchSeconds) / 60),
        completionRate: totalSessions ? Math.round(toNumber(row.completions) / totalSessions * 100) : 0,
      };
    }),
    recentViewers: viewerRows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      createdAt: row.createdAt.toISOString(),
      lastSeen: row.lastSeen?.toISOString() ?? null,
      watchMinutes: Math.round(toNumber(row.watchSeconds) / 60),
    })),
  };
}
