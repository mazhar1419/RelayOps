import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { env } from "../src/config/env.js";
import { createTeamWebhookSecretRepository } from "../src/modules/teams/team-webhook-secret.repository.js";
import { createTeamWebhookSecretService } from "../src/modules/teams/team-webhook-secret.service.js";

const { Pool } = pg;

describe("Team webhook secret PostgreSQL integration", () => {
  let pool;
  let teamId;
  let service;
  let source;

  beforeAll(async () => {
    if (env.nodeEnv !== "test") {
      throw new Error("Integration tests require NODE_ENV=test");
    }

    const url = new URL(env.databaseUrl);

    if (url.pathname !== "/relayops_test") {
      throw new Error(
        "Refusing to run against a database other than relayops_test",
      );
    }

    pool = new Pool({ connectionString: env.databaseUrl });

    const repository = createTeamWebhookSecretRepository();
    service = createTeamWebhookSecretService(pool, repository);

    source = `secret-integration-${process.pid}-${Date.now()}`;

    const result = await pool.query(
      `INSERT INTO teams (name)
       VALUES ($1)
       RETURNING id`,
      [source],
    );

    teamId = result.rows[0].id;
  });

  afterAll(async () => {
    if (!pool) return;

    try {
      if (teamId !== undefined) {
        await pool.query(
          "DELETE FROM team_webhook_secrets WHERE team_id = $1",
          [teamId],
        );

        await pool.query(
          "DELETE FROM audit_logs WHERE team_id = $1",
          [teamId],
        );

        await pool.query(
          "DELETE FROM webhook_events WHERE team_id = $1",
          [teamId],
        );

        await pool.query(
          "DELETE FROM incidents WHERE team_id = $1",
          [teamId],
        );

        await pool.query(
          "DELETE FROM teams WHERE id = $1",
          [teamId],
        );
      }
    } finally {
      await pool.end();
    }
  });

  it("generates a secret and stores only its hash", async () => {
    const result = await service.rotate(Number(teamId));

    expect(result.teamId).toBeDefined();
    expect(result.secret).toMatch(/^[a-f0-9]{64}$/);

    const stored = await pool.query(
      `SELECT secret_hash
       FROM team_webhook_secrets
       WHERE team_id = $1`,
      [teamId],
    );

    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].secret_hash).not.toBe(result.secret);
    expect(stored.rows[0].secret_hash).toMatch(/^[a-f0-9]{64}$/);

    expect(await service.verify(Number(teamId), result.secret)).toBe(true);
  });

  it("rejects an incorrect secret and a secret belonging to another team", async () => {
    const result = await service.rotate(Number(teamId));

    expect(
      await service.verify(Number(teamId), "incorrect-secret"),
    ).toBe(false);

    const otherTeam = await pool.query(
      `INSERT INTO teams (name)
       VALUES ($1)
       RETURNING id`,
      [`${source}-other`],
    );

    const otherTeamId = otherTeam.rows[0].id;

    try {
      expect(
        await service.verify(Number(otherTeamId), result.secret),
      ).toBe(false);
    } finally {
      await pool.query("DELETE FROM teams WHERE id = $1", [otherTeamId]);
    }
  });

  it("invalidates the previous secret after rotation", async () => {
    const first = await service.rotate(Number(teamId));
    const second = await service.rotate(Number(teamId));

    expect(second.secret).not.toBe(first.secret);

    expect(
      await service.verify(Number(teamId), first.secret),
    ).toBe(false);

    expect(
      await service.verify(Number(teamId), second.secret),
    ).toBe(true);
  });

  it("revokes the secret and rejects it afterward", async () => {
    const result = await service.rotate(Number(teamId));

    expect(await service.revoke(Number(teamId))).toBe(true);
    expect(await service.verify(Number(teamId), result.secret)).toBe(false);
    expect(await service.revoke(Number(teamId))).toBe(false);
  });

  it("returns 404 when rotating a secret for a nonexistent team", async () => {
    await expect(service.rotate(999999999)).rejects.toMatchObject({
      status: 404,
      message: "Team not found",
    });
  });
});