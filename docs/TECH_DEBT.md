# Tech Debt + TODOs

This page is a **thin index** into GitHub Issues. The substantive tracking lives there per [`GITHUB_TRACKING.md`](./GITHUB_TRACKING.md) ("GitHub Issues is the source of truth for execution tracking"). Items here that are not links to issues are intentionally documentation-only — micro cleanups, design rationale, or gotchas that wouldn't be worth a standalone issue.

## Open issues by priority

### Security / privacy (must be resolved before public launch)

- [#49](https://github.com/igortsives/togetherly/issues/49) — Push family-ownership check into refreshSource() *(P2)*
- [#77](https://github.com/igortsives/togetherly/issues/77) — Apple sign-in lacks explicit gate in signIn callback *(P2)*

### Source refresh + change alerts (post-PR #36 follow-ups)

- [#50](https://github.com/igortsives/togetherly/issues/50) — Provider webhooks for near-real-time Google + Outlook change detection *(P2)*
- [#56](https://github.com/igortsives/togetherly/issues/56) — Use syncToken / delta for incremental Google + Outlook sync *(P2)*

### Product follow-ups for Private Beta launch

- [#44](https://github.com/igortsives/togetherly/issues/44) — Bulk-confirm high-confidence candidates in review queue *(P1)*
- [#46](https://github.com/igortsives/togetherly/issues/46) — In-product beta feedback capture *(P1)*

### Process / tooling

- [#47](https://github.com/igortsives/togetherly/issues/47) — GitHub Actions workflow for lint/typecheck/test/build *(P1, Private Beta)*
- [#52](https://github.com/igortsives/togetherly/issues/52) — LLM-assisted extraction for ambiguous HTML/PDF events *(P2)*
- [#53](https://github.com/igortsives/togetherly/issues/53) — Add Playwright E2E test setup *(P2)*

### Partial / continuing work

- [#19](https://github.com/igortsives/togetherly/issues/19) — Parser corpus fixtures for UCLA, Vanderbilt, and Saratoga/LGSUHSD *(Saratoga capture still deferred — see PR #28)*
- [#11](https://github.com/igortsives/togetherly/issues/11) — Parser corpus research follow-up
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
- ~~In-product OAuth disconnect~~ — closes [#42](https://github.com/igortsives/togetherly/issues/42); [`lib/sources/disconnect.ts`](../lib/sources/disconnect.ts) (`disconnectProviderForFamily`) revokes with the provider best-effort, deletes the `Account` row, and marks every `CalendarSource` of the matching type for the family `FAILED`. UI lives in the dashboard Google/Outlook panels behind a `<details>` confirmation.
- ~~In-product account deletion~~ — closes [#43](https://github.com/igortsives/togetherly/issues/43); `/account` page surfaces a confirmation-by-email form; `deleteUserAccount` in [`lib/family/account-deletion.ts`](../lib/family/account-deletion.ts) revokes OAuth tokens, deletes the `User` row (Postgres cascades to everything family-scoped), then best-effort unlinks PDF blobs. Optional data-export courtesy is filed as a follow-up.
- ~~Microsoft account-linking residual~~ — closes [#76](https://github.com/igortsives/togetherly/issues/76); `allowDangerousEmailAccountLinking: true` removed from the Microsoft Entra ID provider config. Cross-provider linking now happens only via the in-product "Connect Microsoft" flow on the dashboard, which uses the existing session and can't be triggered by an attacker controlling a matching-email MSA.
- ~~Credentials login timing channel~~ — closes [#86](https://github.com/igortsives/togetherly/issues/86); `authorize` always runs `bcrypt.compare` (against `TIMING_DUMMY_HASH` when the email is unregistered) so the "no such email" and "wrong password" paths have the same wall-clock cost. Dummy hash precomputed at module load (~250ms cold-start cost per process).
- ~~Test-infra debt sweep~~ — closes [#78](https://github.com/igortsives/togetherly/issues/78), [#80](https://github.com/igortsives/togetherly/issues/80), [#92](https://github.com/igortsives/togetherly/issues/92), [#104](https://github.com/igortsives/togetherly/issues/104). The auth `signIn`/`redirect` callbacks and the Credentials `authorize` body are extracted to [`lib/auth/callbacks.ts`](../lib/auth/callbacks.ts) with full unit coverage. Action-level tests added for `bulkConfirmCandidatesAction` (cross-family scoping + eligibility filter) and `submitBetaFeedbackAction` (auth gate + redirect sanitization + insert payload). Route-handler tests added for `/api/internal/refresh-sources` (503/401/200 paths). Stray `vi.clearAllMocks()` swapped to `vi.resetAllMocks()`.
- ~~Microsoft on /login + AuthProvider enum~~ — closes [#48](https://github.com/igortsives/togetherly/issues/48); migration `20260516040000_auth_provider_microsoft` adds `MICROSOFT` to the `AuthProvider` enum, `mapAuthProvider` maps `microsoft-entra-id → AuthProvider.MICROSOFT`, and `/login` surfaces a "Continue with Microsoft" button when `MICROSOFT_CLIENT_ID/SECRET` are configured.
- ~~Source provenance on timeline~~ — closes [#51](https://github.com/igortsives/togetherly/issues/51); `TimelineBlock` now carries `calendarName` + `sourceLabel`, derived in `getTimelineData` from the candidate→source relation. The `Timeline` component's tooltip surfaces the originating calendar + provider on every block. Side-panel drilldown deferred as a follow-up.
- ~~Export free windows to Google / Outlook~~ — closes [#45](https://github.com/igortsives/togetherly/issues/45); [`lib/sources/export.ts`](../lib/sources/export.ts) wraps Google `calendar.v3/events` and Microsoft Graph `/me/events` with all-day exclusive-end semantics. Server actions `exportFreeWindowToGoogleAction` / `exportFreeWindowToOutlookAction` enforce family scope, post the event, and flip `FreeWindowResult.saved = true`. The `/windows` page surfaces "Add to Google" / "Add to Outlook" buttons gated on linked providers. Scope upgrade in `auth.ts` (Google: `+calendar.events`; Microsoft: `Calendars.Read → Calendars.ReadWrite`) requires existing users to re-link.
- ~~CI workflow hardening~~ — closes [#81](https://github.com/igortsives/togetherly/issues/81); `.nvmrc` (Node 22) added so local dev matches CI; `.github/workflows/ci.yml` gains `concurrency` (cancels duplicate in-progress runs), `permissions: contents: read` (least privilege), and `timeout-minutes: 15`. Node version is now read from `.nvmrc` instead of pinned inline.
- ~~Vercel Cron registration~~ — closes [#101](https://github.com/igortsives/togetherly/issues/101); `vercel.json` adds a daily 04:00 UTC cron firing `/api/internal/refresh-sources`. The route handler accepts either `CRON_SECRET` (auto-set by Vercel) or `SCHEDULER_SECRET` (legacy local-dev name) for backwards compat.
- ~~Per-source scheduler backoff~~ — closes [#100](https://github.com/igortsives/togetherly/issues/100); `CalendarSource.failedAttempts INT` added (migration `20260516050000_source_failed_attempts`); `refreshSource` increments on failure, resets to 0 on success; the scheduler skips sources where `failedAttempts >= MAX_FAILED_ATTEMPTS = 10`. Manual refresh still works and clears the counter on next success.
- ~~Widen Microsoft dead-grant detection~~ — closes [#95](https://github.com/igortsives/togetherly/issues/95); `isInvalidGrant` in [`lib/sources/microsoft.ts`](../lib/sources/microsoft.ts) now matches `interaction_required` / `consent_required` plus `error_codes` containing `70008`, `50173`, or `700082` — all paths that surface "refresh token dead, re-link required."
- ~~Launch readiness checklist~~ — closes [#15](https://github.com/igortsives/togetherly/issues/15); [`docs/LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md) lays out the explicit out-of-scope items, the minimum parser/source coverage required to invite a family, the accuracy + review requirements, the support policy for failed sources, and a pre-launch ops checklist. Reviewed before each cohort expansion.
