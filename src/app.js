import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";

import { logger } from "./config/logger.js";

export function createApp({ checkDatabase }) {
  const app = express();

  app.disable("x-powered-by");

  app.use(helmet());

  app.use(
    pinoHttp({
      logger,
      genReqId: () => randomUUID(),
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
      ],
    }),
  );

  app.use((req, res, next) => {
  res.setHeader("x-request-id", req.id);
  next();
});

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      requestId: req.id,
    });
  });

  app.get("/ready", async (req, res) => {
    try {
      await checkDatabase();

      res.status(200).json({
        status: "ready",
        database: "connected",
        requestId: req.id,
      });
    } catch (error) {
      req.log.error({ err: error }, "Readiness check failed");

      res.status(503).json({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Service temporarily unavailable",
        },
        requestId: req.id,
      });
    }
  });

  app.use((req, res) => {
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
      requestId: req.id,
    });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }

    req.log.error({ err: error }, "Unhandled application error");

    const isMalformedJson =
      error instanceof SyntaxError &&
      error.status === 400 &&
      "body" in error;

    if (isMalformedJson) {
      return res.status(400).json({
        error: {
          code: "INVALID_JSON",
          message: "Request body contains invalid JSON",
        },
        requestId: req.id,
      });
    }

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
      },
      requestId: req.id,
    });
  });

  return app;
}