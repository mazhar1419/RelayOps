import { describe, it, expect, vi } from "vitest";
import request from "supertest";

import { createApp } from "../src/app.js";

describe("RelayOps health endpoints", () => {
  it("GET /health returns a healthy response", async () => {
    const app = createApp({
      checkDatabase: vi.fn(),
    });

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.requestId).toBeTruthy();
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("GET /ready returns ready when database check succeeds", async () => {
    const checkDatabase = vi.fn().mockResolvedValue(undefined);
    const app = createApp({ checkDatabase });

    const response = await request(app).get("/ready");

    expect(response.status).toBe(200);
    expect(response.body.database).toBe("connected");
    expect(checkDatabase).toHaveBeenCalledOnce();
  });

  it("GET /ready returns 503 when database check fails", async () => {
    const checkDatabase = vi.fn().mockRejectedValue(
      new Error("Database unavailable"),
    );

    const app = createApp({ checkDatabase });
    const response = await request(app).get("/ready");

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("unknown routes return 404", async () => {
    const app = createApp({
      checkDatabase: vi.fn(),
    });

    const response = await request(app).get("/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});