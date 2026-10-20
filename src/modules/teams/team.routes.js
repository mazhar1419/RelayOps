import { Router } from "express";
import { createTeamSchema } from "./team.schema.js";
import { z } from "zod";

const addMemberSchema = z.object({ email: z.string().trim().email().max(254), role: z.enum(["admin", "responder", "viewer"]).default("responder") });
const updateMemberSchema = z.object({ role: z.enum(["admin", "responder", "viewer"]) });

function parsePositiveId(value) {
  if (!/^[1-9]\d*$/.test(value)) return null;

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export function createTeamRouter(
  service,
  authenticate,
  webhookSecretService,
) {
  const router = Router();

  router.use(authenticate);

  router.post("/", async (req, res, next) => {
    try {
      const parsed = createTeamSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            details: parsed.error.issues,
          },
        });
      }

      const team = await service.create(
        parsed.data.name,
        req.auth.userId,
      );

      return res.status(201).json({ data: team });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/", async (req, res, next) => {
    try {
      const teams = await service.list(req.auth.userId);
      return res.status(200).json({ data: teams });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:teamId", async (req, res, next) => {
    try {
      const teamId = parsePositiveId(req.params.teamId);

      if (teamId === null) {
        return res.status(400).json({
          error: {
            code: "INVALID_ID",
            message: "teamId must be a positive integer",
          },
        });
      }

      const team = await service.get(teamId, req.auth.userId);
      return res.status(200).json({ data: team });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:teamId/invitations", async (req, res, next) => {
    try {
      const teamId = parsePositiveId(req.params.teamId);
      if (teamId === null) return res.status(400).json({ error: { code: "INVALID_ID", message: "teamId must be a positive integer" } });
      const invitations = await service.listInvitations(teamId, req.auth.userId);
      return res.status(200).json({ data: invitations });
    } catch (error) { return next(error); }
  });

  router.delete("/:teamId/invitations/:invitationId", async (req, res, next) => {
    try {
      const teamId = parsePositiveId(req.params.teamId);
      const invitationId = parsePositiveId(req.params.invitationId);
      if (teamId === null || invitationId === null) return res.status(400).json({ error: { code: "INVALID_ID", message: "teamId and invitationId must be positive integers" } });
      const result = await service.cancelInvitation(teamId, req.auth.userId, invitationId);
      return res.status(200).json({ data: result });
    } catch (error) { return next(error); }
  });

  router.get("/:teamId/members", async (req, res, next) => {
    try {
      const teamId = parsePositiveId(req.params.teamId);
      if (teamId === null) return res.status(400).json({ error: { code: "INVALID_ID", message: "teamId must be a positive integer" } });
      const members = await service.listMembers(teamId, req.auth.userId);
      return res.status(200).json({ data: members });
    } catch (error) { return next(error); }
  });

  router.post("/:teamId/members", async (req, res, next) => {
    try {
      const teamId = parsePositiveId(req.params.teamId);
      if (teamId === null) return res.status(400).json({ error: { code: "INVALID_ID", message: "teamId must be a positive integer" } });
      const parsed = addMemberSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.issues } });
      const member = await service.addMember(teamId, req.auth.userId, parsed.data.email, parsed.data.role);
      return res.status(201).json({ data: member });
    } catch (error) { return next(error); }
  });

  router.patch("/:teamId/members/:userId", async (req, res, next) => {
    try {
      const teamId = parsePositiveId(req.params.teamId);
      const userId = parsePositiveId(req.params.userId);
      if (teamId === null || userId === null) return res.status(400).json({ error: { code: "INVALID_ID", message: "teamId and userId must be positive integers" } });
      const parsed = updateMemberSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: { code: "VALIDATION_ERROR", details: parsed.error.issues } });
      const member = await service.updateMemberRole(teamId, req.auth.userId, userId, parsed.data.role);
      return res.status(200).json({ data: member });
    } catch (error) { return next(error); }
  });

  router.delete("/:teamId/members/:userId", async (req, res, next) => {
    try {
      const teamId = parsePositiveId(req.params.teamId);
      const userId = parsePositiveId(req.params.userId);
      if (teamId === null || userId === null) return res.status(400).json({ error: { code: "INVALID_ID", message: "teamId and userId must be positive integers" } });
      const result = await service.removeMember(teamId, req.auth.userId, userId);
      return res.status(200).json({ data: result });
    } catch (error) { return next(error); }
  });

  router.post("/:teamId/webhook-secret", async (req, res, next) => {
    try {
      const teamId = parsePositiveId(req.params.teamId);

      if (teamId === null) {
        return res.status(400).json({
          error: {
            code: "INVALID_ID",
            message: "teamId must be a positive integer",
          },
        });
      }

      await service.requireWebhookSecretPermission(
        teamId,
        req.auth.userId,
      );

      const result = await webhookSecretService.rotate(teamId);

      return res.status(201).json({
        data: {
          teamId: result.teamId,
          secret: result.secret,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/:teamId/webhook-secret", async (req, res, next) => {
    try {
      const teamId = parsePositiveId(req.params.teamId);

      if (teamId === null) {
        return res.status(400).json({
          error: {
            code: "INVALID_ID",
            message: "teamId must be a positive integer",
          },
        });
      }

      await service.requireWebhookSecretPermission(
        teamId,
        req.auth.userId,
      );

      const revoked = await webhookSecretService.revoke(teamId);

      if (!revoked) {
        return res.status(404).json({
          error: {
            code: "WEBHOOK_SECRET_NOT_FOUND",
            message: "This team does not have an active webhook secret",
          },
        });
      }

      return res.status(200).json({
        data: {
          teamId,
          revoked: true,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}