# RelayOps frontend

Retro-inspired, responsive React dashboard for the RelayOps incident response API.

## Run locally

From this directory:

```bash
npm ci
npm run dev
```

The Vite server runs at `http://localhost:5173` and proxies `/api` to `http://127.0.0.1:3000`. Start the backend first and configure its `.env` file using the root `.env.example`.

## Build and lint

```bash
npm run build
npm run lint
```

The production build is written to `dist/`. The interface includes account registration/login, workspace creation and switching, incident creation/status management, operational overview metrics, and team-scoped webhook secret rotation/revocation. The plaintext webhook secret is displayed only immediately after rotation; store it securely before navigating away.
