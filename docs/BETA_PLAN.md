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

- Product docs approved.
- Source corpus has passing parser tests for at least UCLA, Vanderbilt, and Saratoga/LGSUHSD examples.
- Auth and OAuth token storage reviewed.
- Parent can delete imported sources and events.
- Low-confidence events cannot silently affect recommendations.
- Known limitations are visible inside the app.
- GitHub Issues milestone has P0 issues closed or explicitly deferred.
