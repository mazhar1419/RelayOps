
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

import { env } from "../src/config/env.js";
import { createIncidentRepository } from "../src/modules/incidents/incident.repository.js";
import { createWebhookRepository } from "../src/modules/webhooks/webhook.repository.js";
import { createWebhookService } from "../src/modules/webhooks/webhook.service.js";

const { Pool } = pg;

describe("Webhook PostgreSQL integration", () => {
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
      throw new Error("Refusing to run against a database other than relayops_test");
    }

    pool = new Pool({ connectionString: env.databaseUrl });

    const incidentRepository = createIncidentRepository(pool);
    const webhookRepository = createWebhookRepository();

    service = createWebhookService(
      pool,
      webhookRepository,
      incidentRepository,
    );

    source = `integration-${process.pid}-${Date.now()}`;

    const result = await pool.query(
      `INSERT INTO teams (name)
       VALUES ($1)
       RETURNING id`,
      [`Webhook integration test ${source}`],
    );

    teamId = result.rows[0].id;
  });

  afterAll(async () => {
    if (!pool) return;

    if (teamId !== undefined) {
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

    await pool.end();
  });

  it("persists an event, its incident, and its audit log", async () => {
    const result = await service.receive({
      teamId: Number(teamId),
      source,
      externalEventId: "event-1",
      title: "Integration test incident",
      description: "Created by PostgreSQL integration test",
      severity: "critical",
      payload: {
        externalEventId: "event-1",
        message: "Test alert",
      },
    });

    expect(result.duplicate).toBe(false);
    expect(result.incident.id).toBeDefined();
    expect(result.event.incident_id).toBe(result.incident.id);

    const eventRows = await pool.query(
      `SELECT id, incident_id, payload
       FROM webhook_events
       WHERE team_id = $1
         AND source = $2
         AND external_event_id = $3`,
      [teamId, source, "event-1"],
    );

    expect(eventRows.rows).toHaveLength(1);
    expect(eventRows.rows[0].incident_id).toBe(result.incident.id);
    expect(eventRows.rows[0].payload.message).toBe("Test alert");

    const incidentRows = await pool.query(
      `SELECT id, title, severity
       FROM incidents
       WHERE team_id = $1 AND id = $2`,
      [teamId, result.incident.id],
    );

    expect(incidentRows.rows).toHaveLength(1);
    expect(incidentRows.rows[0].title).toBe("Integration test incident");
    expect(incidentRows.rows[0].severity).toBe("critical");

    const auditRows = await pool.query(
      `SELECT action, metadata
       FROM audit_logs
       WHERE team_id = $1 AND incident_id = $2`,
      [teamId, result.incident.id],
    );

    expect(auditRows.rows).toHaveLength(1);
    expect(auditRows.rows[0].action).toBe("incident.created");
    expect(auditRows.rows[0].metadata.origin).toBe("webhook");
  });

  it("does not create a second incident for a duplicate event", async () => {
    const input = {
      teamId: Number(teamId),
      source,
      externalEventId: "event-duplicate",
      title: "Duplicate integration event",
      severity: "high",
      payload: { message: "Duplicate test" },
    };

    const first = await service.receive(input);
    const second = await service.receive(input);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.event.id).toBe(first.event.id);

    const result = await pool.query(
      `SELECT
         (SELECT count(*)::int
          FROM webhook_events
          WHERE team_id = $1 AND source = $2 AND external_event_id = $3)
            AS event_count,
         (SELECT count(*)::int
          FROM incidents
          WHERE team_id = $1 AND title = $4)
            AS incident_count,
         (SELECT count(*)::int
          FROM audit_logs
          WHERE team_id = $1 AND metadata->>'externalEventId' = $3)
            AS audit_count`,
      [teamId, source, "event-duplicate", input.title],
    );

    expect(result.rows[0].event_count).toBe(1);
    expect(result.rows[0].incident_count).toBe(1);
    expect(result.rows[0].audit_count).toBe(1);
  });


  it("rolls back the event and incident when audit logging fails", async () => {
    const failingPool = {
      connect: async () => {
        const client = await pool.connect();
        const originalQuery = client.query.bind(client);

        client.query = async (...args) => {
          const sql = typeof args[0] === "string" ? args[0] : "";

          if (sql.includes("INSERT INTO audit_logs")) {
            const error = new Error("Simulated audit failure");
            error.code = "TEST_AUDIT_FAILURE";
            throw error;
          }

          return originalQuery(...args);
        };

        return client;
      },
    };

    const failingService = createWebhookService(
      failingPool,
      createWebhookRepository(),
      createIncidentRepository(pool),
    );

    const externalEventId = "event-rollback";

    await expect(
      failingService.receive({
        teamId: Number(teamId),
        source,
        externalEventId,
        title: "Rollback integration test",
        severity: "high",
        payload: { message: "This event must be rolled back" },
      }),
    ).rejects.toThrow("Simulated audit failure");

    const result = await pool.query(
      `SELECT
         (SELECT count(*)::int
          FROM webhook_events
          WHERE team_id = $1 AND source = $2 AND external_event_id = $3)
            AS event_count,
         (SELECT count(*)::int
          FROM incidents
          WHERE team_id = $1 AND title = $4)
            AS incident_count,
         (SELECT count(*)::int
          FROM audit_logs
          WHERE team_id = $1 AND metadata->>'externalEventId' = $3)
            AS audit_count`,
      [teamId, source, externalEventId, "Rollback integration test"],
    );

    expect(result.rows[0]).toEqual({
      event_count: 0,
      incident_count: 0,
      audit_count: 0,
    });
  });

});
