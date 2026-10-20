import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  HOST: z.string().min(1).default("127.0.0.1"),

  PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  DATABASE_URL: z.string().url().refine(
    (value) =>
      ["postgres:", "postgresql:"].includes(new URL(value).protocol),
    "DATABASE_URL must be a PostgreSQL URL",
  ),

  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

  DB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),

  FRONTEND_ORIGIN: z.string().url(),

  SESSION_SECRET: z.string().min(32),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment configuration:", result.error.issues);
  throw new Error("Environment configuration is invalid");
}

export const env = Object.freeze({
  nodeEnv: result.data.NODE_ENV,
  host: result.data.HOST,
  port: result.data.PORT,
  databaseUrl: result.data.DATABASE_URL,
  dbPoolMax: result.data.DB_POOL_MAX,
  dbConnectTimeoutMs: result.data.DB_CONNECT_TIMEOUT_MS,
  logLevel: result.data.LOG_LEVEL,
  frontendOrigin: result.data.FRONTEND_ORIGIN,
  sessionSecret: result.data.SESSION_SECRET,
});