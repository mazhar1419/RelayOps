import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pool } from "./pool.js";
import { logger } from "../config/logger.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(currentDirectory, "../../migrations");

const migrationFilenamePattern = /^\d{3,}_[a-z0-9_]+\.sql$/;

function calculateChecksum(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function runMigrations() {
  const client = await pool.connect();
  let lockAcquired = false;

  try {
    // Prevent two migration runners from changing the schema concurrently.
    await client.query("SELECT pg_advisory_lock($1, $2)", [74121, 1]);
    lockAcquired = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const filenames = (await readdir(migrationsDirectory))
      .filter((filename) => migrationFilenamePattern.test(filename))
      .sort();

    const appliedResult = await client.query(`
      SELECT filename, checksum
      FROM public.schema_migrations
    `);

    const appliedMigrations = new Map(
      appliedResult.rows.map((row) => [row.filename, row.checksum]),
    );

    for (const filename of filenames) {
      const fullPath = path.join(migrationsDirectory, filename);
      const sql = await readFile(fullPath, "utf8");
      const checksum = calculateChecksum(sql);

      const existingChecksum = appliedMigrations.get(filename);

      if (existingChecksum) {
        if (existingChecksum !== checksum) {
          throw new Error(
            `Applied migration was modified: ${filename}. ` +
            "Create a new migration instead of editing an applied one.",
          );
        }

        logger.info({ filename }, "Migration already applied; skipping");
        continue;
      }

      logger.info({ filename }, "Applying migration");

      await client.query("BEGIN");

      try {
        await client.query(sql);

        await client.query(
          `INSERT INTO public.schema_migrations (filename, checksum)
           VALUES ($1, $2)`,
          [filename, checksum],
        );

        await client.query("COMMIT");
        logger.info({ filename }, "Migration applied successfully");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    logger.info({ count: filenames.length }, "Migration run completed");
  } finally {
    try {
      if (lockAcquired) {
        await client.query("SELECT pg_advisory_unlock($1, $2)", [74121, 1]);
      }
    } finally {
      client.release();
      await pool.end();
    }
  }
}

try {
  await runMigrations();
} catch (error) {
  logger.fatal({ err: error }, "Migration run failed");
  process.exitCode = 1;
}