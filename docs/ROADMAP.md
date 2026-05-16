# Roadmap

Status legend: ✅ shipped · 🟡 partial / in progress · ⬜ not started.

## Phase 0: Project Foundation — ✅ Complete

- ✅ Commit product docs.
- ✅ Scaffold app (Next.js + TypeScript + Tailwind-free utility CSS).
- ✅ Set up PostgreSQL and Prisma.
- ✅ Set up auth (NextAuth v5 + Prisma adapter, credentials + Google + Apple + Microsoft).
- ✅ GitHub Actions CI gating PRs on lint/typecheck/test/build ([#47](https://github.com/igortsives/togetherly/issues/47), [#81](https://github.com/igortsives/togetherly/issues/81)).
- ✅ Parser fixture structure under `fixtures/sources/` and `fixtures/expected-events/`.

## Phase 1: Prototype — ✅ Complete

- ✅ Family and child setup ([`/`](../app/page.tsx)).
- ✅ Calendar source model.
- ✅ URL import (HTML extractor #6, PR #29).
- ✅ PDF upload + text extraction (#7, PR #30).
- ✅ ICS import (#5, PR #22).
- ✅ Basic event extraction across all source types.
- ✅ Parent review queue at `/review` (#8, PR #23).
- ✅ Matching engine + `/windows` search (#9, PR #24).
- ✅ Per-child dashboard timeline + free-window overlay (#10, PR #27).

## Phase 2: Private Beta MVP — ✅ Complete

- ✅ Email/password registration + Google login + Login with Apple (#17, PR #31).
- ✅ Microsoft on `/login` + `AuthProvider.MICROSOFT` ([#48](https://github.com/igortsives/togetherly/issues/48), PR #119).
- ✅ Google Calendar integration (#13, PR #33).
- ✅ Outlook Calendar integration (#18, PR #34).
- ✅ Source refresh + change-alert pipeline (#12, PR #36) + scheduler + per-source advisory locks + free-window stale-flag ([#40](https://github.com/igortsives/togetherly/issues/40), [#41](https://github.com/igortsives/togetherly/issues/41), PR #99).
- ✅ Per-source backoff for repeatedly-failing scheduled refreshes ([#100](https://github.com/igortsives/togetherly/issues/100), PR #126).
- ✅ Vercel Cron registration ([#101](https://github.com/igortsives/togetherly/issues/101), PR #126).
- ✅ Saved windows + share/export to Google or Outlook ([#45](https://github.com/igortsives/togetherly/issues/45), PR #123).
- ✅ In-product OAuth disconnect ([#42](https://github.com/igortsives/togetherly/issues/42), PR #106).
- ✅ In-product account deletion ([#43](https://github.com/igortsives/togetherly/issues/43), PR #110).
- ✅ Bulk-confirm in review queue ([#44](https://github.com/igortsives/togetherly/issues/44), PR #58).
- ✅ Beta feedback capture ([#46](https://github.com/igortsives/togetherly/issues/46), PR #61).
- ✅ OAuth token at-rest encryption + strict env-key validation ([#37](https://github.com/igortsives/togetherly/issues/37), [#70](https://github.com/igortsives/togetherly/issues/70)).
- ✅ OAuth account-linking hardening for Google + Microsoft ([#38](https://github.com/igortsives/togetherly/issues/38), [#76](https://github.com/igortsives/togetherly/issues/76), PRs #75/#114).
- ✅ Same-origin redirect enforcement ([#63](https://github.com/igortsives/togetherly/issues/63), PR #75).
- ✅ Register account-enumeration close + credentials-login timing-channel close ([#62](https://github.com/igortsives/togetherly/issues/62), [#86](https://github.com/igortsives/togetherly/issues/86), PRs #84/#114).
- ✅ Family.ownerId unique + race fix ([#65](https://github.com/igortsives/togetherly/issues/65), PR #89).
- ✅ Serialized OAuth token refresh ([#66](https://github.com/igortsives/togetherly/issues/66), PR #94).
- ✅ Credentials rate-limiting ([#64](https://github.com/igortsives/togetherly/issues/64), PR #87).
- ✅ Source provenance on the dashboard timeline ([#51](https://github.com/igortsives/togetherly/issues/51), PR #119).
- ✅ Push family-ownership check into `refreshSource()` ([#49](https://github.com/igortsives/togetherly/issues/49), PR #71).
- ✅ Launch-readiness checklist ([#15](https://github.com/igortsives/togetherly/issues/15), PR #128).
- 🟡 UCLA / Vanderbilt / Saratoga parser fixtures: UCLA + Vanderbilt are live captures (PR #28); Saratoga is still pending [#19](https://github.com/igortsives/togetherly/issues/19) — not a beta blocker if no first-cohort family uses LGSUHSD.

## Phase 2.5: Intelligent Calendar Redesign — 🟡 In progress (Rounds 15-18)

Driven by UAT feedback on the UCLA PDF import (2026-05-16). Without these, an academic calendar doesn't carry meaningful busy/free semantics to a parent reading the timeline.

- ⬜ **Round 15 — UI foundations.** All-day end-day display fix ([#129](https://github.com/igortsives/togetherly/issues/129)); source legend + filter + drilldown side panel ([#130](https://github.com/igortsives/togetherly/issues/130)).
- ⬜ **Round 16 — Semantic redesign.** Boundary-pair inference for academic calendars + weekend carve-out + long-weekend labelling ([#131](https://github.com/igortsives/togetherly/issues/131)). Optional term-overview view mode ([#132](https://github.com/igortsives/togetherly/issues/132)).
- ⬜ **Round 17 — LLM foundation.** Anthropic SDK plumbing + LLM-assisted classification of ambiguous extracted events (closes [#52](https://github.com/igortsives/togetherly/issues/52)).
- ⬜ **Round 18 — Natural-language search.** Free-text input on `/windows` that parses to structured search params via Claude ([#133](https://github.com/igortsives/togetherly/issues/133)).
- ⬜ **Round 19 — UAT gate.** End-to-end UAT against real UCLA / Vanderbilt / Google / ICS sources. Decision: limited cohort release vs continue iterating.

## Phase 3: Hardening + Public Launch Preparation — ⬜ Not started

- ⬜ Expanded source corpus beyond UCLA + Vanderbilt — closes out [#11](https://github.com/igortsives/togetherly/issues/11) (NYC Schools, LAUSD, Fairfax, Stanford, Michigan, TeamSnap, SportsEngine).
- ⬜ Saratoga / LGSUHSD corpus capture — [#19](https://github.com/igortsives/togetherly/issues/19).
- ⬜ Provider webhooks for near-real-time change detection — [#50](https://github.com/igortsives/togetherly/issues/50).
- ⬜ Incremental Google/Outlook sync via syncToken / delta — [#56](https://github.com/igortsives/togetherly/issues/56).
- ⬜ Playwright E2E coverage — [#53](https://github.com/igortsives/togetherly/issues/53).
- ⬜ Stitch design integration — [#32](https://github.com/igortsives/togetherly/issues/32).
- ⬜ Performance tuning for large calendars.
- ⬜ Accessibility audit beyond the color-isn't-the-only-signal commitment.

## Phase 4: Native Mobile Exploration — ⬜ Not started

- ⬜ Validate whether responsive web covers most use cases.
- ⬜ Define native mobile requirements.
- ⬜ Decide between React Native, Swift/Kotlin, or continued web-first approach.

## Key Milestones

| Milestone | Status | Outcome |
|---|---|---|
| MVP Prototype | ✅ Complete | Import, review, and match calendars locally end to end. |
| Private Beta MVP | ✅ Complete | Auth, OAuth, source ingest, refresh, export, account lifecycle. |
| Intelligent Calendar Redesign | 🟡 In progress (Phase 2.5) | Academic calendars carry meaningful semantics; natural-language search; source-aware UI. |
| UAT Gate | ⬜ Pending Round 19 | Decide between limited cohort release and another iteration. |
| Public Launch | ⬜ After UAT acceptance | Corpus coverage, mobile polish, webhooks, paid plan. |

## What's Open Right Now

Live tracking lives on GitHub. Quick links:

- [`Private Beta` milestone](https://github.com/igortsives/togetherly/milestone/2) — everything tied to invited-family readiness.
- [`priority:P1` open issues](https://github.com/igortsives/togetherly/issues?q=is%3Aopen+label%3Apriority%3AP1) — Phase 2.5 capabilities + remaining hardening.
- [`priority:P2` open issues](https://github.com/igortsives/togetherly/issues?q=is%3Aopen+label%3Apriority%3AP2) — Phase 3 / post-launch.

See [`docs/TECH_DEBT.md`](./TECH_DEBT.md) for the index of debt-related issues grouped by theme, plus a few documentation-only items that intentionally don't have issues.
