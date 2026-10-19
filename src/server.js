import http from "node:http";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { pool, checkDatabase } from "./db/pool.js";
import { createApp } from "./app.js";

import { createAuthRepository } from "./modules/auth/auth.repository.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { authenticate } from "./middleware/authenticate.js";

import { createIncidentRepository } from "./modules/incidents/incident.repository.js";
import { createIncidentService } from "./modules/incidents/incident.service.js";
import { createIncidentRouter } from "./modules/incidents/incident.routes.js";

import { createTeamRepository } from './modules/teams/team.repository.js'
import { createTeamService } from './modules/teams/team.service.js'
import { createTeamRouter } from './modules/teams/team.routes.js'


const authRepository = createAuthRepository(pool);
const authRouter = createAuthRouter(authRepository);

const incidentRepository = createIncidentRepository(pool);
const incidentService = createIncidentService(pool, incidentRepository);

const incidentRouter = createIncidentRouter(
  incidentService,
  authenticate,
);

const teamRepository = createTeamRepository(pool)
const teamService = createTeamService(pool, teamRepository)
const teamRouter = createTeamRouter(teamService, authenticate)

const app = createApp({
  checkDatabase,
  authRouter,
  incidentRouter,
  teamRouter,
});
const server = http.createServer(app);

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "Graceful shutdown started");

  const forceExit = setTimeout(() => {
    logger.fatal("Graceful shutdown timed out");
    process.exit(1);
  }, 10_000);

  forceExit.unref();

  server.close(async (error) => {
    try {
      await pool.end();

      if (error) {
        logger.error({ err: error }, "HTTP server shutdown failed");
        process.exitCode = 1;
      } else {
        logger.info("Graceful shutdown completed");
      }
    } catch (dbError) {
      logger.error({ err: dbError }, "Database pool shutdown failed");
      process.exitCode = 1;
    } finally {
      clearTimeout(forceExit);
    }
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await checkDatabase();

  server.listen(env.port, env.host, () => {
    logger.info(
      {
        host: env.host,
        port: env.port,
      },
      "RelayOps server started",
    );
  });
} catch (error) {
  logger.fatal({ err: error }, "RelayOps startup failed");

  await pool.end().catch(() => {});
  process.exitCode = 1;
}