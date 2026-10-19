
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import session from "express-session";

import { createApp } from "../src/app.js";
import { authenticate } from "../src/middleware/authenticate.js";
import { createIncidentRouter } from "../src/modules/incidents/incident.routes.js";
import { createIncidentService } from "../src/modules/incidents/incident.service.js";

function createTestContext({ userId = null, role = null } = {}) {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };

  const pool = {
    connect: vi.fn().mockResolvedValue(client),
  };

  const repository = {
    findTeamMembership: vi.fn(async (_client, teamId, actorId) => {
      if (teamId === 1 && actorId === 20 && role) {
        return { role };
      }

      return null;
    }),

    list: vi.fn().mockResolvedValue([]),

    create: vi.fn().mockResolvedValue({
      id: 101,
      title: "Test incident",
      severity: "low",
      status: "open",
      version: 1,
    }),

    findById: vi.fn().mockResolvedValue({
      id: 101,
      title: "Test incident",
      severity: "low",
      status: "open",
      version: 1,
    }),

    update: vi.fn(),
  };

  const service = createIncidentService(pool, repository);
  const incidentRouter = createIncidentRouter(service, authenticate);

  const storeSession = session({
    secret: "test-only-session-secret-that-is-long-enough",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    },
  });

  const sessionMiddleware = (req, res, next) => {
    storeSession(req, res, () => {
      if (userId !== null) {
        req.session.userId = userId;
      }

      next();
    });
  };

  const app = createApp({
    checkDatabase: vi.fn().mockResolvedValue(undefined),
    incidentRouter,
    sessionMiddleware,
  });

  return {
    agent: request.agent(app),
    repository,
  };
}

async function getCsrfToken(agent) {
  const response = await agent.get("/api/v1/auth/csrf");

  expect(response.status).toBe(200);
  expect(response.body.csrfToken).toMatch(/^[a-f0-9]{64}$/);

  return response.body.csrfToken;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Incident HTTP authorization", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const { agent, repository } = createTestContext();

    const response = await agent.get("/api/v1/teams/1/incidents");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHENTICATED");
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("rejects a user who is not a team member with 403", async () => {
    const { agent, repository } = createTestContext({
      userId: 99,
    });

    const response = await agent.get("/api/v1/teams/1/incidents");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("allows a viewer to list incidents", async () => {
    const { agent, repository } = createTestContext({
      userId: 20,
      role: "viewer",
    });

    const response = await agent.get("/api/v1/teams/1/incidents");

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(repository.list).toHaveBeenCalled();
  });

  it("rejects a viewer attempting to update an incident", async () => {
    const { agent, repository } = createTestContext({
      userId: 20,
      role: "viewer",
    });

    const csrfToken = await getCsrfToken(agent);

    const response = await agent
      .patch("/api/v1/teams/1/incidents/101")
      .set("x-csrf-token", csrfToken)
      .send({
        status: "resolved",
        version: 1,
      });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(repository.update).not.toHaveBeenCalled();
  });
});
