# Platform analytics and viewer CRM

## Access and refresh

The audience analytics dashboard is at `/studio/analytics`. The page and its data API are restricted on the server to active `ADMIN` accounts. The studio links to the dashboard after staff authentication. The client refreshes its snapshot every 15 seconds; active playback is inferred from a heartbeat received in the last two minutes, so this is near-real-time polling rather than a streaming connection.

## Metrics

- **Viewer accounts:** active accounts with the `VIEWER` role.
- **New accounts:** viewer accounts created in the selected period.
- **Active viewers now:** distinct registered viewers plus anonymous playback sessions whose player is active and whose heartbeat is less than two minutes old.
- **Unique viewers / play sessions:** distinct registered users (or anonymous session IDs) and playback sessions that reached an actual player `play` event during the selected period.
- **Watch time:** seconds credited from Media Core HLS player state and forward position changes. A heartbeat is credited only when the prior event indicated playback, the forward position delta is no more than 45 seconds, and the server caps credit to at most 30 seconds per event. Seeking and paused time do not count. Long heartbeat gaps can undercount.
- **Completion:** a session whose player position reached at least 90% of the reported duration.
- **Retention:** the percentage of active registered viewer accounts in each daily signup cohort with a playback start during calendar day 1, 7, or 30 after signup. Cohorts without a complete measurement window are omitted from that day's curve. Anonymous viewing cannot be attributed to a registration cohort.
- **Most watched films:** play sessions, distinct viewers, credited minutes, and completion rate by film.
- **Recent viewer accounts:** the newest ten viewer accounts, with name, email when present, join date, latest playback activity, and credited minutes. This is personally identifying information and is available only to administrators.

All analytics start when the migration is applied. Existing `WatchProgress` records are not backfilled into play sessions, so historical watch time and retention cannot be reconstructed.

## Data and privacy

`PlaybackSession` stores a hash of a random per-play capability token, optional registered user ID, film ID, timestamps, playback position/duration, credited seconds, and completion state. The raw capability token is returned only to the playback page and is not stored. Anonymous sessions are treated as distinct viewers; no persistent anonymous profile or IP address is stored in the analytics table. Authenticated play sessions are associated with the viewer account to support account-level retention and CRM summaries.

Before public launch, publish an appropriate analytics/privacy notice, select and enforce a data retention period for playback session records, and review analytics and account-level viewing history for the jurisdictions and audiences served. Do not treat age recommendation metadata as age verification. The existing child-content checklist requires qualified privacy review before launching a child-directed service or collecting personal data from children.

## Operations

Apply the `20261024120000_add_playback_analytics` migration to the development database, then run `npm.cmd run prisma:generate`. The dashboard and tracking APIs require PostgreSQL. Media Core playback and the same-origin HLS proxy must be configured; the player records watch-time events from the browser's native video element.

The dashboard currently has no revenue, subscription, export, user-editing, or bulk messaging tools. Payment models are not active payment processing. Keep the dashboard administrator-only and add access audits or scoped CRM roles before granting it to non-admin staff.
