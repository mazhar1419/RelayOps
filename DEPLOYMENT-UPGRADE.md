# RelayOps functional upgrade — deployment checklist

This release adds email verification and workspace invitations/member management. Keep the existing Git repository and Neon database; do not create a new database.

## 1. Configure email delivery first

RelayOps uses the Resend HTTP API for OTP and teammate invitation email. In Render → RelayOps service → Environment, add:

- `RESEND_API_KEY`: API key from your Resend account.
- `MAIL_FROM`: a sender identity on a domain verified with Resend, e.g. `RelayOps <no-reply@your-verified-domain.com>`.

Do not put these values in GitHub or commit them in `.env`. Without both variables, the API intentionally refuses email delivery; registration will not silently log the user in. If an account was created while delivery was misconfigured, configure email and use **Resend verification code** on the login page.

## 2. Deploy the code

1. Copy the project source into your existing local repository without replacing `.git`.
2. Check `git status`; confirm `.env`, `.env.test`, credentials and `node_modules` are not staged.
3. Commit and push to the existing GitHub repository.
4. Render should run the configured build command and then `npm run db:migrate:deploy && npm start`.
5. Migration `006_email_verification_and_team_members.sql` adds OTP storage and pending team invitations. It marks pre-existing accounts verified to preserve access; new registrations require email verification.
6. Confirm `/health` returns 200 and `/ready` returns 200 with `database: connected`.

## 3. New account flow

1. Register with an email and a password of at least 12 characters.
2. Enter the six-digit code sent by email within 10 minutes.
3. Verification does not sign the user in. Return to the sign-in form and log in explicitly.
4. Verification codes are stored as hashes, expire after 10 minutes, and allow up to five incorrect attempts. Resend is rate-limited.

## 4. Workspace teammate flow

- Open a workspace → **Teammates**.
- Enter a teammate email and choose a role.
- If the address belongs to a verified RelayOps account, the member is added immediately.
- Otherwise RelayOps sends an invitation. The person must register with that exact email and verify it; membership is added automatically. Invitations expire after seven days.
- Owners can assign admin/responder/viewer roles. Admins can invite responders/viewers. Owners cannot be removed/demoted by this interface.

## 5. Verification performed for this package

- 51 unit/HTTP/service tests passed.
- Vite production frontend build passed.
- ESLint passed.
- PostgreSQL-backed integration tests were not run in this packaging environment; verify `/ready` and inspect Render logs after migration.
