# Private Beta Plan

## Beta Goal

Validate whether parents can use Togetherly to import real calendars, review extracted events, and find trustworthy overlapping free windows for family travel planning.

## Target Beta Users

- 5-10 families for closed alpha.
- 25-50 families for private beta.
- Prioritize:
  - Families with 2+ children.
  - One child in college and one in K-12.
  - Activity-heavy families with sports/music schedules.
  - Families using Google Calendar or Outlook Calendar.

## Beta Success Criteria

| Metric | Target |
|---|---:|
| Families completing setup | 70%+ |
| Average calendars imported per family | 3+ |
| Time to first useful free-window result | Under 10 minutes |
| Parent-confirmed extraction accuracy | 95%+ |
| Families saving at least one window | 50%+ |
| Qualitative trust rating | Majority say recommendations are understandable |

## Beta Scope

Included:

- Email/password, Google login, Login with Apple.
- PDF, URL, ICS, Google Calendar, and Outlook Calendar imports.
- Review queue.
- Free-window search.
- Timeline visualization.
- Basic feedback capture.

Excluded:

- Native app.
- Travel booking.
- Authenticated school portal integrations.
- Full automation without review.
- Public self-serve launch.

## Feedback To Collect

- Which imports worked or failed?
- Did parents understand confidence and review states?
- Did free-window recommendations feel trustworthy?
- Did the app find a window the parent had not already noticed?
- How much manual correction was acceptable?
- Which integrations are most important next?

## Beta Readiness Checklist

The full, operational version of this checklist — covering infrastructure, migrations, auth/privacy, source pipeline, observability, and pre-launch ops — lives in [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md). After 2026-05-16, beta launch is also gated on the **Intelligent Calendar Redesign** (Phase 2.5 in [`ROADMAP.md`](./ROADMAP.md), Rounds 15-18) and a **UAT pass** in Round 19. The high-level bar is:

- Product docs approved.
- Source corpus has passing parser tests for at least UCLA, Vanderbilt, and (where the cohort needs them) Saratoga/LGSUHSD examples.
- Auth and OAuth token storage reviewed.
- Parent can delete imported sources and events.
- Low-confidence events cannot silently affect recommendations.
- Known limitations are visible inside the app.
- GitHub Issues milestone has P0 issues closed or explicitly deferred.

## UAT Gate (Round 19)

Before invitations go out, the operator (Igor) runs end-to-end UAT against a real source mix:

- UCLA PDF academic calendar.
- Vanderbilt HTML academic calendar.
- One ICS subscription (e.g. a sports team feed).
- One linked Google or Outlook calendar belonging to the parent.

Pass criteria:

- Each ingested calendar produces visible busy/free shading on the dashboard timeline that a reasonable parent would describe as "matches my mental model."
- A natural-language search ("a free week around Christmas") returns sensible windows with an editable parse preview.
- Source attribution is visible per event (legend + drilldown).
- Long-weekend free windows are correctly suggested when a Mon/Fri holiday is adjacent to a weekend.

Decision branches after UAT:

- **Limited release**: invite the first 5-10 friendly families. Watch closely for the first 7 days.
- **Continue iterating**: file follow-up issues, defer invites by another round.

This decision is captured in [`DECISIONS.md`](./DECISIONS.md) when made.
