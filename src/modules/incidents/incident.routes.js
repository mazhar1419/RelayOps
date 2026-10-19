import { Router } from "express";

import {
  createIncidentSchema,
  updateIncidentSchema,
} from "./incident.schema.js";

function parsePositiveId(value) {
  if (!/^[1-9]\d*$/.test(value)) return null;

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function validateId(value, res, name) {
  const id = parsePositiveId(value);

  if (id === null) {
    res.status(400).json({
      error: {
        code: "INVALID_ID",
        message: `${name} must be a positive integer`,
      },
    });
  }

  return id;
}

export function createIncidentRouter(service, authenticate) {
  const router = Router();

  router.use(authenticate);

  router.post("/teams/:teamId/incidents", async (req, res, next) => {
    try {
      const teamId = validateId(req.params.teamId, res, "teamId");
      if (teamId === null) return;

      const parsed = createIncidentSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            details: parsed.error.issues,
          },
        });
      }

      const incident = await service.create(
        teamId,
        req.auth.userId,
        parsed.data,
      );

      return res.status(201).json({ data: incident });
    } catch (error) {
      next(error);
    }
  });

  router.get("/teams/:teamId/incidents", async (req, res, next) => {
    try {
      const teamId = validateId(req.params.teamId, res, "teamId");
      if (teamId === null) return;

      const limit = Number(req.query.limit ?? 20);
      const offset = Number(req.query.offset ?? 0);

      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isInteger(offset) ||
        offset < 0
      ) {
        return res.status(400).json({
          error: {
            code: "INVALID_PAGINATION",
            message: "limit must be 1-100 and offset must be non-negative",
          },
        });
      }

      const incidents = await service.list(
        teamId,
        req.auth.userId,
        { limit, offset },
      );

      return res.status(200).json({ data: incidents });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/teams/:teamId/incidents/:incidentId",
    async (req, res, next) => {
      try {
        const teamId = validateId(req.params.teamId, res, "teamId");
        if (teamId === null) return;

        const incidentId = validateId(
          req.params.incidentId,
          res,
          "incidentId",
        );
        if (incidentId === null) return;

        const incident = await service.get(
          teamId,
          incidentId,
          req.auth.userId,
        );

        return res.status(200).json({ data: incident });
      } catch (error) {
        next(error);
      }
    },
  );

  router.patch(
    "/teams/:teamId/incidents/:incidentId",
    async (req, res, next) => {
      try {
        const teamId = validateId(req.params.teamId, res, "teamId");
        if (teamId === null) return;

        const incidentId = validateId(
          req.params.incidentId,
          res,
          "incidentId",
        );
        if (incidentId === null) return;

        const parsed = updateIncidentSchema.safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              details: parsed.error.issues,
            },
          });
        }

        const incident = await service.update(
          teamId,
          incidentId,
          req.auth.userId,
          parsed.data,
        );

        return res.status(200).json({ data: incident });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}