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
    ],
    censor: "[REDACTED]",
  },

  base: {
    service: "relayops",
    environment: env.nodeEnv,
  },

  timestamp: pino.stdTimeFunctions.isoTime,
});