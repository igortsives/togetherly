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

Pass criteria (measurable where possible):

- **Academic calendar coverage**: for the UCLA PDF, ≥ 80% of weekdays inside a synthesized `class_in_session` interval render as busy on the timeline. Sat/Sun inside the same interval render as free. Listed holidays inside the interval render as free.
- **All-day display**: every all-day event (e.g., Presidents' Day on Feb 16, 2026-27) renders as a single-day block with the correct end-day label — not "Feb 16 – Feb 17."
- **Source attribution**: every event block on the timeline shows its originating source via the legend + per-block color stripe. Clicking a block opens the drilldown with the correct source name, provider type, and evidence locator.
- **Natural-language search**: typing "I want a free week around Christmas" returns the parse preview ("Searching for 5+ day windows between Dec 11 2026 and Jan 8 2027, preferring ones that include Dec 25") with an Adjust button. Running it returns at least one window if the data supports it.
- **Long-weekend detection**: a search that contains a Mon/Fri `school_closed` holiday adjacent to a Sat-Sun weekend surfaces the long weekend with a "Long weekend (extends Memorial Day)"-style label.
- **Cross-source intersection**: with UCLA + Vanderbilt + Google + ICS all linked, a search for "a week when both kids are off school" returns at least one window if one exists.

Decision branches after UAT:

- **Limited release**: invite the first 5-10 friendly families. Watch closely for the first 7 days.
- **Continue iterating**: file follow-up issues, defer invites by another round.

This decision is captured in [`DECISIONS.md`](./DECISIONS.md) when made.
