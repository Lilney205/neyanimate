This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

# NEY ANIMATE

An independent anime streaming platform foundation built with Next.js App Router, TypeScript, Tailwind CSS, Prisma, and PostgreSQL. Fictional sample films are clearly labelled and are not representations of actual NEY ANIMATE productions.

For the engineering architecture, request flows, security invariants, local setup, and launch gaps, see [the Engineering Overview](docs/engineering-overview.md).
For a file-by-file component map, lifecycle flows, data model, API inventory, tests, and maintainer checklist, see the [Developer Guide](docs/developer-guide.md).
For admin analytics definitions, access controls, and playback data handling, see [Platform Analytics](docs/platform-analytics.md).

## Local setup

Requirements: Node.js 20.9+ and npm. A PostgreSQL database is required for persistent catalogue data. The app can render its fictional preview catalogue without a database; in this mode database-backed writes and real playback are intentionally unavailable.

1. Copy `.env.example` to `.env` (PowerShell: `Copy-Item .env.example .env`).
2. Set `DATABASE_URL` to a PostgreSQL connection string. Leave the template value while working without a database; it is not a real credential.
3. Install dependencies with `npm install`.
4. Generate the Prisma client with `npm run prisma:generate`.
5. Apply migrations with `npm run prisma:migrate` and load fictional demo titles with `npm run prisma:seed`.
6. Start the app with `npm run dev` and visit `http://localhost:3000`.

Quality checks: `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.

## Ambient background videos

Place silent clips in `public/videos/`. `ambient-1.mp4` loops as the site-wide background. The homepage's Skyline Harbor introduction prefers `ambient-2.mp4`, then falls back to `ambient-1.mp4`; the intro is clearly labeled sample footage, not actual Skyline Harbor production footage. Both videos are muted. Replace the empty `ambient-2.mp4` placeholder with an authorized clip to use a distinct intro. Videos respect reduced-motion settings; keep them H.264 MP4 and web-optimized.

## Database and demo data

The Prisma schema is in `prisma/schema.prisma`. Migrations are version controlled in `prisma/migrations`. Seed entries are fictional, have no playable video identifiers, and are marked `isDemo`; the seed creates no admin account or default password. Public film pages and `/api/films` only query published entries. Premium items are not playable without an entitlement; payments are not enabled.

Do not run a seed against a production catalogue without reviewing its effects. Use a disposable development database for integration tests. Take and verify managed PostgreSQL backups before deploying migrations. Recovery should restore a recent database snapshot to a separate instance first, verify data, then switch the application connection string; do not overwrite the only backup.

## Current safety boundaries

- Studio login uses opaque random tokens stored as hashes and HttpOnly/SameSite cookies. Passwords are bcrypt-hashed; no default administrator is seeded.
- Studio film create/edit/publish APIs enforce server-side roles and same-origin requests, and write audit records. Only drafts may be edited; publishing rejects demo films and requires a verified ready feature asset.
- New uploads use NEY Media Core with short-lived asset-scoped grants and resumable 50 MiB chunks (30 GiB default ceiling); the permanent tenant key stays server-side.
- Watcher rate limiting is process-local and is only a development fallback. Replace it with an atomic shared limiter before running multiple app instances.
- Published FREE films play through an authenticated same-origin HLS proxy and HLS.js.
- PREMIUM playback remains denied until payment provider verification, entitlement checks, and signed playback token issuance have been implemented and tested. There is no claim of DRM or absolute piracy prevention.
- No payment provider is activated; a premium flag does not grant access.
- `.env` is git-ignored. Never commit provider tokens, database passwords, session secrets, or real customer data.

## NEY Media Core integration

Set `NEY_MEDIA_CORE_URL` and `NEY_MEDIA_CORE_SERVICE_KEY` in the app's local `.env` or deployment secret manager. The URL must be an origin (for example `http://localhost:8080` locally and a public HTTPS URL in production); the service key must never be exposed with a `NEXT_PUBLIC_` prefix.

In the Core project's secret store, configure `UPLOAD_GRANT_SECRET` and add the exact app origins to `UPLOAD_ALLOWED_ORIGINS`. The browser receives only a short-lived grant scoped to one asset, exact file size/type, and expiry; it never receives the tenant service key.

