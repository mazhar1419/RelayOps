import pg from "pg";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.dbPoolMax,
  connectionTimeoutMillis: env.dbConnectTimeoutMs,
  idleTimeoutMillis: 30_000,
  application_name: "relayops",
});

pool.on("error", (error) => {
  logger.error(
    { err: error },
    "Unexpected error on an idle PostgreSQL client",
  );
});

export async function checkDatabase() {
  const result = await pool.query("SELECT 1 AS ok");

  if (result.rows[0]?.ok !== 1) {
    throw new Error("Database health check returned an unexpected result");
  }
}