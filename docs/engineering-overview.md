# NEY ANIMATE Engineering Overview

This document describes the current implementation for engineers onboarding to NEY ANIMATE. It is based on the application and Prisma schema in this repository. It is not a production-readiness certification.

## Product and runtime

NEY ANIMATE is a Next.js App Router application for browsing a film catalogue, signing in, and managing catalogue entries through a protected studio. The application uses TypeScript, React 19, Next.js 16, Tailwind CSS 4, Prisma 6, and PostgreSQL. NEY Media Core is the only supported video host. Fictional sample catalogue items are available for local preview without a configured database; they are explicitly demo-only and do not contain playable feature video.

The application is organized as a single Next.js deployment. Route handlers perform server-side validation and authorization; server components render pages; client components handle interactive forms and upload experiences. PostgreSQL is the durable application store. Redis may be used for shared rate limiting, and email, OAuth, Twilio Verify, and NEY Media Core are external integrations.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/app/` | App Router pages and HTTP route handlers |
| `src/app/api/` | Authentication, catalogue, playback, studio, health, and readiness endpoints |
| `src/components/` | Shared site shell, ambient video, and sign-in UI |
| `src/lib/` | Database access, sessions, catalogue, authorization, validation, integrations, playback policy, and rate limiting |
| `prisma/schema.prisma` | Relational data model and enums |
| `prisma/migrations/` | Ordered PostgreSQL schema migrations |
| `prisma/seed.ts` | Fictional demo catalogue seed data |
| `scripts/bootstrap-admin.ts` | One-time initial administrator creation |
| `docs/` | Operational and editorial documentation |
| `public/videos/` | Optional local ambient background clips; not catalogue feature assets |

## Request and data flow

### Public catalogue

The homepage and film pages use the catalogue layer. `GET /api/films` validates filter and pagination inputs with Zod, then requests published films. When the database is configured, catalogue records come from PostgreSQL; otherwise the read-only fictional demo catalogue is used. Public reads must continue to exclude drafts. API responses are marked `no-store` so catalogue and access decisions are not accidentally cached across users or publication changes.

### Authentication and authorization

The `User` table supports viewer, editor, and administrator roles, active/disabled status, optional password credentials, verified email/phone fields, and linked OAuth identities. Passwords are bcrypt-hashed in the auth handlers. A session uses a cryptographically random opaque token; only its SHA-256 hash is stored in PostgreSQL. The browser cookie is HttpOnly, SameSite=Lax, scoped to `/`, and Secure in production. Sessions expire after seven days. Protected handlers must resolve the current active user on the server and enforce the role required for the operation. Studio pages and every film-management or video-upload API are administrator-only; editor and viewer accounts cannot access them.

State-changing authenticated requests also use same-origin checks where applicable. Login, registration, password reset, OAuth callback, and Twilio Verify flows are implemented in dedicated routes. Provider credentials and callback URLs are environment-specific and must be configured in the provider consoles and deployment secret store.

### Studio and publishing

The studio is the editorial surface for creating and editing film drafts, uploading feature or trailer assets, polling processing state, and publishing a film. Studio routes require an administrator account and record audit events. Publishing is a server-side transition: demo films and films without a verified ready feature asset are rejected. Review the publish route before changing this invariant.

The server creates a Media Core asset and issues a short-lived, asset-scoped upload grant. The browser sends resumable chunks directly to Media Core, and the application polls status through its server-side service client. The permanent tenant key never reaches the browser.

### Playback and access

Only published films are public. Free playback requires a Media Core feature asset confirmed ready and uses a same-origin HLS proxy with a short-lived HttpOnly playback cookie. Premium access is intentionally denied: payment verification, entitlement enforcement, and signed playback token issuance are not implemented. Database models for payment, subscription, and entitlement are scaffolding and do not grant access by themselves.

### Persistence and rate limiting

Prisma models users, sessions, films, video assets, historical webhook events, audit logs, playback sessions, watch progress, and future payment/entitlement data. Playback analytics begins after the analytics migration and cannot be backfilled from older records. Apply schema changes through a reviewed migration; do not run seed or migration commands against production casually. The rate limiter prefers Redis when `REDIS_URL` is configured, otherwise uses the PostgreSQL `RateLimit` table when a database is configured. It uses an in-memory fallback only outside production. In production, a missing or failed shared store fails closed. Configure proxy trust deliberately: forwarded IP headers are ignored unless `TRUST_PROXY=true` or `TRUSTED_PROXIES` is configured.

## HTTP surface

| Route | Purpose |
| --- | --- |
| `/` | Catalogue landing page |
| `/films` and `/films/[slug]` | Browse and view published titles |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Account entry and recovery flows |
| `/studio` | Admin-only protected editorial workspace |
| `/studio/analytics` | Admin-only viewer CRM and near-real-time platform metrics |
| `/api/films` and `/api/films/[slug]` | Published catalogue reads |
| `/api/films/[slug]/playback` | Server-side playback eligibility and embed details |
| `/api/analytics/playback-session` | Same-origin Media Core player heartbeat and bounded watch-time recording |
| `/api/studio/analytics` | Admin-only analytics snapshot API |
| `/api/auth/*` | Password, OAuth, phone verification, session, and recovery handlers |
| `/api/studio/films/*` | Draft management and publishing |
| `/api/studio/videos/*` | Media Core upload authorization and processing status |
| `/api/health` | Lightweight process liveness response |
| `/api/ready` | Database and rate-limiter readiness checks |

## Local development

Requirements are Node.js 20.9 or newer and npm. PostgreSQL is optional for a read-only catalogue preview, but required for persistent accounts, studio writes, and database-backed rate limiting. On Windows PowerShell, use `npm.cmd` if the execution policy blocks `npm.ps1`.

```powershell
Copy-Item .env.example .env
# Set DATABASE_URL to a local development PostgreSQL database before using DB-backed features.
npm.cmd install
npm.cmd run prisma:generate
npm.cmd run prisma:migrate
npm.cmd run prisma:seed
npm.cmd run dev
```

Visit `http://localhost:3000`. If port 3000 is occupied, Next.js may select another port. Check the startup output and use its printed URL. `/api/health` checks process responsiveness; `/api/ready` checks database and limiter readiness and can return 503 when dependencies are not configured. Never put real credentials in source control or documentation. `.env` is intended to remain local and ignored.

Useful scripts are `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`. Run migrations and integration workflows only against a disposable development database unless a reviewed operational plan explicitly targets another environment.

## Configuration and integrations

Configuration is documented in `.env.example`. Important groups:

- PostgreSQL: `DATABASE_URL`.
- Canonical application origin: `NEXT_PUBLIC_APP_URL`.
- NEY Media Core: service URL, server-only tenant key, upload grant secret, and exact browser upload-origin allowlist.
- Shared rate limit storage: optional `REDIS_URL`; PostgreSQL is the fallback durable store.
- Password recovery email: SMTP host, port, user, password, sender, and token expiry.
- Social login: provider credentials for Google, Discord, and Apple.
- Phone verification: Twilio account and Verify service credentials.
- Proxy IP handling: `TRUST_PROXY` or `TRUSTED_PROXIES`; trust only known proxy infrastructure.

Do not use placeholder values as production configuration. Validate callback URLs, Media Core upload CORS and resumable upload behavior, SMTP delivery, and rate-limit behavior in staging before launch.

## Security and privacy invariants

- Public catalogue queries return published entries only.
- Passwords are hashed; session tokens are random, stored hashed, and delivered in HttpOnly cookies.
- Studio role checks, same-origin checks, and audit logging are server-side responsibilities.
- Publishing requires a non-demo record and a verified ready feature asset.
- Media Core service credentials remain server-only; browser uploads use short-lived asset-scoped grants.
- Production rate limiting fails closed when its shared backend is unavailable.
- Premium playback is disabled until payment verification and entitlement checks exist.
- Demo titles and ambient background clips are not licensed film assets and must not be represented as actual productions.
- The product is not a legally reviewed child-directed service. Do not collect child personal information or launch child accounts, behavioral ads, or tracking before privacy, parental-consent, and jurisdictional requirements are reviewed by qualified counsel.

Review `next.config.ts` when adding third-party scripts, image hosts, iframe providers, or browser connections because the Content Security Policy and other response headers are defined there.

## Operational gaps before public launch

1. Configure and verify PostgreSQL, backups, migrations, and restore procedures in staging.
2. Configure OAuth, Twilio Verify, SMTP, and Media Core credentials and validate upload, processing, publishing, and playback in staging.
3. Complete payment-provider verification, entitlement policy, signed premium playback, and corresponding tests before enabling paid access.
4. Keep a shared rate limiter configured and monitor its failure behavior under production-like load.
5. Add production monitoring, privacy-minimizing logs, alerting, and a documented incident/restore procedure.
6. Review CSP and deployment headers against the exact production domains and provider requirements.
7. Complete child privacy and legal review before positioning the product as a child-directed service.

## Current local status

At the time this document was written, the existing development server responded successfully at `http://localhost:3000`; `GET /api/health` returned HTTP 200. The launch blockers above remain open until their dependencies and workflows are configured and verified in staging.
