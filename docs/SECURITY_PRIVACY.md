# Security And Privacy

## Position

Privacy is not a product blocker for the prototype, but the app handles children’s schedules and OAuth calendar tokens. The MVP should still use a practical security baseline from the beginning.

## Data Minimization

- Children can be represented by nicknames.
- Do not require grade, student ID, legal name, address, or date of birth.
- Do not store school portal credentials.
- Do not ingest attendance records or grades.

## Sensitive Data

| Data | Handling |
|---|---|
| OAuth tokens | Encrypt at rest; delete on disconnect |
| Uploaded PDFs | Store with access control; allow deletion |
| Calendar events | Scope to selected calendars only |
| Child nicknames | Treat as family-private data |
| Source URLs | Store with family ownership |

## Auth Requirements

- Email/password.
- Google login.
- Login with Apple.
- Session expiration.
- Password reset for email/password accounts.
- Account deletion path before broader beta.

## Calendar Provider Requirements

### Google Calendar

- Use OAuth.
- Request the narrowest practical read scope for selected calendars.
- Allow disconnect.
- Allow deletion of imported provider data.

### Outlook Calendar

- Use Microsoft identity platform / Graph.
- Request calendar read permissions only for MVP.
- Allow disconnect.
- Allow deletion of imported provider data.

## MVP Security Checklist

- Environment variables are not committed.
- OAuth secrets are server-side only.
- Tokens are encrypted at rest.
- Uploaded files are not publicly accessible.
- Users can access only their own family data.
- Basic audit timestamps exist for imports and source refreshes.
- Error logs do not include full OAuth tokens, credentials, or raw private calendar payloads.

## Explicit Non-Goals

- School portal credential storage.
- Background scraping behind user logins.
- Student record integrations.
- FERPA institutional workflows.
- Child accounts.
