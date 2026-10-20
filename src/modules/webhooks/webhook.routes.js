import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

const webhookSchema = z.object({
  teamId: z.number().int().positive().safe(),
  source: z.string().trim().min(1).max(100),
  externalEventId: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(255),
  description: z.string().max(5000).optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

export function createWebhookRateLimiter(options = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: {
        code: "WEBHOOK_RATE_LIMITED",
        message: "Too many webhook requests. Try again in a minute.",
      },
    },
    ...options,
  });
}

const webhookLimiter = createWebhookRateLimiter();

export function createWebhookRouter(service, secretService, { limiter = webhookLimiter } = {}) {
  if (!secretService || typeof secretService.verify !== "function") {
    throw new Error("A team webhook secret service is required");
  }

  const router = Router();
  router.use(limiter);

  router.post("/:teamId/events", async (req, res, next) => {
    try {
      const teamId = Number(req.params.teamId);
      if (!Number.isSafeInteger(teamId) || teamId <= 0) {
        return res.status(400).json({
          error: { code: "INVALID_TEAM_ID", message: "teamId must be a positive integer" },
        });
      }

      const authenticated = await secretService.verify(teamId, req.get("x-webhook-secret"));
      if (!authenticated) {
        return res.status(401).json({
          error: { code: "INVALID_WEBHOOK_SECRET", message: "Webhook authentication failed" },
        });
      }

      const parsed = webhookSchema.safeParse({ ...req.body, teamId });
      if (!parsed.success) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", details: parsed.error.issues },
        });
      }

      const result = await service.receive({ ...parsed.data, payload: req.body });
      return res.status(result.duplicate ? 200 : 201).json({
        data: {
          duplicate: result.duplicate,
          eventId: result.event.id,
          incidentId: result.incident?.id ?? result.event.incident_id ?? null,
        },
      });
    } catch (error) {
      if (error.code === "DUPLICATE_WEBHOOK_EVENT") {
        return res.status(200).json({
          data: {
            duplicate: true,
            eventId: error.event.id,
            incidentId: error.event.incident_id ?? null,
          },
        });
      }
      return next(error);
    }
  });

  return router;
}