1. Use a hosted PostgreSQL database for the Vercel app and run the Prisma migrations there. A database bound to localhost on the PC is not reachable by Vercel.
2. Keep Media Core in Docker on the PC if desired, but give it a stable public HTTPS URL through the Core Caddy edge profile or a trusted HTTPS tunnel. `localhost:8080` only works for local development; Vercel and remote viewers cannot reach it.
3. Configure the Core tenant key for `ney-animate`, the upload grant secret, and the exact production app origin(s). Keep the service key only in Vercel server-side environment variables.
4. In `/studio`, create a real draft, choose a licensed MP4/WebM/QuickTime file, and select **Upload to Media Core**. The browser sends resumable 50 MiB chunks directly to Core, avoiding Vercel's request-size limit. The default total file limit is 30 GiB and can be lowered in Core configuration.
5. After Core reports `READY`, publish the feature from Studio. Playback is served to viewers through the app's same-origin proxy, which forwards only the scoped HttpOnly playback cookie.
6. The PC, Docker, disk, network, and public Core URL must remain online for uploads and playback. Back up the Core database and media volume; local filesystem storage is not replicated or highly available.

The provider migration retains existing non-Core video asset rows as unsupported records; it does not delete them or transfer their underlying video files. Re-upload those videos to Media Core before publishing or playback. Keep original source videos backed up, and plan for Core storage, transcoding, and playback bandwidth. Premium signed playback tokens and DRM are not implemented; resumable upload improves transfer reliability but does not prevent copying.

## Deployment and operations checklist

- Deploy the Next.js app to a managed Next.js host and PostgreSQL to a managed database with TLS, pooling, automated backups, and restore drills.
- Set production secrets only in the hosting provider's secret manager. Use HTTPS and a restrictive Content Security Policy/headers appropriate to the configured player and image hosts.
- Add structured, privacy-minimizing logs, error reporting, health monitoring, alerts, and database backup verification before public launch.
- Run migrations as a reviewed release step and keep a rollback plan (application rollback plus forward-fix/restore procedure for schema changes).
- Load-test catalogue/API and playback with an expected concurrency profile before launch. Do not treat app-server capacity as video-delivery capacity; video is served by the PC-hosted Media Core.
- Review `npm audit` findings and upgrade dependencies deliberately; validate major upgrades against a test database.

## Implementation status

Implemented in this foundation: branded responsive catalogue, fictional preview data, published-only detail/catalogue reads from PostgreSQL when configured, query-based browse filters, validated paginated catalogue JSON API, email/password registration and sign-in, Google/Apple/Discord OAuth sign-in, Twilio Verify phone sign-in, one-time admin bootstrap script, guarded studio dashboard and film draft/list APIs, direct browser uploads with resumable TUS for large films, Media Core processing status checks, audit records, and access/catalogue/security checks. Provider setup and callback instructions are in `docs/authentication.md`.

Still required before launch: provision hosted PostgreSQL for Vercel, make the PC-hosted Core securely reachable over HTTPS, configure the exact upload CORS origins and production secrets, verify migrations and upload/playback flows in staging, configure OAuth and Twilio callbacks, complete payment verification/entitlement checks and signed premium playback tokens, replace process-local rate limiting with a shared service, and add monitoring/backups. No production launch or payment processing is claimed as complete.

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Educational titles for children and families
Studio drafts can include an optional minimum age recommendation, learning objectives, and an optional parent/caregiver note. These are editorial metadata—not official age ratings, legal classifications, or safety certifications. Example: the fictional **Count with Milo** preview demonstrates a short counting lesson; it has no playable video attached.

Apply the additive educational metadata migration before using these fields: `npm run prisma:migrate` with a configured development PostgreSQL database. The demo seed adds Count with Milo as fictional, free, and non-playable. For editorial review prompts and child-privacy cautions, see `docs/kids-content-editorial-checklist.md`.

This project is not yet a legally reviewed child-directed service. Do not collect personal information from children or launch child accounts, behavioral advertising, or tracking until applicable privacy rules, parental consent, analytics/cookie behavior, and jurisdiction-specific requirements have been reviewed with qualified counsel.
