<div align="center">

# RelayOps

### Incident Response & Team Operations Dashboard

A full-stack incident management platform for creating and tracking incidents, coordinating teams, and ingesting monitoring events through secure webhooks.

[**Live Demo**](https://relayops.onrender.com/) · [**Source Code**](https://github.com/mazhar1419/RelayOps) · [**Report an Issue**](https://github.com/mazhar1419/RelayOps/issues)

![Node.js](https://img.shields.io/badge/Node.js-22%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Deployment](https://img.shields.io/badge/Deployed_on-Render-46E3B7?style=for-the-badge&logo=render&logoColor=black)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Screenshots](#screenshots)
- [Try the Live Demo](#try-the-live-demo)
- [Features](#features)
- [Architecture and Tech Stack](#architecture-and-tech-stack)
- [Security and Reliability](#security-and-reliability)
- [Email and Demo Limitations](#email-and-demo-limitations)
- [Run Locally](#run-locally)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [API Overview](#api-overview)
- [Webhook Example](#webhook-example)
- [Deployment](#deployment)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [Contact](#contact)

## Overview

RelayOps is a team-based incident response application with a retro-inspired operations dashboard. It combines a React interface with an Express API and PostgreSQL persistence.

The project demonstrates practical full-stack engineering, including session-based authentication, team and role management, incident lifecycle workflows, transactional audit logging, and secure webhook ingestion.

**The engineering goal:** turn operational events into trackable incidents while keeping access, data changes, and integrations controlled.

## Screenshots

> Add your own screenshots to `docs/screenshots/` and update the paths below. Use real screenshots from the deployed application; do not commit screenshots containing secrets, personal information, or private customer data.

### Operations dashboard

![RelayOps dashboard](docs/screenshots/dashboard.png)

### Incident management

![RelayOps incident management](docs/screenshots/incidents.png)

### Team and access management

![RelayOps team management](docs/screenshots/team-management.png)

### Webhook configuration

![RelayOps webhook configuration](docs/screenshots/webhooks.png)

## Try the Live Demo

**Live application:** https://relayops.onrender.com/

A demo account is provided for reviewing the interface and workflows.

| Field | Value |
|---|---|
| Email | `imazharul1101@gmail.com` |
| Password | `;5EsA&x2E8\~[NBS6` |

**Demo account notice:** This account is intended only for evaluating the public demo. Do not store personal, confidential, or production data in it. The account owner should rotate this password before publishing it in a public repository and use a dedicated demo account with non-sensitive sample data.

The demo is hosted on Render's free service, which may sleep after inactivity. The first request after a period of inactivity can take longer while the service wakes up.

## Features

### Incident management

- Create and list incidents within a team workspace.
- Track incident severity and lifecycle status.
- Update incident status with version-aware concurrency checks.
- Record incident changes through transactional audit logging.
- Review active and resolved incidents in a dedicated dashboard.

### Teams and access control

- Create and manage team workspaces.
- View team members and pending invitations.
- Support role-aware access for owners, administrators, and members.
- Add verified users to a workspace or invite users by email.
- Update member roles under owner-only permission rules.
- Remove members and cancel pending invitations subject to access rules.

### Webhook ingestion

- Receive external monitoring events through a team-specific endpoint.
- Authenticate webhook requests with a team-specific secret.
- Rotate or revoke a webhook secret.
- Store only a SHA-256 hash of the generated secret.
- Deduplicate events using team, source, and external event ID.
- Apply request validation and rate limiting to incoming webhook requests.

### Authentication and operations

- Cookie-based session authentication.
- Session ID rotation after login.
- CSRF protection for browser-originated state-changing requests.
- Email verification using a six-digit, time-limited one-time code.
- Request IDs and structured server logging.
- Health and database-readiness endpoints.
- SQL migrations with checksum verification.

## Architecture and Tech Stack

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | React, Vite, JavaScript, CSS | Operations dashboard and user interactions |
| Backend | Node.js 22+, Express 5 | REST API, business logic, middleware |
| Database | PostgreSQL 14+ on Neon | Persistent relational data |
| Authentication | Express Session, PostgreSQL session store | Cookie-based session management |
| Validation | Zod | Environment and request validation |
| Security | Helmet, CSRF protection, Argon2, rate limiting | HTTP hardening and abuse resistance |
| Logging | Pino, Pino HTTP | Structured application and request logs |
| Email | Resend | Verification and invitation email delivery |
| Hosting | Render | Web service and same-origin frontend/API |
| Database hosting | Neon | Managed PostgreSQL |

In production, Render serves the built React frontend and API from the **same origin**. This simplifies cookie-based session handling and CSRF requests.

## Security and Reliability

Security and correctness are important parts of this project:

- **Password hashing:** Argon2 is used for password hashing.
- **Session security:** the session ID is rotated after login; production cookies use secure settings behind Render's HTTPS proxy.
- **CSRF protection:** browser-facing state-changing requests require a CSRF token.
- **Role-aware authorization:** team actions are checked against the user's workspace permissions.
- **Webhook secret handling:** a generated secret is shown once; its SHA-256 hash is stored in the database.
- **Idempotent ingestion:** duplicate external events are rejected based on their team/source/event identifier.
- **Auditability:** incident changes are recorded through transactional audit logging.
- **Input validation:** request and environment input is validated.
- **Abuse controls:** authentication and webhook endpoints have rate limits.
- **Operational visibility:** structured logs and request IDs help trace failures.

For a multi-instance production deployment, configure a shared rate-limit store so limits are enforced across instances. Production use also requires appropriate backups, monitoring, access policies, and a reviewed migration process.

## Email and Demo Limitations

The deployed demo uses the **free tiers of Render and Resend**, so some workflows may be constrained.

- **Email verification:** new registrations depend on Resend accepting the verification email. Sending restrictions depend on the sender/domain verification and the limits of the Resend account.
- **Invitation emails:** invitations require working email delivery. On the current free setup, invitation delivery may be unavailable or restricted; do not assume an invitation email was delivered just because an invitation action was attempted.
- **No Gmail SMTP fallback:** the deployed service is not configured to use Gmail SMTP. Render's free hosting constraints are why this demo uses Resend instead.
- **Existing demo login:** use the demo account above to explore the application without creating a new account.
- **Free-hosting wake-up time:** Render may spin down the service after inactivity.

These are deployment and provider limitations, not a guarantee that all email workflows will work in the live demo. For production use, configure a verified sending domain, review provider limits, test delivery end to end, and use an appropriate hosting plan.

## Run Locally

### Requirements

- Node.js 22 or newer
- PostgreSQL 14 or newer
- npm

### 1. Clone the repository

```bash
git clone https://github.com/mazhar1419/RelayOps.git
cd RelayOps
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Update the values in `.env`. At minimum, configure:

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — unique random secret of at least 32 characters
- `FRONTEND_ORIGIN` — local frontend origin, normally `http://localhost:5173`

For local email testing, configure a valid Resend API key and sender using `RESEND_API_KEY` and `MAIL_FROM`. Email delivery is not available unless a provider is configured correctly.

Generate a session secret locally:

```bash
openssl rand -hex 32
```

Never commit `.env`, `.env.test`, API keys, database credentials, or session secrets.

### 3. Install dependencies

```bash
npm ci
cd frontend
npm ci
cd ..
```

### 4. Apply database migrations

Ensure the configured database is available, then run:

```bash
npm run db:migrate
```

Use a dedicated local development database and a least-privilege database role.

### 5. Start the application

In terminal one, start the API:

```bash
npm run dev
```

In terminal two, start the frontend:

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173**. The Vite development server proxies `/api` requests to the API, which defaults to `http://127.0.0.1:3000`.

## Environment Variables

See `.env.example` for the supported configuration.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Runtime environment; use `production` when deployed |
| `HOST` | Bind address; Render should use `0.0.0.0` |
| `PORT` | HTTP port |
| `DATABASE_URL` | PostgreSQL connection URL |
| `DB_POOL_MAX` | Maximum database connection pool size |
| `DB_CONNECT_TIMEOUT_MS` | Database connection timeout |
| `LOG_LEVEL` | Structured logging level |
| `FRONTEND_ORIGIN` | Exact trusted frontend origin |
| `SESSION_SECRET` | Random secret used for session-related security |
| `RESEND_API_KEY` | Resend API key for email delivery |
| `MAIL_FROM` | Sender identity accepted by Resend |

Do not commit real environment files. `.env.test.example` is a safe template for integration testing; copy it to `.env.test` and use only a dedicated database named `relayops_test`. Integration tests intentionally refuse to run against a database with a different name.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the API with Node watch mode |
| `npm start` | Start the API |
| `npm test` | Run the Vitest suite, including PostgreSQL integration tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:unit` | Run the unit and HTTP-focused test suite |
| `npm run check` | Perform basic Node.js syntax checks |
| `npm run db:migrate` | Apply SQL migrations |
| `npm run db:migrate:deploy` | Apply deployment migrations |
| `cd frontend && npm run dev` | Start the Vite development server |
| `cd frontend && npm run build` | Build the frontend for production |
| `cd frontend && npm run lint` | Lint frontend source |

For integration tests, configure `.env.test` using `.env.test.example` and ensure the dedicated `relayops_test` database is available.

## API Overview

### Health and readiness

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Process health check |
| `GET` | `/ready` | Database readiness check |

### Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/auth/csrf` | Initialize or retrieve the session CSRF token |
| `POST` | `/api/v1/auth/register` | Create an unverified account and send a six-digit OTP |
| `POST` | `/api/v1/auth/verify-email` | Verify the email OTP |
| `POST` | `/api/v1/auth/resend-verification` | Request another verification OTP |
| `POST` | `/api/v1/auth/login` | Authenticate and rotate the session ID |
| `GET` | `/api/v1/auth/me` | Retrieve the current session user |
| `POST` | `/api/v1/auth/logout` | End the current session |

Verification codes expire after 10 minutes and have a five-attempt limit. Registration does not automatically create a logged-in session; users must verify their email and then sign in.

### Teams and membership

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` / `POST` | `/api/v1/teams` | List or create teams |
| `GET` | `/api/v1/teams/:teamId/members` | List workspace members |
| `POST` | `/api/v1/teams/:teamId/members` | Add a verified user or send an invitation |
| `GET` | `/api/v1/teams/:teamId/invitations` | List pending invitations |
| `DELETE` | `/api/v1/teams/:teamId/invitations/:invitationId` | Cancel a pending invitation |
| `PATCH` | `/api/v1/teams/:teamId/members/:userId` | Change a member's role |
| `DELETE` | `/api/v1/teams/:teamId/members/:userId` | Remove a workspace member |

Role restrictions apply to membership operations: for example, role changes are owner-only, while certain membership and invitation actions are limited to owners and administrators.

### Incidents and webhooks

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` / `POST` | `/api/v1/teams/:teamId/incidents` | List or create incidents |
| `GET` / `PATCH` | `/api/v1/teams/:teamId/incidents/:incidentId` | Retrieve or update an incident |
| `POST` | `/api/v1/teams/:teamId/webhook-secret` | Generate/rotate a team webhook secret |
| `DELETE` | `/api/v1/teams/:teamId/webhook-secret` | Revoke a team webhook secret |
| `POST` | `/api/v1/webhooks/:teamId/events` | Ingest an external event |

Browser-facing state-changing routes require the `x-csrf-token` header. External webhook requests use the team's `x-webhook-secret` header instead.

## Webhook Example

Send an event to the team's webhook endpoint:

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

Replace the example team ID and secret with valid values from your environment. The event is deduplicated by `(team_id, source, external_event_id)`. The plaintext secret is shown only when generated; store it in the external provider's secret manager and never in source control or client-side code.

## Deployment

RelayOps is deployed as a **single Render Web Service** with a **Neon PostgreSQL** database. The frontend build and API are served from the same origin.

### Render build command

```bash
npm ci --include=dev && npm --prefix frontend ci --include=dev && npm --prefix frontend run build
```

### Render start command

```bash
npm run db:migrate:deploy && npm start
```

### Required Render environment variables

Set these in the Render dashboard rather than committing them to the repository:

```text
NODE_ENV=production
HOST=0.0.0.0
DATABASE_URL=<Neon PostgreSQL connection URL>
FRONTEND_ORIGIN=https://<your-service>.onrender.com
SESSION_SECRET=<random secret, at least 32 characters>
DB_POOL_MAX=5
DB_CONNECT_TIMEOUT_MS=10000
LOG_LEVEL=info
RESEND_API_KEY=<Resend API key>
MAIL_FROM=<sender identity permitted by your Resend account>
```

Use the exact Render service URL for `FRONTEND_ORIGIN`. Configure Resend with an eligible sender/domain and verify email delivery before relying on registration or invitation workflows.

After deployment, check:

- `/` — application dashboard
- `/health` — process health
- `/ready` — database readiness

The first deployment may require setting the final Render URL in `FRONTEND_ORIGIN` and redeploying. Render's free service may sleep after inactivity. Database migrations run during service startup, so review migration changes before deploying updates.

## Project Structure

```text
.
├── src/
│   ├── app.js                    # Express middleware and HTTP error handling
│   ├── server.js                 # Startup, dependency wiring, graceful shutdown
│   ├── config/                   # Environment, sessions, structured logging
│   ├── middleware/               # Authentication and CSRF
│   ├── db/                       # PostgreSQL pool and migration runner
│   └── modules/
│       ├── auth/                 # Account, session, email verification
│       ├── teams/                # Teams, membership, roles, webhook secrets
│       ├── incidents/            # Incident domain and audit transactions
│       └── webhooks/             # Authenticated, rate-limited event ingestion
├── migrations/                   # Ordered SQL schema migrations
├── tests/                        # Unit, HTTP, and PostgreSQL integration tests
└── frontend/
    └── src/                      # React/Vite operations dashboard
```

## Roadmap

Potential areas for future development:

- Improve email delivery reliability and document provider-specific limitations.
- Add richer incident timelines and filtering.
- Expand observability and operational metrics.
- Configure shared rate limiting before running multiple API instances.
- Add further integration and deployment checks.

## Contact

**Mazharul Islam** — Full-Stack Software Developer

- GitHub: [@mazhar1419](https://github.com/mazhar1419)
- LinkedIn: [mazhar1419](https://www.linkedin.com/in/mazhar1419)
- Project: [RelayOps repository](https://github.com/mazhar1419/RelayOps)
- Live demo: [relayops.onrender.com](https://relayops.onrender.com/)

---

<sub>Built as a practical full-stack engineering project focused on incident workflows, secure API design, data integrity, and team operations.</sub>
