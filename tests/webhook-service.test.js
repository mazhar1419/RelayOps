
import { describe, expect, it, vi } from "vitest";
import { createWebhookService } from "../src/modules/webhooks/webhook.service.js";

function createTestContext() {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };

  const pool = {
    connect: vi.fn().mockResolvedValue(client),
  };

  const incident = {
    id: 101,
    team_id: 1,
    title: "Production server is down",
    severity: "critical",
    status: "open",
    version: 1,
  };

  const event = {
    id: 501,
    team_id: 1,
    source: "monitoring",
    external_event_id: "server-42-down",
    payload: {
      title: "Production server is down",
    },
    incident_id: null,
  };

  const webhookRepository = {
    createEvent: vi.fn().mockResolvedValue(event),

    findExistingEvent: vi.fn().mockResolvedValue(null),

    attachIncident: vi.fn().mockImplementation(
      async (_client, _teamId, _eventId, incidentId) => ({
        ...event,
        incident_id: incidentId,
      }),
    ),
  };

  const incidentRepository = {
    create: vi.fn().mockResolvedValue(incident),
  };

  const service = createWebhookService(
    pool,
    webhookRepository,
    incidentRepository,
  );

  const input = {
    teamId: 1,
    source: "monitoring",
    externalEventId: "server-42-down",
    title: "Production server is down",
    description: "Health check failed",
    severity: "critical",
    payload: {
      title: "Production server is down",
    },
  };

  return {
    client,
    event,
    incident,
    input,
    webhookRepository,
    incidentRepository,
    service,
  };
}

describe("Webhook service", () => {
  it("creates one incident for a new event", async () => {
    const {
      service,
      input,
      incident,
      incidentRepository,
      webhookRepository,
      client,
    } = createTestContext();

    const result = await service.receive(input);

    expect(result.duplicate).toBe(false);
    expect(result.incident).toEqual(incident);
    expect(webhookRepository.createEvent).toHaveBeenCalledOnce();
    expect(incidentRepository.create).toHaveBeenCalledOnce();
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("does not create an incident for a duplicate event", async () => {
    const {
      service,
      input,
      event,
      incidentRepository,
      webhookRepository,
      client,
    } = createTestContext();

    webhookRepository.createEvent.mockResolvedValue(null);
    webhookRepository.findExistingEvent.mockResolvedValue({
      ...event,
      incident_id: 77,
    });

    const result = await service.receive(input);

    expect(result.duplicate).toBe(true);
    expect(result.event.incident_id).toBe(77);
    expect(result.incident).toBeNull();

    expect(incidentRepository.create).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });

  it("rolls back when incident creation fails", async () => {
    const { service, input, incidentRepository, client } =
      createTestContext();

    incidentRepository.create.mockRejectedValue(
      new Error("Incident storage unavailable"),
    );

    await expect(service.receive(input)).rejects.toThrow(
      "Incident storage unavailable",
    );

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back when audit logging fails", async () => {
    const { service, input, client } = createTestContext();

    client.query.mockImplementation(async (sql) => {
      if (sql.includes("INSERT INTO audit_logs")) {
        throw new Error("Audit storage unavailable");
      }

      return { rows: [] };
    });

    await expect(service.receive(input)).rejects.toThrow(
      "Audit storage unavailable",
    );

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
