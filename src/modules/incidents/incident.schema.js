import { z } from "zod";

export const createIncidentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).nullable().optional(),
  severity: z
    .enum(["low", "medium", "high", "critical"])
    .default("medium"),
  assigneeId: z.coerce.number().int().positive().nullable().optional(),
});

export const updateIncidentSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(10_000).nullable().optional(),
    severity: z.enum(["low", "medium", "high", "critical"]).optional(),
    status: z.enum(["open", "acknowledged", "resolved"]).optional(),
    assigneeId: z.coerce.number().int().positive().nullable().optional(),
    version: z.coerce.number().int().positive(),
  })
  .refine(
    (data) =>
      ["title", "description", "severity", "status", "assigneeId"].some(
        (key) => Object.hasOwn(data, key),
      ),
    "At least one field must be updated",
  );