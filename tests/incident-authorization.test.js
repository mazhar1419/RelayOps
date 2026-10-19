
import { describe, expect, it, vi } from "vitest";
import { createIncidentService } from "../src/modules/incidents/incident.service.js";

function createTestService(membership) {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn(),
  };

  const pool = {
    connect: vi.fn().mockResolvedValue(client),
  };

  const repository = {
    findTeamMembership: vi.fn(async (_client, teamId, userId) => {
      if (typeof membership === "function") {
        return membership(teamId, userId);
      }

      return membership;
    }),
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({
      id: 101,
      title: "Test incident",
      severity: "low",
      status: "open",
      version: 1,
    }),
    findById: vi.fn(),
    update: vi.fn(),
  };

  return {
    service: createIncidentService(pool, repository),
    repository,
  };
}

describe("Incident authorization", () => {
  it("denies a user who is not a team member", async () => {
    const { service, repository } = createTestService(null);

    await expect(
      service.list(1, 99, { limit: 20, offset: 0 }),
    ).rejects.toMatchObject({
      status: 403,
      message: "You do not have access to this team",
    });

    expect(repository.list).not.toHaveBeenCalled();
  });

  it("allows a viewer to list incidents", async () => {
    const { service, repository } = createTestService({
      role: "viewer",
    });

    const result = await service.list(1, 20, {
      limit: 20,
      offset: 0,
    });

    expect(result).toEqual([]);
    expect(repository.list).toHaveBeenCalled();
  });

  it("denies a viewer from creating incidents", async () => {
    const { service, repository } = createTestService({
      role: "viewer",
    });

    await expect(
      service.create(1, 20, {
        title: "Unauthorized incident",
        severity: "low",
      }),
    ).rejects.toMatchObject({
      status: 403,
    });

    expect(repository.create).not.toHaveBeenCalled();
  });

  it("denies a viewer from updating incidents", async () => {
    const { service, repository } = createTestService({
      role: "viewer",
    });

    await expect(
      service.update(1, 101, 20, {
        status: "resolved",
        version: 1,
      }),
    ).rejects.toMatchObject({
      status: 403,
    });

    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("allows a responder to create incidents", async () => {
    const { service, repository } = createTestService({
      role: "responder",
    });

    const result = await service.create(1, 20, {
      title: "Test incident",
      severity: "low",
    });

    expect(result.id).toBe(101);
    expect(repository.create).toHaveBeenCalled();
  });
});
