
import pino from "pino";
import { env } from "./env.js";

export const logger = pino({
  level: env.logLevel,

  redact: {
    paths: [
      "password",
      "password_hash",
      "authorization",
      "cookie",
      "DATABASE_URL",
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers.x-webhook-secret",
      "req.headers.x-csrf-token",
      "req.headers.proxy-authorization",
    ],
    censor: "[REDACTED]",
  },

  base: {
    service: "relayops",
    environment: env.nodeEnv,
  },

  timestamp: pino.stdTimeFunctions.isoTime,
});
