# Private Beta Launch Readiness Checklist

This document defines the bar for inviting the first cohort of beta families to Togetherly. It complements [`BETA_PLAN.md`](./BETA_PLAN.md) (which sets the *goals* of the beta) and [`MVP_SPEC.md`](./MVP_SPEC.md) (which sets the product *scope*).

Closes [#15](https://github.com/igortsives/togetherly/issues/15).

## Gating decision (2026-05-16)

UAT of the UCLA PDF import surfaced semantic gaps in the calendar ingestion (all-day events rendered as two days, term boundaries not extended into in-session ranges, weekends not carved out, no long-weekend detection, no natural-language search). The beta is **gated on the Intelligent Calendar Redesign (Phase 2.5, Rounds 15-18 + Round 19 UAT)** described in [`ROADMAP.md`](./ROADMAP.md). The operational checklist below remains the bar for invites — but the product must pass UAT (Round 19) first.

## 1. Out Of Scope For The Private Beta

These are explicitly NOT part of the private-beta product and should not be implemented or promised to beta users:

- **Authenticated school-portal scraping.** No Aeries, Infinite Campus, PowerSchool, or Schoology login. Sources must be publicly fetchable URLs / ICS / Google / Outlook calendars or PDFs the parent uploads.
- **Travel booking.** No flight / hotel / car-rental integrations. Free-window matching only.
- **Child accounts.** Children are nicknames inside the parent's account; no separate sign-in, no separate calendar permissions.
- **Messaging / chat.** No in-product communication between family members or with Togetherly support.
- **Guaranteed support for every school's calendar format.** The corpus is finite (see §2). Sources outside the corpus are best-effort with a "review required" fallback.
- **Native mobile app.** Mobile-responsive web only.
- **Public self-serve launch.** Beta is invite-only.
- **Single sign-on for families.** One parent account per household; secondary-parent share is a post-beta concept.
- **LLM-assisted extraction.** Heuristic parsers only for beta (tracked separately in [#52](https://github.com/igortsives/togetherly/issues/52)).
- **Provider webhooks / real-time sync.** Daily scheduled refresh is sufficient (tracked separately in [#50](https://github.com/igortsives/togetherly/issues/50) and [#56](https://github.com/igortsives/togetherly/issues/56)).

If a beta user requests one of these, route the feedback through the existing in-product capture and decline politely.

## 2. Minimum Parser / Source Coverage

A beta family must be able to import at least:

- **Google Calendar**: yes — covered by PR #33; export covered by [#45](https://github.com/igortsives/togetherly/issues/45) (PR #123).
- **Outlook Calendar**: yes — covered by PR #34; export covered by [#45](https://github.com/igortsives/togetherly/issues/45) (PR #123).
- **ICS subscription URL**: yes — covered by PR #22.
- **One supported school HTML calendar**: UCLA, Vanderbilt, and Saratoga / LGSUHSD are the named targets ([#19](https://github.com/igortsives/togetherly/issues/19)). PR #28 captured live fixtures for UCLA and Vanderbilt; **Saratoga / LGSUHSD remains uncaptured at the time of this checklist** — track in [#19](https://github.com/igortsives/togetherly/issues/19). The beta can proceed without Saratoga if every initial cohort family can use one of UCLA / Vanderbilt / ICS / PDF.
- **PDF-upload calendar**: yes — covered by PR #30.

A family without any supported source on this list should be politely deferred from the beta, not invited and then asked to wait.

In addition to format coverage, the **semantic capabilities** added in Phase 2.5 are part of the bar:

- Academic calendars must surface visible `class_in_session` ranges (not just term boundary markers) — verified by importing the UCLA PDF and seeing busy shading across the term (EXT-009).
- Weekends inside in-session ranges must show as free (MAT-010).
- Free-window search must support natural-language input ("a week around Christmas") with an editable parse preview before running (MAT-008).
- The dashboard must show which source contributed each event via the source legend + drilldown (UI-006, UI-007).

The broader corpus research (NYC Public Schools, LAUSD, Fairfax, Stanford, Michigan, TeamSnap ICS, SportsEngine ICS — issue [#11](https://github.com/igortsives/togetherly/issues/11)) is a *post-beta* expansion, not a beta blocker.

## 3. Accuracy + Review Requirements

The PRD's `REV-001`–`REV-004` plus `EXT-007` (evidence locator) define what a parent must see and approve before any imported event affects free-window matching:

- **Every extracted event must land in the review queue** with a confidence score, an evidence locator (URL fragment / PDF page / ICS UID), and a parent-readable explanation of the busy/free decision. Confirmed by the existing `/review` page.
- **High-confidence events from a trusted source type** (`GOOGLE_CALENDAR`, `OUTLOOK_CALENDAR`, `ICS`) can be auto-bulk-confirmed via the dashboard's bulk-confirm button (PR #58, gated on `confidence >= 0.9 && category !== UNKNOWN`).
- **Heuristic events from `URL` / `PDF_UPLOAD` parsers cannot silently affect recommendations.** They appear in the timeline with the `lowConfidence` flag set and need explicit parent confirmation.
- **Pre-launch accuracy target**: at least 90% of confirmed events from the supported school sources should require zero parent edits at the title / date / category level. Measure on the corpus fixtures (PR #28 baselines).

## 4. Support Policy For Failed / Unsupported Sources

- A source that fails to refresh **10 consecutive times** is taken out of automatic rotation (PR #126 / [#100](https://github.com/igortsives/togetherly/issues/100)). The dashboard shows the `FAILED` chip and the parent can either:
  - Click the manual "Refresh" button to retry (clears the counter on success).
  - Click "Remove" to drop the source.
  - For OAuth providers: re-link the account to renew tokens.
- A source the heuristic parser cannot extract events from receives a clear `NEEDS_REVIEW` state with no candidates produced — the parent sees "no events found" instead of silently empty.
- A school whose calendar format we don't yet support gets a "we don't support this format yet" message in the in-product feedback capture (PR #61). No automated fallback.
- **Operator response SLA during beta**: a parent-reported failed source should be acknowledged within 1 business day. Beta is invite-only and small enough that this is achievable manually.

## 5. Operational Readiness (Pre-Launch)

Before opening the invite link to the first cohort, every item below must be checked:

### Infrastructure

- [ ] `DATABASE_URL` points at a managed Postgres (not local). Connection-pool budget set per [#96](https://github.com/igortsives/togetherly/issues/96).
- [ ] `OAUTH_TOKEN_ENCRYPTION_KEY` set to a fresh `openssl rand -base64 32` value (closes [#70](https://github.com/igortsives/togetherly/issues/70)). Document where it's stored.
- [ ] `AUTH_SECRET` set to a fresh value.
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` provisioned on a Google Cloud project marked `External` user-type, with `calendar.readonly` and `calendar.events` scopes verified by Google.
- [ ] `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` provisioned on an Entra app with `Calendars.ReadWrite` consent flow tested.
- [ ] `APPLE_CLIENT_ID` / `APPLE_CLIENT_SECRET` provisioned if Apple Sign-in is enabled.
- [ ] `CRON_SECRET` (Vercel-injected) confirmed in the project env. `vercel.json` cron schedule live.
- [ ] `FILE_STORAGE_ROOT` writable; the directory exists at the runtime path.
- [ ] `ANTHROPIC_API_KEY` provisioned for the Anthropic project; Claude Sonnet model access verified. Used by LLM-assisted classification (Round 17 / EXT-010) and natural-language search (Round 18 / MAT-008). The product no-ops gracefully without it — but the UAT-blocking capabilities won't function.
- [ ] **Cost budget for LLM spend documented**: ~$0.01 per source refresh (per [EXT-010](../PRD.md#73-extraction-and-normalization)), one Claude call per natural-language search button press (~$0.002 each). At cohort size of 25-50 families, monthly spend bounded under $20.

### Migrations

- [ ] All Prisma migrations applied to the prod database (`npx prisma migrate deploy`).
- [ ] Pre-deploy duplicate-Family audit run (per [#91](https://github.com/igortsives/togetherly/issues/91)) — `SELECT "ownerId", COUNT(*) FROM "Family" GROUP BY "ownerId" HAVING COUNT(*) > 1;` returns zero rows.

### Auth / Privacy

- [ ] `/login`, `/register`, `/account` smoke-tested end-to-end on prod URL.
- [ ] OAuth callback URLs registered for the production hostname in Google + Microsoft consoles.
- [ ] Account-deletion flow tested with a real test family (closes [#43](https://github.com/igortsives/togetherly/issues/43)).
- [ ] OAuth disconnect tested per provider (closes [#42](https://github.com/igortsives/togetherly/issues/42)).
- [ ] Rate-limit table grows + auto-prunes (closes [#64](https://github.com/igortsives/togetherly/issues/64), backed by #88 for global cleanup).

### Source pipeline

- [ ] Daily cron firing observed in Vercel logs.
- [ ] At least one URL / ICS source imported, refreshed, and detected-as-changed in a manual smoke test.
- [ ] PDF upload tested with one of the corpus fixtures.

### Observability

- [ ] Vercel logs aggregated and queryable.
- [ ] Application errors paged to a real channel (email or Slack) — not just Vercel's dashboard.
- [ ] PII redaction in logs verified per [`PRIVACY.md` §6](./PRIVACY.md#6-logging--telemetry-boundary): no email, no event titles, no token contents.

### Product polish

- [ ] In-product feedback capture works end-to-end (closes [#46](https://github.com/igortsives/togetherly/issues/46)).
- [ ] Privacy policy and ToS pages drafted and linked from the footer.
- [ ] Beta invite email template ready.
- [ ] One-page beta FAQ (covers the §1 out-of-scope items) ready.

### Pre-launch ops

- [ ] First-cohort families identified, contact info captured, expected source mix documented.
- [ ] An operator is on-call for the first 7 days to triage failed-source reports and bug reports.

## 6. Post-Launch Tracking

Once invites go out:

- The success metrics in [`BETA_PLAN.md`](./BETA_PLAN.md#beta-success-criteria) become the dashboard the operator watches.
- Failed-source reports are filed as GitHub issues with the `area:source-acquisition` label.
- Bug reports are filed with `priority:P1` (Private Beta milestone) if they block a family from setup or from a useful free-window result.

This document is reviewed before each cohort expansion (alpha → beta → public). Update it when an item is added or removed from the out-of-scope list.
