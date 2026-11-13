# NEY ANIMATE software test report

**Date:** 2026-10-24  
**Scope:** Local project quality checks, Prisma schema/database connectivity, production compilation, and available automated tests.  
**Environment:** Windows PowerShell, Node.js 24.12.0, Next.js 16.4.0, Prisma CLI 6.19.3.

## Summary

The source compiles and passes lint and TypeScript checks. The Prisma schema validates. Database connectivity is the main blocker: `.env` points to PostgreSQL on `localhost:5433`, but Prisma cannot reach a server there. The PostgreSQL Windows service reports `Running`, while no listener was visible on ports 5432, 5433, or 5434 in this test environment.

The production build compiles successfully, then fails while prerendering `/` because that page queries the configured database. The automated suite reports 22 passing and 11 failing tests; the failures depend on the unreachable database. No application credentials or secret values are included in this report.

## Checks and results

| Check | Result | Evidence |
| --- | --- | --- |
| `npm.cmd run lint` | PASS | ESLint exited with code 0. |
| `npm.cmd run typecheck` | PASS | `tsc --noEmit` exited with code 0. |
| `npm.cmd exec prisma validate` | PASS | Prisma schema is valid. |
| `npm.cmd exec prisma migrate status` | BLOCKED | Prisma P1001: cannot reach PostgreSQL at `localhost:5433`. Migration state could not be confirmed. |
| `npm.cmd run test` | BLOCKED before tests | `tsx` initialization failed because Node's `os.userInfo()` returned `uv_os_get_passwd` / `ENOMEM`. |
| `npm.cmd run test` with a temporary process-only `os.userInfo()` shim | PARTIAL: 22 passed, 11 failed | Shim let `tsx` start. Database-backed auth, database, publishing, and webhook tests failed because PostgreSQL was unreachable. Non-database access, security, catalogue, playback, and upload utility tests passed. The shim was removed after the run and no project source was changed for it. |
| `npm.cmd run build` | FAIL during prerender | Next.js compiled and finished TypeScript, then `/` prerender failed at `src/lib/catalogue.ts` because Prisma could not reach `localhost:5433`. |
| Dev-server smoke test | NOT RUN | No Node dev-server process or listener on ports 3000/3001 was visible during inspection. |
| Live Media Core/OAuth/phone-provider checks | NOT RUN | External provider connectivity and account credentials cannot be validated by the local automated suite. |

## Required follow-up

1. **Restore PostgreSQL connectivity.** Confirm which port the running PostgreSQL service actually listens on. Then either configure PostgreSQL to listen on 5433 or update the local `DATABASE_URL` to the actual port. Keep the value private. Re-run `npm.cmd exec prisma migrate status` and ensure the development migrations are applied before rerunning database tests.
2. **Choose a build strategy for database-backed pages.** The homepage queries PostgreSQL during static prerender. For builds that run without a database, change the database-backed page to render at request time; otherwise, make a migrated database reachable from the build environment. A successful build alone will not prove runtime database connectivity.
3. **Re-run the checks after PostgreSQL is available.** Run `npm.cmd run test`, `npm.cmd exec prisma migrate status`, and `npm.cmd run build`. Confirm all database-backed tests pass and the build completes.
4. **Verify external integrations in staging.** Exercise Media Core upload and status processing, OAuth callbacks, and Twilio Verify with staging credentials and callback URLs. The current report does not establish those providers are configured correctly.

## Interpretation

The failing checks point to an unavailable database endpoint, not a TypeScript or lint defect. The service status alone does not prove PostgreSQL is accepting TCP connections on the configured port. After correcting the port/listener, re-run the tests before deciding whether the code itself needs database-related changes. The homepage's build-time database query remains a deployment decision: either the build needs database access or the route needs request-time rendering.
