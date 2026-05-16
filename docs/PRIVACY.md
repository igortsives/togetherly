# Privacy And Child-Data Handling Requirements

This document is the engineering checklist for how Togetherly handles parent and child data during the private beta MVP. It extends [`SECURITY_PRIVACY.md`](./SECURITY_PRIVACY.md), which states the baseline security posture, and grounds each rule in something already decided in the PRD, schema, or other product docs.

Future PRs that touch auth (#17), OAuth integrations (#13, #18), source ingestion, review flows, or deletion paths should cross-reference this doc as a checklist.

## 1. Data Inventory

The tables below catalog every field we currently store, pulled from [`prisma/schema.prisma`](../prisma/schema.prisma) and [`docs/DATA_MODEL.md`](./DATA_MODEL.md). "Minimum-required" means the field is required to deliver MVP functionality per [`PRD.md` section 11](../PRD.md). "Optional" fields must remain optional in product and UI.

### 1.1 Parent (`User`)

| Field | Required? | Rationale |
|---|---|---|
| `id` | Required | Primary key. |
| `email` | Required | Login identity; password reset; OAuth account linking. |
| `name` | Optional | Display only; never required for sign-up. |
| `authProvider` | Required | `EMAIL`, `GOOGLE`, or `APPLE` per [`MVP_SPEC.md`](./MVP_SPEC.md). |
| `createdAt` / `updatedAt` | Required | Audit timestamps. |

Not collected: phone number, mailing address, marketing preferences, demographic data.

Email is the only public identity signal and must not be a side-channel into the user list. `app/register/actions.ts` defends against account enumeration by attempting the INSERT unconditionally (bcrypt-hashing the password on every request) and silently swallowing the `P2002` unique-constraint collision — so a new email and a registered email both redirect to `/login?registered=1` with identical response shape and similar timing. Issue [#62](https://github.com/igortsives/togetherly/issues/62).

### 1.2 Family

| Field | Required? | Rationale |
|---|---|---|
| `id` | Required | Primary key. |
| `ownerId` | Required | Links family to its parent user (`onDelete: Cascade`). |
| `name` | Optional | Display only. |
| `timezone` | Required (defaulted) | Needed for free-window computation; defaults to `America/Los_Angeles`. The only location-like field we keep at the family level. |
| `createdAt` / `updatedAt` | Required | Audit timestamps. |

### 1.3 Child

| Field | Required? | Rationale |
|---|---|---|
| `id` | Required | Primary key. |
| `familyId` | Required | Scopes child to a family (`onDelete: Cascade`). |
| `nickname` | Required | The only identifier we accept for a child; parent-defined string. |
| `color` | Optional | UI helper for timeline rows; treated as a UI preference, not PII. |
| `createdAt` / `updatedAt` | Required | Audit timestamps. |

Explicitly not stored: legal name, date of birth, grade level, student ID, school name as a child attribute, address, photo, contact info, custody status. See [`SECURITY_PRIVACY.md` § Data Minimization](./SECURITY_PRIVACY.md#data-minimization).

### 1.4 Calendar / CalendarSource

| Field | Required? | Rationale |
|---|---|---|
| `Calendar.name` | Required | Parent-facing label. |
| `Calendar.type` | Required | One of `SCHOOL`, `UNIVERSITY`, `CAMP`, `SPORT`, `MUSIC`, `ACTIVITY`, `PARENT`, `CUSTODY`, `OTHER`. |
| `Calendar.timezone` | Optional | Override of family timezone when a source publishes a different one. |
| `CalendarSource.sourceType` | Required | One of `URL`, `PDF_UPLOAD`, `ICS`, `GOOGLE_CALENDAR`, `OUTLOOK_CALENDAR`. |
| `CalendarSource.sourceUrl` | Optional | Public URL when applicable; expected to be public-web data. |
| `CalendarSource.uploadedFileKey` | Optional | Reference to PDF blob in private storage; never world-readable. |
| `CalendarSource.providerCalendarId` | Optional | Opaque ID returned by Google/Microsoft; not a credential. |
| `CalendarSource.contentHash` | Optional | Hash used for change detection. |
| `CalendarSource.parserType` / `refreshStatus` | Required (defaulted) | Operational metadata. |
| `CalendarSource.lastFetchedAt` / `lastParsedAt` | Optional | Audit timestamps for [`SRC-007`](../PRD.md#72-source-acquisition). |

### 1.5 EventCandidate / CalendarEvent

These tables store extracted and confirmed event content (title, dates, category, evidence). They are family-private; see [§6 Logging + Telemetry Boundary](#6-logging--telemetry-boundary) for how titles are treated in logs.

### 1.6 OAuth Tokens

OAuth access/refresh tokens for Google Calendar (#13, PR #33) and Outlook Calendar (#18, PR #34) live in the NextAuth `Account` table introduced by the auth migration in PR #31. The fields used by the calendar integrations are `access_token`, `refresh_token`, `expires_at`, `scope`, and `token_type`. Rotation happens inline in [`lib/sources/google.ts`](../lib/sources/google.ts) and [`lib/sources/microsoft.ts`](../lib/sources/microsoft.ts) when a token is within 60 seconds of expiry.

**Current handling:**

- Cascade-delete on `User.id` is wired (`Account.userId` has `onDelete: Cascade`). Deleting the parent removes all linked OAuth accounts.
- Tokens never cross into client components or API responses; they are read only inside server-side ingest paths.
- Logs scrub tokens per [§6 Logging + Telemetry Boundary](#6-logging--telemetry-boundary).

**At-rest encryption (shipped in PR #37 follow-up):**

- The `access_token`, `refresh_token`, and `id_token` columns on `Account` are now encrypted via AES-256-GCM before being written and decrypted on read. The encryption is applied transparently by a Prisma client `$extends` in [`lib/db/prisma.ts`](../lib/db/prisma.ts), so every code path — the NextAuth adapter, the calendar API clients, manual scripts — gets the protection without per-callsite changes.
- Implementation: [`lib/auth/oauth-tokens.ts`](../lib/auth/oauth-tokens.ts). Encrypted values carry a `v1:` prefix; values without the prefix are treated as legacy plaintext (passthrough) so existing rows continue to work and roll forward to encrypted as the user refreshes tokens.
- Key: `OAUTH_TOKEN_ENCRYPTION_KEY`. Generate with `openssl rand -base64 32`. Rotating the key invalidates all stored OAuth tokens and forces users to re-link.

## 2. Minimum-Data Principle

Hard rules. PRs that violate any of these should be rejected.

- **Children are nicknames only.** No legal names, DOB, school of record, grade, student ID, address, photo. Source: [`PRD.md` § 10](../PRD.md#10-non-functional-requirements), [`MVP_SPEC.md` Out Of Scope](./MVP_SPEC.md#out-of-scope-for-mvp), [`SECURITY_PRIVACY.md`](./SECURITY_PRIVACY.md#data-minimization).
- **`Child.color` is a UI preference, not PII.** It must not be exported, logged, or transmitted to third parties as an identifier.
- **No location data beyond timezone.** `Family.timezone` and optional `Calendar.timezone` are the only geographic signals stored. No street address, no geolocation, no city.
- **No portal credentials, ever.** No storage of school portal usernames, passwords, or session cookies. Source: [`DECISIONS.md`](./DECISIONS.md), [`SECURITY_PRIVACY.md` § Explicit Non-Goals](./SECURITY_PRIVACY.md#explicit-non-goals).
- **No child accounts.** Children are records owned by a parent, never authentication subjects. Source: [`MVP_SPEC.md` Out Of Scope](./MVP_SPEC.md#out-of-scope-for-mvp).
- **No attendance, grades, assignments, or course-level schedules.** Source: [`PARSING_STRATEGY.md` § Non-Targets](./PARSING_STRATEGY.md#non-targets-for-mvp-extraction).
- **Free-text fields stay free-text.** `Child.nickname`, `Calendar.name`, and event titles are parent-controlled strings. We do not parse them server-side to derive new identifiers (e.g., we do not infer a child's school from their calendar title).

## 3. OAuth Token Handling

Applies to Google Calendar (#13) and Outlook Calendar (#18). Grounded in [`ARCHITECTURE.md` § Architecture Risks](./ARCHITECTURE.md#architecture-risks) and [`SECURITY_PRIVACY.md` § Calendar Provider Requirements](./SECURITY_PRIVACY.md#calendar-provider-requirements).

### 3.1 At-Rest Encryption

- All access tokens, refresh tokens, and id_tokens are encrypted with AES-256-GCM before being written to the `Account` table. Encryption is transparent (Prisma `$extends`), so the NextAuth adapter and the calendar API clients all benefit without changes.
- Decryption happens only in server-side code paths that need to make a provider API call. Tokens MUST NOT cross into client components, API responses, or logs.
- Provider response bodies are scrubbed from thrown errors and from UI-facing error strings — only the HTTP status code is preserved. The full body is available in server-side logs at debug level only.
- `OAUTH_TOKEN_ENCRYPTION_KEY` strength is enforced at runtime (closes [#70](https://github.com/igortsives/togetherly/issues/70)). On first use, [`lib/auth/oauth-tokens.ts`](../lib/auth/oauth-tokens.ts) base64-decodes the env var and throws `OAuthTokenKeyError` if the decoded result is shorter than 32 bytes — a weak input like `OAUTH_TOKEN_ENCRYPTION_KEY=password` is now rejected outright instead of being silently SHA-256-derived. Always generate the key with `openssl rand -base64 32`.

### 3.2 Scope Minimization

| Provider | Required scopes (MVP) | Forbidden in MVP |
|---|---|---|
| Google Calendar | Read-only access to user-selected calendars. | Write access, Gmail, Contacts, Drive, profile photo, full account scopes. |
| Microsoft Graph | Calendar read for selected calendars. | Mail.Read, Files.Read, full directory scopes, write scopes. |

Export to provider calendars (`EXP-001`, `EXP-002` in PRD § 7.8) is P1. When that work lands, write scope should be added incrementally and only after the parent opts in.

### 3.3 Rotation, Disconnect, Deletion

- Refresh tokens are rotated by the provider; we store the latest refresh token and never log either token value. Rotation lives in `ensureGoogleAccessToken` and `ensureMicrosoftAccessToken`. Concurrent rotation is serialized per `Account` via a Postgres advisory lock (`withAccountLock` in [`lib/db/locks.ts`](../lib/db/locks.ts)) so two parallel refreshers cannot race against the same `refresh_token` (#66).
- On `invalid_grant` from the provider's token endpoint, `Account.refresh_token` is nulled out so the next call surfaces the "re-link your account" error path instead of silently retrying with a permanently dead grant.
- "Disconnect" MUST: revoke the token with the provider, delete the linked `Account` row, leave imported `CalendarEvent` rows in place (parent can delete those separately), and set the related `CalendarSource.refreshStatus` to a terminal state. **The in-product disconnect UX is not yet built** — today the only path is operator-side Prisma access. Tracked in [`TECH_DEBT.md`](./TECH_DEBT.md).
- On user deletion (see [§4](#4-data-retention--deletion)), all `Account` rows for that user cascade-delete via the `Account.userId` foreign key.

### 3.4 Email-Based Account Linking

Both the Google and Microsoft providers are configured with `allowDangerousEmailAccountLinking: true`. This lets an existing Togetherly user (who signed up with credentials, Google, or another OAuth) link the *other* provider by re-signing in, as long as the two providers report the same email address.

The Google takeover path is closed by a `signIn` callback in `auth.ts` that rejects Google sign-ins unless `profile.email_verified === true`.

**Microsoft retains a residual takeover surface.** The provider is configured against the multi-tenant `common/v2.0` issuer, which accepts personal Microsoft accounts where email is not directory-verified. Combined with `allowDangerousEmailAccountLinking: true`, an attacker who controls an MSA at the matching email could silently link into an existing Togetherly user. Closing this is tracked in [#76](https://github.com/igortsives/togetherly/issues/76); options include switching to a tenant-scoped issuer, checking the `xms_edov` claim, or removing the dangerous-linking flag for Microsoft entirely.

Future mitigations to consider when productionizing:

- Require fresh re-authentication before linking.
- Require explicit confirmation in-product before linking a new provider.

## 4. Data Retention + Deletion

Deletion endpoints are a Phase 3 deliverable per [`ARCHITECTURE.md`](./ARCHITECTURE.md) and [`BETA_PLAN.md` Beta Readiness Checklist](./BETA_PLAN.md#beta-readiness-checklist). This section specifies the requirements that work must meet.

### 4.1 Retention

- Imported `CalendarSource`, `EventCandidate`, and `CalendarEvent` rows are retained for the lifetime of the owning `Family` unless the parent deletes them.
- Uploaded PDFs (`CalendarSource.uploadedFileKey`) are retained alongside the source row; deleting the source MUST delete the blob.
- `FreeWindowSearch` / `FreeWindowResult` rows are retained for the lifetime of the family; they hold no source content, only date ranges and explanations.
- No automatic time-based purge in the MVP; we do not yet have a published retention window. See [Open Questions](#9-open-questions).

### 4.2 Cascade Behavior (already wired in schema)

| Relation | `onDelete` |
|---|---|
| `Family → User` | `Cascade` |
| `Child → Family` | `Cascade` |
| `Calendar → Family` | `Cascade` |
| `Calendar → Child` | `SetNull` (calendar survives if a child is removed) |
| `CalendarSource → Calendar` | `Cascade` |
| `EventCandidate → CalendarSource` / `Calendar` | `Cascade` |
| `CalendarEvent → Calendar` | `Cascade` |
| `CalendarEvent → EventCandidate` | `SetNull` (confirmed event survives if the candidate is purged) |
| `FreeWindowSearch → Family` | `Cascade` |
| `FreeWindowResult → FreeWindowSearch` | `Cascade` |

### 4.3 "Delete My Data" Semantics

When a parent invokes account deletion (Phase 3), the request MUST:

1. Revoke any active OAuth tokens with Google and Microsoft.
2. Delete the `User` row, which cascades to all `Family`, `Child`, `Calendar`, `CalendarSource`, `EventCandidate`, `CalendarEvent`, `FreeWindowSearch`, and `Account` records.
3. Delete uploaded files referenced by `CalendarSource.uploadedFileKey`.
4. Best-effort scrub of audit/log entries that contain identifiers tied to the user (see [§6](#6-logging--telemetry-boundary)).

In-product deletion is not yet implemented. The current cascade behavior makes a Prisma-side "delete user → cascade to family → cascade to everything else" approach feasible, but the provider-token-revocation step and uploaded-file cleanup are operator-only today.

### 4.4 Export Before Delete (Courtesy)

Before destructive deletion, the parent SHOULD be offered an export of their family's confirmed events. Format and scope are not yet decided; see [Open Questions](#9-open-questions). Export MUST NOT include OAuth tokens or raw provider payloads.

## 5. Data Egress

Third parties Togetherly may contact in the MVP:

| Destination | Direction | Data sent | Trigger |
|---|---|---|---|
| Google OAuth + Calendar API | Outbound | OAuth handshake, token refresh, calendar read requests | Parent connects/uses Google Calendar (#13). |
| Microsoft identity platform + Graph | Outbound | OAuth handshake, token refresh, calendar read requests | Parent connects/uses Outlook Calendar (#18). |
| Apple Sign In | Outbound | OAuth handshake | Parent uses Login with Apple. |
| Public school/registrar/activity URLs | Outbound | Standard HTTP GET for public pages, PDFs, or ICS feeds | Source import or refresh (`SRC-001`, `SRC-003`, `SRC-008`). |

Explicitly not used in the MVP: analytics SDKs, advertising networks, third-party error trackers that ingest payloads, customer-data warehouses, marketing-email providers. Adding any of those requires a follow-up decision recorded in [`DECISIONS.md`](./DECISIONS.md).

### 5.1 LLM-Assisted Extraction

Per [`PARSING_STRATEGY.md`](./PARSING_STRATEGY.md#llm-usage-rules), the parser pipeline may call an LLM for ambiguous HTML/PDF cases. When that integration lands:

- May be sent: raw text or structured chunks extracted from the **public source** (PDF text, HTML excerpts), and the canonical-event JSON schema we want back.
- MUST NOT be sent: parent email or name, child nickname, family ID, user ID, OAuth tokens, uploaded private PDFs that are not themselves public source material, free-window search history.
- Source URLs may be sent because they are public.
- LLM provider must be selected with a no-training / no-retention setting where available; specific vendor choice is tracked outside this doc.

## 6. Logging + Telemetry Boundary

Grounded in [`SECURITY_PRIVACY.md` MVP Security Checklist](./SECURITY_PRIVACY.md#mvp-security-checklist) (last bullet) and [`PRD.md` § 13](../PRD.md#13-risks-and-mitigations).

| Allowed in production logs | Not allowed in production logs |
|---|---|
| Internal IDs (`userId`, `familyId`, `childId`, `calendarId`, `calendarSourceId`, `candidateId`, `eventId`) | Child nicknames |
| Source URLs (public web) | Event titles (raw or normalized) |
| `parserType`, `refreshStatus`, `sourceType` | Evidence text excerpts |
| HTTP status codes, error class names, stack traces | Full OAuth tokens, refresh tokens, or auth secrets |
| Timing metrics, queue depth, fetch sizes | Email addresses (except where required for auth audit) |
| Schema validation failure shape (field paths, not values) | Uploaded PDF contents |

This applies to application logs, error-reporting tooling, and any future metrics export. Audit timestamps on imports/refreshes (`MVP Security Checklist` bullet 6) reference IDs, not titles.

### Sign-in rate limiting

The Credentials sign-in path (`auth.ts`) records failed attempts in a `SignInAttempt` table keyed by `email:<addr>` and `ip:<addr>`. Counters are kept in two layered 15-minute windows: 5 failures per email, 20 per IP. On limit-exceeded, `authorize` returns `null` (same generic failure path as a wrong password) and emits a single info-level log line containing only the bucket name and count — never the raw email or IP. Stale rows are pruned per-key on each check; a periodic global cleanup of orphaned IP rows is tracked separately. Issue [#64](https://github.com/igortsives/togetherly/issues/64).

## 7. Beta-Specific Posture

From [`BETA_PLAN.md`](./BETA_PLAN.md) and [`MVP_SPEC.md` Initial Private Beta Constraints](./MVP_SPEC.md#initial-private-beta-constraints):

- The product is gated to invited families only. Sign-up endpoints should reject users without an invite until public beta.
- Invite revocation MUST disable sign-in for the affected user and SHOULD allow the operator to trigger account deletion per [§4.3](#43-delete-my-data-semantics).
- Audit trail in beta consists of: `createdAt` / `updatedAt` columns on every model, `CalendarSource.lastFetchedAt` / `lastParsedAt`, and structured application logs subject to [§6](#6-logging--telemetry-boundary).
- Known limitations of extraction and review must remain visible inside the app (per [`BETA_PLAN.md` Beta Readiness Checklist](./BETA_PLAN.md#beta-readiness-checklist)) so parents understand what we have and have not confirmed about their kids' calendars.

## 8. Cross-References

- [`docs/SECURITY_PRIVACY.md`](./SECURITY_PRIVACY.md) — baseline security and minimization position; this doc extends it.
- [`docs/DECISIONS.md`](./DECISIONS.md) — accepted product decisions, including "no portal credentials".
- [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — token-handling and deletion called out as Phase 3 risks.
- [`docs/DATA_MODEL.md`](./DATA_MODEL.md) — full field-level data model.
- [`docs/PARSING_STRATEGY.md`](./PARSING_STRATEGY.md) — extraction pipeline, including LLM usage rules.
- [`PRD.md` § 10](../PRD.md#10-non-functional-requirements) — privacy and security non-functional requirements.
- [`PRD.md` § 13](../PRD.md#13-risks-and-mitigations) — privacy as a tracked risk.
- [`prisma/schema.prisma`](../prisma/schema.prisma) — authoritative schema for fields and cascade behavior.
- [`.env.example`](../.env.example) — `OAUTH_TOKEN_ENCRYPTION_KEY` and related secrets.

## 9. Open Questions

Decisions not yet made. PR authors should not pick a side here without recording the choice in [`DECISIONS.md`](./DECISIONS.md).

- Should the MVP surface a parent-facing "what we store about your kids" page (in-product transparency), or is this engineering doc sufficient for the private beta?
- When does a parent get to see their own audit log (imports, refreshes, OAuth connect/disconnect events)? Beta, public launch, or never in-product?
- What is the published data retention window after account deletion, if any? Today the requirement is immediate cascade delete; a future commitment (e.g., "purged within 30 days from backups") is undecided.
- What is the export format for the "export before delete" courtesy? ICS, JSON, both?
- Which LLM provider will be used for LLM-assisted extraction, and what is its retention/training policy? Until decided, the LLM path remains disabled in production.
- ~~Do we need a separate `OAuthToken` model now (to lock in the encryption story) or wait until #13/#18 land?~~ **Resolved**: tokens live in the NextAuth `Account` table; column-level encryption is now a `TECH_DEBT.md` item rather than an open product question.
- Do we need a parent-controlled "lock" on a child record (preventing accidental deletion when shared families arrive in a future phase)?
- How are operator/admin reads of family data audited during the private beta?
