import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

import { createTeamRouter } from "../src/modules/teams/team.routes.js";
import { createTeamService } from "../src/modules/teams/team.service.js";

const TEAM_ID = 7;
const USER_ID = 21;
const SECRET = "a".repeat(64);

function createTestApp({ role = "owner", teamExists = true } = {}) {
  const repository = {
    findForUser: vi.fn(async (teamId, userId) => {
      if (!teamExists || teamId !== TEAM_ID || userId !== USER_ID) {
        return null;
      }

      return {
        id: TEAM_ID,
        name: "Test team",
        role,
      };
    }),
  };

  const teamService = createTeamService({}, repository);

  const webhookSecretService = {
    rotate: vi.fn().mockResolvedValue({
      teamId: TEAM_ID,
      secret: SECRET,
    }),
    revoke: vi.fn().mockResolvedValue(true),
  };

  const authenticate = (req, res, next) => {
    const userId = req.get("x-test-user-id");

    if (!userId) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED" },
      });
    }

    req.auth = { userId: Number(userId) };
    next();
  };

  const app = express();
  app.use(express.json());

  app.use(
    "/teams",
    createTeamRouter(
      teamService,
      authenticate,
      webhookSecretService,
    ),
  );

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);

    res.status(error.status ?? 500).json({
      error: {
        code: error.code ?? "INTERNAL_ERROR",
        message: error.message,
      },
    });
  });

  return { app, teamService, webhookSecretService };
}

describe("Team webhook secret HTTP API", () => {
  it("rejects unauthenticated requests", async () => {
    const { app, webhookSecretService } = createTestApp();

    const response = await request(app)
      .post(`/teams/${TEAM_ID}/webhook-secret`);

    expect(response.status).toBe(401);
    expect(webhookSecretService.rotate).not.toHaveBeenCalled();
  });

  it.each(["owner", "admin"])(
    "allows %s to rotate a team webhook secret",
    async (role) => {
      const { app, webhookSecretService } = createTestApp({ role });

      const response = await request(app)
        .post(`/teams/${TEAM_ID}/webhook-secret`)
        .set("x-test-user-id", String(USER_ID));

      expect(response.status).toBe(201);
      expect(response.body.data).toEqual({
        teamId: TEAM_ID,
        secret: SECRET,
      });

      expect(webhookSecretService.rotate).toHaveBeenCalledOnce();
      expect(webhookSecretService.rotate).toHaveBeenCalledWith(TEAM_ID);
    },
  );

  it.each(["responder", "viewer"])(
    "rejects %s from rotating a webhook secret",
    async (role) => {
      const { app, webhookSecretService } = createTestApp({ role });

      const response = await request(app)
        .post(`/teams/${TEAM_ID}/webhook-secret`)
        .set("x-test-user-id", String(USER_ID));

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(
        "INSUFFICIENT_TEAM_PERMISSIONS",
      );
      expect(webhookSecretService.rotate).not.toHaveBeenCalled();
    },
  );

  it("returns 404 when the user does not belong to the team", async () => {
    const { app, webhookSecretService } = createTestApp({
      teamExists: false,
    });

    const response = await request(app)
      .post(`/teams/${TEAM_ID}/webhook-secret`)
      .set("x-test-user-id", String(USER_ID));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("TEAM_NOT_FOUND");
    expect(webhookSecretService.rotate).not.toHaveBeenCalled();
  });

  it("allows an owner to revoke a webhook secret", async () => {
    const { app, webhookSecretService } = createTestApp();

    const response = await request(app)
      .delete(`/teams/${TEAM_ID}/webhook-secret`)
      .set("x-test-user-id", String(USER_ID));

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      teamId: TEAM_ID,
      revoked: true,
    });

    expect(webhookSecretService.revoke).toHaveBeenCalledOnce();
    expect(webhookSecretService.revoke).toHaveBeenCalledWith(TEAM_ID);
  });

  it("returns 404 when there is no active secret to revoke", async () => {
    const { app, webhookSecretService } = createTestApp();

    webhookSecretService.revoke.mockResolvedValue(false);

    const response = await request(app)
      .delete(`/teams/${TEAM_ID}/webhook-secret`)
      .set("x-test-user-id", String(USER_ID));

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("WEBHOOK_SECRET_NOT_FOUND");
  });

  it("rejects an invalid team ID", async () => {
    const { app, webhookSecretService } = createTestApp();

    const response = await request(app)
      .post("/teams/0/webhook-secret")
      .set("x-test-user-id", String(USER_ID));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_ID");
    expect(webhookSecretService.rotate).not.toHaveBeenCalled();
  });
});