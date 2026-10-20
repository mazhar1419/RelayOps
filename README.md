# RelayOps

RelayOps is a team-based incident response API and retro-inspired operations dashboard. It includes cookie-session authentication, CSRF protection, role-aware team access, incident lifecycle management, transactional audit logging, idempotent webhook ingestion, per-team webhook secrets, request IDs, structured logs, and rate limiting.

## Requirements

- Node.js 22 or newer
- PostgreSQL 14 or newer
- npm

## Quick start

1. Create a PostgreSQL database and a least-privilege application role.
2. Copy `.env.example` to `.env` and update `DATABASE_URL`, `SESSION_SECRET`, and `FRONTEND_ORIGIN`.
3. Install backend dependencies: `npm ci`.
4. Apply migrations: `npm run db:migrate`.
5. Start the API: `npm run dev`.
6. In another terminal, open `frontend/`, run `npm ci`, then `npm run dev`.
7. Open `http://localhost:5173`.

The API defaults to `http://127.0.0.1:3000`. The frontend development server proxies `/api` requests to the API. The session secret must be a unique random value of at least 32 characters; do not use the example value in a real environment.

## Environment

See `.env.example` for all supported variables. Never commit `.env`, `.env.test`, credentials, or generated build output. `.env.test.example` is a safe template; copy it to `.env.test` and use only the dedicated `relayops_test` database for integration tests. Integration tests intentionally refuse to run against any database whose name is not `relayops_test`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Restart the API on source changes |
| `npm start` | Start the API |
| `npm test` | Run Vitest suite (including PostgreSQL integration tests) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run db:migrate` | Apply checksum-verified SQL migrations |
| `cd frontend && npm run dev` | Start the Vite frontend |
| `cd frontend && npm run build` | Build the frontend for deployment |
| `cd frontend && npm run lint` | Lint frontend source |

## Free deployment (Render + Neon)

This repository can run the built frontend and API from one Render Web Service, so browser sessions and CSRF requests stay on the same origin. Use a Neon PostgreSQL database.

1. Create a Neon PostgreSQL project and copy its **direct** connection string. Keep it private.
2. Push this repository to GitHub without `.env` or `.env.test`.
3. In Render, create a **Web Service** from the repository. Use Node, the root directory, and the Free instance.
4. Set the build command to `npm ci --include=dev && npm --prefix frontend ci --include=dev && npm --prefix frontend run build`.
5. Set the start command to `npm run db:migrate:deploy && npm start`.
6. Add these Render environment variables: `NODE_ENV=production`, `HOST=0.0.0.0`, `DATABASE_URL` (Neon direct URL), `FRONTEND_ORIGIN` (the exact `https://...onrender.com` service URL), `SESSION_SECRET` (new random value of at least 32 characters), `DB_POOL_MAX=5`, `DB_CONNECT_TIMEOUT_MS=10000`, and `LOG_LEVEL=info`.
7. Deploy. Verify `https://YOUR-SERVICE.onrender.com/`, `/health`, and `/ready`. The root URL should show the retro dashboard and `/ready` should report a connected database.

Generate a session secret locally with `openssl rand -hex 32`. Never commit it or paste it into a public issue. The first deployment may require setting `FRONTEND_ORIGIN` to the URL Render assigns and triggering a redeploy. Render Free services can sleep after inactivity. Database migrations run at service startup; for production changes, review migrations before deployment.

## API outline

- `GET /health` — process health
- `GET /ready` — database readiness
- `GET /api/v1/auth/csrf` — initialize/get the session CSRF token
- `POST /api/v1/auth/register` — create an account (12–128 character password)
- `POST /api/v1/auth/login` — authenticate and rotate the session ID
- `GET /api/v1/auth/me` — current session user
- `POST /api/v1/auth/logout` — destroy the session
- `GET /api/v1/teams` / `POST /api/v1/teams` — list/create teams
- `/api/v1/teams/:teamId/incidents` — list/create incidents
- `/api/v1/teams/:teamId/incidents/:incidentId` — retrieve/update an incident
- `POST /api/v1/teams/:teamId/webhook-secret` — rotate a team secret (owner/admin only; plaintext returned once)
- `DELETE /api/v1/teams/:teamId/webhook-secret` — revoke a team secret (owner/admin only)
- `POST /api/v1/webhooks/:teamId/events` — receive an external event using `x-webhook-secret`

Browser-facing state-changing routes require `x-csrf-token`. External webhook calls use their team-specific `x-webhook-secret` instead. Webhook requests are rate-limited per client IP; authentication requests have separate login and registration limits. If deploying multiple API instances, use a shared rate-limit store to enforce limits across instances.

### Webhook request example

```http
POST /api/v1/webhooks/123/events
Content-Type: application/json
x-webhook-secret: <team-secret>

{
  "source": "monitoring",
  "externalEventId": "alert-00042",
  "title": "API latency above threshold",
  "description": "p95 latency exceeded the service objective",
  "severity": "high"
}
```

Each event is deduplicated by `(team_id, source, external_event_id)`. The plaintext team secret is shown only when generated; the database stores its SHA-256 hash. Keep the secret in the external provider's secret manager and never in source control or client-side code.

## Security and operations notes

- Run behind HTTPS in production; set `NODE_ENV=production` so session cookies are `Secure`.
- Use a long, randomly generated session secret and a least-privilege PostgreSQL role.
- Restrict `FRONTEND_ORIGIN` to the exact trusted frontend origin.
- Configure database backups, monitoring, and a shared rate-limit store before horizontal scaling.
- Apply migrations in a controlled deployment step and verify `/ready` after release.
- Do not use the included example credentials or any previously exposed secrets. Generate new credentials for every environment.

## Project structure

```text
src/
  app.js                         Express middleware and HTTP error handling
  server.js                      dependency wiring, startup, graceful shutdown
  config/                        environment, sessions, structured logging
  middleware/                    authentication and CSRF
  modules/auth/                  account/session endpoints
  modules/teams/                 team access and webhook secret management
  modules/incidents/             incident domain and audit transactions
  modules/webhooks/              authenticated, rate-limited, idempotent ingestion
migrations/                      ordered SQL schema migrations
 tests/                           unit, HTTP, and PostgreSQL integration tests
frontend/                         React/Vite retro operations dashboard
```
