import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { sessionMiddleware } from "./config/session.js";
import { csrfTokenHandler, requireCsrfToken } from "./middleware/csrf.js";

export function createApp({
  checkDatabase,
  authRouter = null,
  incidentRouter = null,
  teamRouter = null,
  webhookRouter = null,
  sessionMiddleware: sessionHandler = sessionMiddleware,
}) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(pinoHttp({
    logger,
    genReqId: () => randomUUID(),
    customProps: (req) => ({ requestId: req.id }),
  }));
  app.use((req, res, next) => {
    res.setHeader("x-request-id", req.id);
    next();
  });
  app.use(express.json({ limit: "1mb", strict: true }));
  app.use(cors({ origin: env.frontendOrigin, credentials: true }));
  app.use(sessionHandler);

  app.get("/api/v1/auth/csrf", csrfTokenHandler);

  // Provider-to-server webhooks use team-specific secrets, not browser CSRF tokens.
  if (webhookRouter) app.use("/api/v1/webhooks", webhookRouter);

  // All browser-facing state-changing requests require the session CSRF token.
  app.use(requireCsrfToken);
  if (authRouter) app.use("/api/v1/auth", authRouter);
  if (incidentRouter) app.use("/api/v1", incidentRouter);
  if (teamRouter) app.use("/api/v1/teams", teamRouter);

  app.get("/health", (req, res) => res.status(200).json({
    status: "ok",
    requestId: req.id,
  }));

  app.get("/ready", async (req, res) => {
    try {
      await checkDatabase();
      return res.status(200).json({
        status: "ready",
        database: "connected",
        requestId: req.id,
      });
    } catch (error) {
      req.log.error({ err: error }, "Readiness check failed");
      return res.status(503).json({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Service temporarily unavailable",
        },
        requestId: req.id,
      });
    }
  });

  app.use((req, res) => res.status(404).json({
    error: { code: "NOT_FOUND", message: "Route not found" },
    requestId: req.id,
  }));

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    req.log.error({ err: error }, "Unhandled application error");

    const malformedJson = error instanceof SyntaxError &&
      error.status === 400 && Object.hasOwn(error, "body");
    if (malformedJson) {
      return res.status(400).json({
        error: { code: "INVALID_JSON", message: "Request body contains invalid JSON" },
        requestId: req.id,
      });
    }

    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
      ? error.status
      : 500;
    const fallbackCodes = {
      400: "BAD_REQUEST",
      401: "UNAUTHORIZED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT",
      413: "PAYLOAD_TOO_LARGE",
      422: "UNPROCESSABLE_ENTITY",
      429: "TOO_MANY_REQUESTS",
    };
    const code = typeof error.code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/.test(error.code)
      ? error.code
      : fallbackCodes[status] || "INTERNAL_ERROR";

    return res.status(status).json({
      error: {
        code,
        message: status < 500 ? error.message : "An unexpected error occurred",
      },
      requestId: req.id,
    });
  });

  return app;
}
