import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createApp } from "../src/app.js";
import { createWebhookRouter } from "../src/modules/webhooks/webhook.routes.js";

const SECRET = "test-webhook-secret-at-least-32-chars";

function createTestApp() {
  const service = {
    receive: vi.fn().mockResolvedValue({
      duplicate: false,
      event: {
        id: 501,
        incident_id: 101,
      },
      incident: {
        id: 101,
      },
    }),
  };

  const secretService = {
    verify: vi.fn(async (teamId, receivedSecret) => {
      return teamId === 1 && receivedSecret === SECRET;
    }),
  };

  const webhookRouter = createWebhookRouter(
    service,
    secretService,
  );

  const app = createApp({
    checkDatabase: vi.fn().mockResolvedValue(undefined),
    webhookRouter,
    sessionMiddleware: (_req, _res, next) => next(),
  });

  return { app, service, secretService };
}

const validPayload = {
  source: "monitoring",
  externalEventId: "server-42-down",
  title: "Production server is down",
  description: "Health check failed",
  severity: "critical",
};

describe("Webhook HTTP API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a request without a webhook secret", async () => {
    const { app, service, secretService } = createTestApp();

    const response = await request(app)
      .post("/api/v1/webhooks/1/events")
      .send(validPayload);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_WEBHOOK_SECRET");
    expect(secretService.verify).toHaveBeenCalledWith(1, undefined);
    expect(service.receive).not.toHaveBeenCalled();
  });

  it("rejects an incorrect webhook secret", async () => {
    const { app, service, secretService } = createTestApp();

    const response = await request(app)
      .post("/api/v1/webhooks/1/events")
      .set("x-webhook-secret", "incorrect-secret")
      .send(validPayload);

    expect(response.status).toBe(401);
    expect(secretService.verify).toHaveBeenCalledWith(
      1,
      "incorrect-secret",
    );
    expect(service.receive).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload", async () => {
    const { app, service, secretService } = createTestApp();

    const response = await request(app)
      .post("/api/v1/webhooks/1/events")
      .set("x-webhook-secret", SECRET)
      .send({
        ...validPayload,
        severity: "emergency",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(secretService.verify).toHaveBeenCalledWith(1, SECRET);
    expect(service.receive).not.toHaveBeenCalled();
  });

  it("accepts a valid event and returns 201", async () => {
    const { app, service, secretService } = createTestApp();

    const response = await request(app)
      .post("/api/v1/webhooks/1/events")
      .set("x-webhook-secret", SECRET)
      .send(validPayload);

    expect(response.status).toBe(201);
    expect(response.body.data).toEqual({
      duplicate: false,
      eventId: 501,
      incidentId: 101,
    });

    expect(secretService.verify).toHaveBeenCalledWith(1, SECRET);
    expect(service.receive).toHaveBeenCalledOnce();

    expect(service.receive).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 1,
        source: validPayload.source,
        externalEventId: validPayload.externalEventId,
        title: validPayload.title,
        severity: validPayload.severity,
        payload: expect.objectContaining(validPayload),
      }),
    );
  });

  it("returns 200 for a duplicate event", async () => {
    const { app, service } = createTestApp();

    service.receive.mockResolvedValue({
      duplicate: true,
      event: {
        id: 501,
        incident_id: 101,
      },
      incident: null,
    });

    const response = await request(app)
      .post("/api/v1/webhooks/1/events")
      .set("x-webhook-secret", SECRET)
      .send(validPayload);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      duplicate: true,
      eventId: 501,
      incidentId: 101,
    });
  });
});
