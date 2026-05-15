# Tech Debt + TODOs

A consolidated list of known debt, gotchas, and follow-ups that aren't already open GitHub issues. Items already tracked as GitHub issues are pointed at from [`ROADMAP.md`](./ROADMAP.md) instead.

Each item links to the PR that introduced it (or the file where the debt lives) and is grouped by priority.

## High Priority

### OAuth tokens stored as plaintext columns

- **Where:** `Account.access_token` and `Account.refresh_token` columns in `prisma/schema.prisma`. Used by [`lib/sources/google.ts`](../lib/sources/google.ts) and [`lib/sources/microsoft.ts`](../lib/sources/microsoft.ts).
- **State:** No column-level encryption. `OAUTH_TOKEN_ENCRYPTION_KEY` is declared in `.env.example` but unused.
- **Mitigation in place:** Auth.js encrypts session cookies + JWTs using `AUTH_SECRET`. Tokens never cross into client components, API responses, or logs (enforced by code review against [`PRIVACY.md` §6](./PRIVACY.md#6-logging--telemetry-boundary)).
- **Resolution path:** Add a Prisma client-extension that encrypts/decrypts on read/write, or move to pgcrypto column functions. Required before public launch.
- **Refs:** PRs #31, #33, #34. `PRIVACY.md` §1.6 and §3.1.

### `allowDangerousEmailAccountLinking=true` on Google and Microsoft

- **Where:** [`auth.ts`](../auth.ts) provider blocks.
- **State:** Whoever controls the linked-provider account at the matching email can take over the existing Togetherly user.
- **Why we shipped it:** Without it, an existing email/password user trying `signIn("google")` creates an orphan account instead of linking. UX is unacceptable for the calendar-connect flow.
- **Resolution path before public launch:** require fresh re-auth, in-product confirmation, or a verified-email signal before linking.
- **Refs:** PRs #33, #34. `PRIVACY.md` §3.4.

### Saratoga / LGSUHSD parser fixture still synthetic

- **Where:** [`fixtures/sources/html/saratoga-high-2026-2027.html`](../fixtures/sources/html/saratoga-high-2026-2027.html) and the matching `.pdf.txt` + expected-events JSON.
- **State:** UCLA and Vanderbilt fixtures were replaced with live captures in PR #28. Saratoga remained structural because the district had not posted the 2026-27 LGSUHSD PDF and direct WebFetch of the 2025-26 PDF was blocked.
- **Resolution path:** Re-check the SHS calendars page after publication of the 2026-27 PDF; replace fixture + expected-events; close issue [#19](https://github.com/igortsives/togetherly/issues/19).
- **Refs:** PR #28, issue #19 comment.

### `middleware.ts` deprecation in Next 16

- **Where:** [`middleware.ts`](../middleware.ts).
- **State:** Next 16 logs a deprecation warning on dev startup: `The "middleware" file convention is deprecated. Please use "proxy" instead.` The old name still works.
- **Resolution path:** Rename `middleware.ts` → `proxy.ts`; verify route gating behaves identically; check [Next docs](https://nextjs.org/docs/messages/middleware-to-proxy) for any matcher-syntax changes.
- **Refs:** PR #31.

## Medium Priority

### `pdf-parse` loaded via `createRequire` indirection

- **Where:** [`lib/sources/pdf-ingest.ts`](../lib/sources/pdf-ingest.ts).
- **State:** The agent that shipped PR #30 could not run `npm install` in its sandbox, so they avoided having the bundler statically resolve `pdf-parse` by constructing the module spec from a `["pdf","parse"].join("-")` expression with `createRequire(import.meta.url)`. Functional, but it bypasses build-time validation.
- **Resolution path:** Replace with a direct `import` or top-level `require` once the dep is unambiguously in the install tree (which it now is). Verify the production bundle still tree-shakes properly.
- **Refs:** PR #30.

### Microsoft is not in the `AuthProvider` enum

- **Where:** `prisma/schema.prisma` `AuthProvider` enum: `EMAIL | GOOGLE | APPLE`.
- **State:** Microsoft is a linkable provider for Outlook Calendar but cannot be surfaced as a "Sign in with Microsoft" button on `/login` without a schema migration.
- **Resolution path:** If we ever want Microsoft as a top-level sign-in option, add `MICROSOFT` to the enum and update the `mapAuthProvider` switch in `auth.ts`.
- **Refs:** PR #34.

### Seed-after-migration gotcha (documented but easy to trip)

- **Where:** `prisma/seed.mjs`.
- **State:** Running `npx prisma migrate dev` on a database that previously seeded `beta-parent@togetherly.local` adds the `passwordHash` column without populating it. Credentials sign-in then fails with `CredentialsSignin`. Re-running `npm run prisma:seed` fixes it.
- **Mitigation:** Documented in [`ENGINEERING_SETUP.md`](./ENGINEERING_SETUP.md#seed-after-migration-gotcha) and in PR #31's body.
- **Resolution path:** Long-term, a setup script could detect the missing hash and re-seed automatically.
- **Refs:** PR #31.

### Source-creation extractor fires synchronously

- **Where:** [`app/actions.ts`](../app/actions.ts) — every `createXxxSourceAction` calls the matching `refreshXxxSource` inside the request.
- **State:** A slow ICS feed, large PDF, or first-time Google sync blocks the source-creation response. No retry, no queue.
- **Resolution path:** Move to a job queue (BullMQ or similar) once #12 (source refresh + change alerts) lands.
- **Refs:** PRs #22, #29, #30, #33, #34.

### Vitest needs `server.deps.inline` for next-auth

- **Where:** [`vitest.config.ts`](../vitest.config.ts).
- **State:** `server.deps.inline: ["next-auth", "@auth/core", "@auth/prisma-adapter"]` is required because next-auth's `lib/env.js` imports `next/server` without the `.js` extension and vitest's resolver doesn't synthesize it under jsdom.
- **Resolution path:** Re-evaluate when next-auth v5 stable lands; the upstream import is likely to change.
- **Refs:** PR #31.

## Low Priority

### Pure helpers split from auth-coupled code in `lib/family/`

- **Where:** [`lib/family/dashboard.ts`](../lib/family/dashboard.ts) (pure) vs [`lib/family/session.ts`](../lib/family/session.ts) (imports `@/auth`).
- **State:** The split exists specifically so the helper test in `dashboard.test.ts` can run without `server.deps.inline` transformation. Slightly odd file organization for new contributors.
- **Resolution path:** Either keep as-is (the convention is documented in `ARCHITECTURE.md`) or move the auth-coupled wrappers into a shared `lib/auth/` module. Cosmetic.
- **Refs:** PR #31.

### No incremental sync for Google / Outlook

- **Where:** `lib/sources/google-ingest.ts`, `lib/sources/microsoft-ingest.ts`.
- **State:** Every refresh does a full window fetch (30d back / 365d forward). Google supports `syncToken`; Microsoft supports `delta` queries.
- **Resolution path:** Add when #12 source-refresh ships; for the create-only-trigger world we have today, full sync is fine.

### No backfill / window control in the UI

- **Where:** Dashboard import forms.
- **State:** Users can't widen or shorten the sync window. The constants are hard-coded to 30d/365d in each `*-ingest.ts`.
- **Resolution path:** Expose as part of the per-source settings UI once we have one (deferred).

### `Account` table has unique-index columns we don't query on

- **Where:** `prisma/schema.prisma` `Account` model.
- **State:** The NextAuth Prisma-adapter standard schema includes columns we don't read (`token_type`, `scope`, `id_token`, `session_state`). They're harmless but bloat the row.
- **Resolution path:** Consider trimming if we later switch to a custom adapter.

### Confidence heuristics are keyword-only

- **Where:** [`lib/sources/extractors/html.ts`](../lib/sources/extractors/html.ts), [`lib/sources/extractors/pdf.ts`](../lib/sources/extractors/pdf.ts).
- **State:** Classification is `String.prototype.includes` on the title. No fuzzy matching, no LLM assist. Every HTML/PDF candidate ends up under 0.9 so it flows through review (which is the safety net).
- **Resolution path:** LLM-assisted extraction per [`PARSING_STRATEGY.md`](./PARSING_STRATEGY.md) when a real corpus appetite emerges.

### Calendar timezone fallback chain isn't always honored

- **Where:** Google/Microsoft ingest mapping fall back through `event timezone → calendar.timezone → family.timezone`. ICS extractor uses `defaultTimezone` argument. HTML/PDF extractors use the calendar's timezone.
- **State:** Edge case where a calendar imports events from a wildly different timezone than the family timezone may not surface correctly on the timeline.
- **Resolution path:** Tighten when a real timezone-drift bug is reported. Add explicit per-source-event timezone tests.

## Product / UX TODOs (not yet tracked as issues)

- **In-product OAuth disconnect** — today the only way to revoke a linked Google/Microsoft account is operator-side Prisma access.
- **In-product account deletion** — `PRIVACY.md` §4.3 specifies the contract but no UI exists.
- **In-product source-source removal** — a parent can disable a calendar but not delete an imported source row from the dashboard.
- **Source-provenance display** — the review queue shows the evidence text/locator but the dashboard doesn't expose "this calendar was imported from {source}" beyond the small `parserType` chip.
- **Saved windows export to provider calendars** — `EXP-001`/`EXP-002` in PRD §7.8 are P1 and not yet implemented.
- **Bulk-confirm in review queue** — REV-005 is P1; today every candidate is confirmed individually.
- **Beta feedback capture** — listed in `BETA_PLAN.md` but no in-app form exists.

## CI / Tooling TODOs

- **GitHub Actions** — the local validation gate (`lint` + `typecheck` + `test` + `build`) is enforced by convention, not by CI. A workflow that runs the four commands on every PR is a small but important follow-up.
- **Playwright E2E** — not yet wired. Deferred to Phase 3 per `ROADMAP.md`.
- **Prisma config migration** — Prisma 7 will remove the `package.json#prisma` config block. The `npm run prisma:seed` script currently relies on it. Migrate to a `prisma.config.ts` file before the upgrade.

## Resolved items (kept for context)

- ~~Demo-family seam removal~~ — resolved by PR #31 (`ensureDemoFamily` replaced with `requireUserFamily`).
- ~~No OAuth token model in schema~~ — resolved by the NextAuth `Account` table in PR #31; encryption is now a separate (open) item above.
- ~~UCLA + Vanderbilt fixtures synthetic~~ — resolved by PR #28 (live captures); Saratoga remains.
- ~~ICS extractor pinned to system local time for all-day events~~ — resolved in PR #22 by UTC-anchoring all-day dates.
- ~~HTML and PDF extractor tests pinned to synthetic fixture dates~~ — resolved in PR #30's merge commit by realigning expectations against the live captures from #28.
