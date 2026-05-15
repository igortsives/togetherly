# GitHub Tracking

## Source Of Truth

GitHub Issues is the source of truth for execution tracking.

Repository: https://github.com/igortsives/togetherly

## Milestones

| Milestone | Purpose |
|---|---|
| MVP Prototype | First usable prototype for import, review, matching, and recommendations |
| Private Beta | Invite-only product with auth, Google Calendar, Outlook Calendar, and source hardening |

## Label System

### Priority

- `priority:P0`: required for MVP.
- `priority:P1`: important for private beta or shortly after MVP.
- `priority:P2`: later or stretch.

### Type

- `type:epic`
- `type:feature`
- `type:research`
- `type:infra`
- `type:product`
- `type:bug`

### Area

- `area:product`
- `area:family-setup`
- `area:source-acquisition`
- `area:extraction`
- `area:normalization`
- `area:matching`
- `area:review`
- `area:ui`
- `area:integrations`
- `area:alerts`
- `area:privacy`

## Issue Writing Standard

Each implementation issue should include:

- Problem or user story.
- Acceptance criteria.
- Out of scope.
- Links to relevant docs.
- Test expectations.

## Pull Request Standard

Each pull request should include:

- Linked issue.
- Summary.
- Test plan.
- Screenshots for UI changes.
- Notes on privacy/security impact when applicable.

## Initial Issue Alignment Needed

The initial issue backlog was created from the first PRD. After product decisions changed, make sure issues reflect:

- Outlook Calendar is MVP scope.
- Google Calendar is MVP scope.
- Auth includes email/password, Google login, and Login with Apple.
- Product surface is private beta.
