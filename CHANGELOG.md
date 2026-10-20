# Changelog

## RelayOps refresh — 2026-10-20

### Backend
- Restored the actual API entry point: dependency wiring, HTTP listener, and graceful shutdown are now implemented in `src/server.js`.
- Consolidated Express middleware and HTTP error handling in `src/app.js`.
- Added IP-based webhook rate limiting (120 requests/minute per client IP) and a testable limiter factory.
- Added separate login and registration rate limits.
- Preserved structured request IDs, security headers, CSRF checks for browser mutations, and team-specific webhook authentication.
- Kept team webhook secret rotation/revocation restricted to owners and admins; the database stores a hash, not the plaintext secret.
- Corrected the root `.gitignore` entry for `node_modules` and added environment/build-output exclusions.

### Frontend
- Replaced the starter UI with a responsive retro operations console: CRT-inspired palette, monospace system labels, grid/radar visuals, status lamps, compact data panels, and mobile layouts.
- Added workspace directory/provisioning, incident metrics, incident creation and status management, and webhook endpoint/secret management.
- Added one-time secret reveal, copy action, revoke confirmation, role-based UI restrictions, and safer secret clearing when leaving the webhook view.
- Updated metadata, favicon, frontend documentation, and removed unused Vite starter assets.

### Project hygiene
- Added root setup/API/security documentation and `.env.test.example`.
- Removed local `.env`/`.env.test`, installed dependencies, and generated `dist` output from the downloadable source archive. Install dependencies with `npm ci` and configure your own environment files.
- Verified 46 non-PostgreSQL tests, frontend production build, frontend ESLint, and JavaScript syntax. PostgreSQL integration tests still require a reachable dedicated `relayops_test` database.

## 2026-10-20 — Account verification and workspace membership

- Registration now creates a pending account and sends a six-digit email verification code; registration does not establish a login session.
- Added OTP verification and resend endpoints with expiry, attempt limits, rate limiting, and hashed code storage.
- Added workspace teammate listing, add-by-verified-email, email invitations for new accounts, pending invitation cancellation, role changes, and member removal with owner/admin permission rules. Pending invitations are accepted after the invited email is verified.
- Added the Teammates view to the retro dashboard.
- Added Resend email delivery configuration (`RESEND_API_KEY`, `MAIL_FROM`) and migration `006_email_verification_and_team_members.sql`.
- Added `DEPLOYMENT-UPGRADE.md` with the safe existing-database upgrade and Resend configuration sequence.
