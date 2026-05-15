# Tech Debt + TODOs

This page is a **thin index** into GitHub Issues. The substantive tracking lives there per [`GITHUB_TRACKING.md`](./GITHUB_TRACKING.md) ("GitHub Issues is the source of truth for execution tracking"). Items here that are not links to issues are intentionally documentation-only — micro cleanups, design rationale, or gotchas that wouldn't be worth a standalone issue.

## Open issues by priority

### Security / privacy (must be resolved before public launch)

- [#38](https://github.com/igortsives/togetherly/issues/38) — Harden OAuth account linking before public launch *(P0, Private Beta)*
- [#42](https://github.com/igortsives/togetherly/issues/42) — In-product OAuth disconnect for Google and Microsoft *(P1, Private Beta)*
- [#43](https://github.com/igortsives/togetherly/issues/43) — In-product account deletion flow *(P1, Private Beta)*
- [#49](https://github.com/igortsives/togetherly/issues/49) — Push family-ownership check into refreshSource() *(P2)*
- [#62](https://github.com/igortsives/togetherly/issues/62) — Fix account enumeration on /register *(P1, Private Beta)*
- [#63](https://github.com/igortsives/togetherly/issues/63) — Restrict OAuth callbackUrl and post-action redirects to same-origin *(P1, Private Beta)*
- [#64](https://github.com/igortsives/togetherly/issues/64) — Add rate limiting on Credentials sign-in *(P1, Private Beta)*
- [#65](https://github.com/igortsives/togetherly/issues/65) — Unique constraint on Family.ownerId to prevent duplicate-family race *(P2)*
- [#66](https://github.com/igortsives/togetherly/issues/66) — Serialize OAuth token refresh per Account *(P2)*

### Source refresh + change alerts (post-PR #36 follow-ups)

- [#40](https://github.com/igortsives/togetherly/issues/40) — Background scheduler for source refresh *(P1, Private Beta)*
- [#41](https://github.com/igortsives/togetherly/issues/41) — Invalidate saved free-window results when underlying sources change *(P1, Private Beta)*
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
- [#54](https://github.com/igortsives/togetherly/issues/54) — Migrate package.json#prisma config to prisma.config.ts before Prisma 7 *(P2)*
- [#55](https://github.com/igortsives/togetherly/issues/55) — Replace pdf-parse createRequire indirection with a direct import *(P2)*

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
