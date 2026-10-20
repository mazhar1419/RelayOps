import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { pool, checkDatabase } from "./db/pool.js";
import { createApp } from "./app.js";
import { authenticate } from "./middleware/authenticate.js";

import { createAuthRepository } from "./modules/auth/auth.repository.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { createIncidentRepository } from "./modules/incidents/incident.repository.js";
import { createIncidentService } from "./modules/incidents/incident.service.js";
import { createIncidentRouter } from "./modules/incidents/incident.routes.js";
import { createTeamRepository } from "./modules/teams/team.repository.js";
import { createTeamService } from "./modules/teams/team.service.js";
import { createTeamRouter } from "./modules/teams/team.routes.js";
import { createTeamWebhookSecretRepository } from "./modules/teams/team-webhook-secret.repository.js";
import { createTeamWebhookSecretService } from "./modules/teams/team-webhook-secret.service.js";
import { createWebhookRepository } from "./modules/webhooks/webhook.repository.js";
import { createWebhookService } from "./modules/webhooks/webhook.service.js";
import { createWebhookRouter } from "./modules/webhooks/webhook.routes.js";

const authRepository = createAuthRepository(pool);
const incidentRepository = createIncidentRepository(pool);
const incidentService = createIncidentService(pool, incidentRepository);
const teamRepository = createTeamRepository(pool);
const teamService = createTeamService(pool, teamRepository);
const teamWebhookSecretRepository = createTeamWebhookSecretRepository();
const teamWebhookSecretService = createTeamWebhookSecretService(pool, teamWebhookSecretRepository);
const webhookRepository = createWebhookRepository();
const webhookService = createWebhookService(pool, webhookRepository, incidentRepository);

const app = createApp({
  checkDatabase,
  authRouter: createAuthRouter(authRepository),
  incidentRouter: createIncidentRouter(incidentService, authenticate),
  teamRouter: createTeamRouter(teamService, authenticate, teamWebhookSecretService),
  webhookRouter: createWebhookRouter(webhookService, teamWebhookSecretService),
});

const server = app.listen(env.port, env.host, () => {
  logger.info({ host: env.host, port: env.port }, "RelayOps API listening");
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Graceful shutdown started");
  server.close(async (error) => {
    if (error) logger.error({ err: error }, "HTTP server close failed");
    try {
      await pool.end();
      logger.info("Database pool closed");
      process.exitCode = error ? 1 : 0;
    } catch (poolError) {
      logger.error({ err: poolError }, "Database pool shutdown failed");
      process.exitCode = 1;
    }
  });
  setTimeout(() => {
    logger.error("Graceful shutdown timed out; forcing exit");
    process.exit(1);
  }, 10_000).unref();
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
