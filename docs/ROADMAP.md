# Roadmap

Status legend: ✅ shipped · 🟡 partial / in progress · ⬜ not started.

## Phase 0: Project Foundation — ✅ Complete

- ✅ Commit product docs.
- ✅ Scaffold app (Next.js + TypeScript + Tailwind-free utility CSS).
- ✅ Set up PostgreSQL and Prisma.
- ✅ Set up auth (NextAuth v5 + Prisma adapter, credentials + Google + Apple + Microsoft).
- ✅ CI gate via the four-command local validation (`lint`, `typecheck`, `test`, `build`). GitHub Actions wiring for these is still a follow-up.
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

## Phase 2: Private Beta MVP — 🟡 Most landed

- ✅ Email/password registration + Google login + Login with Apple (#17, PR #31).
- ✅ Google Calendar integration (#13, PR #33).
- ✅ Outlook Calendar integration (#18, PR #34).
- 🟡 UCLA/Vanderbilt/Saratoga parser fixtures: UCLA + Vanderbilt are live captures (PR #28); Saratoga is still a structural excerpt pending the 2026-27 LGSUHSD PDF ([#19](https://github.com/igortsives/togetherly/issues/19) partial).
- ✅ Free-window explanation UI (`MAT-004` conflict explanations live on `/windows`).
- ✅ Source refresh + change-alert pipeline (#12, PR #36). Manual Refresh button per source; scheduler is the follow-up [#40](https://github.com/igortsives/togetherly/issues/40).
- ⬜ Saved windows + share/export to provider calendars — [#45](https://github.com/igortsives/togetherly/issues/45).
- ⬜ In-product OAuth disconnect — [#42](https://github.com/igortsives/togetherly/issues/42).
- ⬜ In-product account deletion — [#43](https://github.com/igortsives/togetherly/issues/43).
- ⬜ Bulk-confirm in review queue — [#44](https://github.com/igortsives/togetherly/issues/44).
- ⬜ Beta feedback capture — [#46](https://github.com/igortsives/togetherly/issues/46).
- ⬜ Source refresh scheduler — [#40](https://github.com/igortsives/togetherly/issues/40).
- ⬜ Saved-window invalidation on source change — [#41](https://github.com/igortsives/togetherly/issues/41).
- ✅ OAuth token at-rest encryption — [#37](https://github.com/igortsives/togetherly/issues/37).
- ⬜ Tighten OAuth account linking (must land before public launch) — [#38](https://github.com/igortsives/togetherly/issues/38).
- ⬜ GitHub Actions CI gating PRs — [#47](https://github.com/igortsives/togetherly/issues/47).
- ✅ Next 16 `middleware.ts → proxy.ts` rename — [#39](https://github.com/igortsives/togetherly/issues/39).

## Phase 3: Hardening — ⬜ Not started

- ⬜ LLM-assisted extraction for ambiguous HTML/PDF — [#52](https://github.com/igortsives/togetherly/issues/52).
- ⬜ Expanded source corpus beyond the three initial targets.
- ⬜ Error recovery + unsupported-source flow in-product.
- ⬜ Provider webhooks for near-real-time change detection — [#50](https://github.com/igortsives/togetherly/issues/50).
- ⬜ Incremental Google/Outlook sync via syncToken / delta — [#56](https://github.com/igortsives/togetherly/issues/56).
- ⬜ Source-provenance display on the dashboard timeline — [#51](https://github.com/igortsives/togetherly/issues/51).
- ⬜ Push family-ownership check into `refreshSource()` — [#49](https://github.com/igortsives/togetherly/issues/49).
- ⬜ Playwright E2E coverage — [#53](https://github.com/igortsives/togetherly/issues/53).
- ⬜ Prisma 7 config migration — [#54](https://github.com/igortsives/togetherly/issues/54).
- ⬜ Performance tuning for large calendars (Google/Outlook accounts with thousands of events).
- ⬜ Accessibility pass beyond the existing color-isn't-the-only-signal commitment.

## Phase 4: Native Mobile Exploration — ⬜ Not started

- ⬜ Validate whether responsive web covers most use cases.
- ⬜ Define native mobile requirements.
- ⬜ Decide between React Native, Swift/Kotlin, or continued web-first approach.

## Key Milestones

| Milestone | Status | Outcome |
|---|---|---|
| MVP Prototype | ✅ Complete | Import, review, and match calendars locally end to end. |
| Private Beta | 🟡 Nearly there | Invited families can use real accounts and real calendars. Source refresh ([#12](https://github.com/igortsives/togetherly/issues/12)) shipped in PR #36. Open items under the `Private Beta` milestone on GitHub track the remaining work. |
| Parser Confidence | 🟡 Foundation in place | Deterministic parsers + fixtures shipped. LLM-assist + confidence-band tuning pending. |
| Beta Decision | ⬜ Pending | Decide whether to expand, pivot to calendar assistant, or deepen integrations after early-user feedback. |

## What's Open Right Now

Live tracking lives on GitHub. Quick links:

- [`Private Beta` milestone](https://github.com/igortsives/togetherly/milestone/2) — everything that should land before invited families come on.
- [`priority:P0` open issues](https://github.com/igortsives/togetherly/issues?q=is%3Aopen+label%3Apriority%3AP0) — security/launch blockers.
- [`priority:P1` open issues](https://github.com/igortsives/togetherly/issues?q=is%3Aopen+label%3Apriority%3AP1) — important after MVP core.
- [`priority:P2` open issues](https://github.com/igortsives/togetherly/issues?q=is%3Aopen+label%3Apriority%3AP2) — later / stretch.

See [`docs/TECH_DEBT.md`](./TECH_DEBT.md) for the index of debt-related issues grouped by theme, plus a few documentation-only items that intentionally don't have issues.
