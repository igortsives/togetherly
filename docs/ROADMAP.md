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
- 🟡 UCLA/Vanderbilt/Saratoga parser fixtures: UCLA + Vanderbilt are live captures (PR #28); Saratoga is still a structural excerpt pending the 2026-27 LGSUHSD PDF (#19 partial).
- ✅ Free-window explanation UI (`MAT-004` conflict explanations live on `/windows`).
- ⬜ Saved windows + share/export to provider calendars (P1 in [`MVP_SPEC.md`](./MVP_SPEC.md)).
- ⬜ Source refresh + change-alert pipeline (#12). Extractors fire only on source creation today; no scheduler.
- ⬜ Beta feedback capture (in-app form + storage).

## Phase 3: Hardening — ⬜ Not started

- ⬜ Better parser confidence scoring (LLM-assisted extraction per [`PARSING_STRATEGY.md`](./PARSING_STRATEGY.md)).
- ⬜ Expanded source corpus beyond the three initial targets.
- ⬜ Error recovery + unsupported-source flow in-product.
- ⬜ OAuth disconnect UX + account-deletion path (`PRIVACY.md` §4).
- ⬜ Column-level encryption for OAuth tokens via `OAUTH_TOKEN_ENCRYPTION_KEY` ([`TECH_DEBT.md`](./TECH_DEBT.md)).
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
| Private Beta | 🟡 Nearly there | Invited families can use real accounts and real calendars. Remaining: source refresh (#12), saved windows / export, Saratoga corpus close-out (#19), beta-feedback capture. |
| Parser Confidence | 🟡 Foundation in place | Deterministic parsers + fixtures shipped. LLM-assist + confidence-band tuning pending. |
| Beta Decision | ⬜ Pending | Decide whether to expand, pivot to calendar assistant, or deepen integrations after early-user feedback. |

## What's Open Right Now

Tracked as GitHub issues unless noted:

- [#11](https://github.com/igortsives/togetherly/issues/11) Parser corpus research follow-up.
- [#12](https://github.com/igortsives/togetherly/issues/12) Source refresh and change alerts (P1).
- [#15](https://github.com/igortsives/togetherly/issues/15) MVP launch readiness checklist (P1).
- [#19](https://github.com/igortsives/togetherly/issues/19) Saratoga corpus live capture (partial).
- [#32](https://github.com/igortsives/togetherly/issues/32) Stitch design integration (P1).
- See [`docs/TECH_DEBT.md`](./TECH_DEBT.md) for items not yet filed as issues.
