# Tech Debt + TODOs

This page is a **thin index** into GitHub Issues. The substantive tracking lives there per [`GITHUB_TRACKING.md`](./GITHUB_TRACKING.md) ("GitHub Issues is the source of truth for execution tracking"). Items here that are not links to issues are intentionally documentation-only — micro cleanups, design rationale, or gotchas that wouldn't be worth a standalone issue.

## Open issues by priority

### Security / privacy (must be resolved before public launch)

- [#42](https://github.com/igortsives/togetherly/issues/42) — In-product OAuth disconnect for Google and Microsoft *(P1, Private Beta)*
- [#43](https://github.com/igortsives/togetherly/issues/43) — In-product account deletion flow *(P1, Private Beta)*
- [#49](https://github.com/igortsives/togetherly/issues/49) — Push family-ownership check into refreshSource() *(P2)*
- [#76](https://github.com/igortsives/togetherly/issues/76) — Microsoft account-linking takeover residual on `common/v2.0` issuer *(P1, Private Beta)*
- [#77](https://github.com/igortsives/togetherly/issues/77) — Apple sign-in lacks explicit gate in signIn callback *(P2)*

### Source refresh + change alerts (post-PR #36 follow-ups)

- [#50](https://github.com/igortsives/togetherly/issues/50) — Provider webhooks for near-real-time Google + Outlook change detection *(P2)*
- [#56](https://github.com/igortsives/togetherly/issues/56) — Use syncToken / delta for incremental Google + Outlook sync *(P2)*

### Product follow-ups for Private Beta launch

- [#44](https://github.com/igortsives/togetherly/issues/44) — Bulk-confirm high-confidence candidates in review queue *(P1)*
- [#45](https://github.com/igortsives/togetherly/issues/45) — Export selected free windows to Google or Outlook Calendar *(P1)*
- [#46](https://github.com/igortsives/togetherly/issues/46) — In-product beta feedback capture *(P1)*
- [#51](https://github.com/igortsives/togetherly/issues/51) — Surface source provenance in the dashboard *(P2)*

### Process / tooling

- [#47](https://github.com/igortsives/togetherly/issues/47) — GitHub Actions workflow for lint/typecheck/test/build *(P1, Private Beta)*
- [#48](https://github.com/igortsives/togetherly/issues/48) — Add MICROSOFT to AuthProvider enum and surface on /login *(P2)*
- [#52](https://github.com/igortsives/togetherly/issues/52) — LLM-assisted extraction for ambiguous HTML/PDF events *(P2)*
- [#53](https://github.com/igortsives/togetherly/issues/53) — Add Playwright E2E test setup *(P2)*

### Partial / continuing work

- [#19](https://github.com/igortsives/togetherly/issues/19) — Parser corpus fixtures for UCLA, Vanderbilt, and Saratoga/LGSUHSD *(Saratoga capture still deferred — see PR #28)*
- [#11](https://github.com/igortsives/togetherly/issues/11) — Parser corpus research follow-up
- [#15](https://github.com/igortsives/togetherly/issues/15) — MVP launch readiness checklist
- [#32](https://github.com/igortsives/togetherly/issues/32) — Stitch design integration

## Documentation-only items (intentionally not filed as issues)

These are gotchas, design rationale, or micro-cleanups too small to be worth a tracking issue. They live here so they aren't lost.

### Seed-after-migration gotcha

If you migrate the auth schema (from before PR #31) onto a database that already had the seeded `beta-parent@togetherly.local` user, the new `passwordHash` column is **null** for that existing row. Credentials sign-in then fails with `CredentialsSignin` until you re-run `npm run prisma:seed`, which upserts the bcrypt hash. The seed is safe to re-run.

Captured in [`docs/ENGINEERING_SETUP.md`](./ENGINEERING_SETUP.md#seed-after-migration-gotcha). Doesn't need an action — just a note.

### Vitest `server.deps.inline` workaround

[`vitest.config.ts`](../vitest.config.ts) declares `server.deps.inline: ["next-auth", "@auth/core", "@auth/prisma-adapter"]`. Without this, `next-auth/lib/env.js` fails to resolve `next/server` under the jsdom environment because vitest's resolver doesn't synthesize the `.js` extension. Re-evaluate when next-auth v5 ships stable — but until that happens, no action is required.

### `lib/family/dashboard.ts` vs `lib/family/session.ts` split

The split exists specifically so `dashboard.test.ts` can run without dragging the next-auth import chain through vitest. Documented in [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md#authentication). The convention is "pure helpers in `dashboard.ts`, auth-coupled wrappers in `session.ts`" — cosmetic, but worth knowing before reorganising.

### `Account` table has columns we don't query on

The NextAuth Prisma-adapter standard schema includes `token_type`, `scope`, `id_token`, and `session_state`. We read `access_token`, `refresh_token`, `expires_at`, and (in the refresh path) `scope` + `token_type`. Trimming the unused columns would require a custom adapter; not worth it for the savings.

### Calendar timezone fallback chain edge case

Google/Microsoft ingest mapping falls back through `event.start.timeZone → calendar.timezone → family.timezone`. ICS extractor uses the `defaultTimezone` argument. HTML/PDF extractors use the calendar's timezone. There's a theoretical edge case where a calendar imports events from a wildly different timezone than the family timezone and surfaces incorrectly on the dashboard timeline. No bug has been reported — speculative.

### No window control in the UI

Sync windows are hard-coded to 30 days back / 365 days forward in each `*-ingest.ts`. Users can't widen or shorten. A settings panel for per-source overrides is implied by [#40](https://github.com/igortsives/togetherly/issues/40) and [#56](https://github.com/igortsives/togetherly/issues/56); will get exposed when those land.

## Resolved (kept for context)

- ~~Rename `middleware.ts` to `proxy.ts` (Next 16 deprecation)~~ — closes [#39](https://github.com/igortsives/togetherly/issues/39); the file convention is the only change, matcher syntax is unchanged.
- ~~Demo-family seam removal~~ — PR #31 (`ensureDemoFamily` replaced with `requireUserFamily`).
- ~~Encrypt OAuth access/refresh tokens at rest~~ — closes [#37](https://github.com/igortsives/togetherly/issues/37); AES-256-GCM via Prisma `$extends` in [`lib/db/prisma.ts`](../lib/db/prisma.ts), legacy plaintext rolls forward on refresh.
- ~~Provider response bodies leaking into thrown errors / UI~~ — closes [#67](https://github.com/igortsives/togetherly/issues/67); scrubbed in both Google and Microsoft clients.
- ~~Validate `OAUTH_TOKEN_ENCRYPTION_KEY` strength at startup~~ — closes [#70](https://github.com/igortsives/togetherly/issues/70); [`lib/auth/oauth-tokens.ts`](../lib/auth/oauth-tokens.ts) now requires the env var to base64-decode to at least 32 bytes and throws `OAuthTokenKeyError` otherwise. The previous SHA-256 fallback that masked weak inputs has been removed.
- ~~UCLA + Vanderbilt fixtures synthetic~~ — PR #28 (live captures). Saratoga remains via [#19](https://github.com/igortsives/togetherly/issues/19).
- ~~ICS extractor pinned to system local time for all-day events~~ — PR #22 UTC-anchored all-day dates.
- ~~HTML and PDF extractor tests pinned to synthetic fixture dates~~ — PR #30 merge realigned expectations against the live captures from #28.
- ~~Source-creation extractor was the only path~~ — PR #36 added the dispatcher + manual Refresh button. Scheduler is now [#40](https://github.com/igortsives/togetherly/issues/40).
- ~~In-product source removal~~ — PR #36 added the Remove button.
- ~~`pill-busy-busy` reused for FAILED chip~~ — PR #36 fixup added `pill-failed`.
- ~~Pipe-joined sort key in `hashCandidateSet`~~ — PR #36 fixup switched to JSON-tuple.
- ~~Mid-flight refresh wiping the PENDING queue~~ — PR #36 fixup wrapped delete+create+update in `$transaction`.
- ~~Destructive refresh silently reporting OK~~ — PR #36 fixup tightened `resolveRefreshStatus`.
- ~~`pdf-parse` loaded via `createRequire` indirection~~ — closes [#55](https://github.com/igortsives/togetherly/issues/55); replaced with a direct `import pdfParseModule from "pdf-parse"` plus a small CJS-default unwrap in [`lib/sources/pdf-ingest.ts`](../lib/sources/pdf-ingest.ts), with an ambient module shim in [`types/pdf-parse.d.ts`](../types/pdf-parse.d.ts).
- ~~`package.json#prisma` config block triggers Prisma 6 deprecation warning~~ — closes [#54](https://github.com/igortsives/togetherly/issues/54); seed config now lives in [`prisma.config.ts`](../prisma.config.ts) (`migrations.seed`), ready for Prisma 7.
- ~~Harden OAuth account linking before public launch~~ — closes [#38](https://github.com/igortsives/togetherly/issues/38); [`auth.ts`](../auth.ts) now has a `signIn` callback that rejects Google sign-ins where `profile.email_verified !== true`, closing the account-linking takeover path while keeping `allowDangerousEmailAccountLinking` for the legitimate cross-provider linking flow. Microsoft Entra ID has no equivalent per-claim flag but verifies email at the tenant level.
- ~~Restrict OAuth callbackUrl and post-action redirects to same-origin~~ — closes [#63](https://github.com/igortsives/togetherly/issues/63); [`lib/auth/redirects.ts`](../lib/auth/redirects.ts) supplies `sanitizeRedirectPath` (allowlist: `/`, `/review`, `/windows`, `/feedback`) and `isSameOriginUrl`, wired into the NextAuth `redirect` callback, the login page's `callbackUrl`, and `submitBetaFeedbackAction`'s `route` input.
- ~~Fix account enumeration on /register~~ — closes [#62](https://github.com/igortsives/togetherly/issues/62); [`app/register/actions.ts`](../app/register/actions.ts) now always bcrypt-hashes the password and attempts the INSERT, silently swallowing `P2002` so a new and an existing email produce byte-identical redirects to `/login?registered=1`.
- ~~Rate-limit Credentials sign-in~~ — closes [#64](https://github.com/igortsives/togetherly/issues/64); [`lib/auth/rate-limit.ts`](../lib/auth/rate-limit.ts) tracks failed attempts per `email:<addr>` and `ip:<addr>` in a `SignInAttempt` table; `authorize` returns `null` on limit-exceeded (5 per email, 20 per IP per 15 min). Per-key pruning runs inline; periodic global cleanup of orphan rows is tracked in [#88](https://github.com/igortsives/togetherly/issues/88).
- ~~Unique constraint on Family.ownerId~~ — closes [#65](https://github.com/igortsives/togetherly/issues/65); migration `20260515234500_family_owner_unique` adds `@unique([ownerId])` after deduping any existing extra rows; `resolveFamilyForUser` in [`lib/family/dashboard.ts`](../lib/family/dashboard.ts) now catches `P2002` from a racing concurrent create and re-reads the winning row.
- ~~Serialize OAuth token refresh per Account~~ — closes [#66](https://github.com/igortsives/togetherly/issues/66); [`lib/db/locks.ts`](../lib/db/locks.ts) exposes `withAccountLock` (Postgres advisory lock keyed by accountId), used by `ensureGoogleAccessToken` and `ensureMicrosoftAccessToken` with a double-checked re-read inside the lock. `invalid_grant` responses null out `Account.refresh_token` so the next call surfaces "re-link your account" instead of grinding.
- ~~Background scheduler for source refresh~~ — closes [#40](https://github.com/igortsives/togetherly/issues/40); [`lib/sources/scheduler.ts`](../lib/sources/scheduler.ts) implements `refreshAllStaleSources`, [`app/api/internal/refresh-sources/route.ts`](../app/api/internal/refresh-sources/route.ts) is the scheduler-facing endpoint (Bearer-secret), and `refreshSource` now wraps in a per-source advisory lock (`withSourceLock`). Backoff for repeatedly-failing sources and the `vercel.json` cron registration are tracked as follow-ups.
- ~~Invalidate saved free-window results when underlying sources change~~ — closes [#41](https://github.com/igortsives/togetherly/issues/41); `refreshSource` now sets `FreeWindowSearch.stale = true` on every search for the affected family when a candidate-set change is detected, and the `/windows` page surfaces a "re-run to refresh" banner. Date-overlap refinement is tracked as a follow-up.
