
import { describe, expect, it, vi } from "vitest";
import { createIncidentService } from "../src/modules/incidents/incident.service.js";

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
    title: "API response time increased",
    severity: "high",
    status: "open",
    version: 1,
  };

  const repository = {
    findTeamMembership: vi.fn().mockResolvedValue({
      role: "responder",
    }),

    create: vi.fn().mockResolvedValue(incident),

    findById: vi.fn().mockResolvedValue(incident),

    update: vi.fn().mockResolvedValue({
      ...incident,
      status: "acknowledged",
      version: 2,
    }),
  };

  return {
    client,
    repository,
    service: createIncidentService(pool, repository),
  };
}

describe("Incident audit logging", () => {
  it("writes an audit log when an incident is created", async () => {
    const { service, client } = createTestContext();

    await service.create(1, 20, {
      title: "API response time increased",
      severity: "high",
    });

    const auditCall = client.query.mock.calls.find(
      ([sql]) => sql.includes("INSERT INTO audit_logs"),
    );

    expect(auditCall).toBeDefined();
    expect(auditCall[1]).toEqual([
      1,
      101,
      20,
      "incident.created",
      JSON.stringify({ severity: "high" }),
    ]);
  });

  it("writes an audit log when an incident is updated", async () => {
    const { service, client } = createTestContext();

    await service.update(1, 101, 20, {
      status: "acknowledged",
      version: 1,
    });

    const auditCall = client.query.mock.calls.find(
      ([sql]) => sql.includes("INSERT INTO audit_logs"),
    );

    expect(auditCall).toBeDefined();
    expect(auditCall[1]).toEqual([
      1,
      101,
      20,
      "incident.updated",
      JSON.stringify({ version: 2 }),
    ]);
  });

  it("rolls back incident creation if audit logging fails", async () => {
    const { service, client } = createTestContext();

    client.query.mockImplementation(async (sql) => {
      if (sql.includes("INSERT INTO audit_logs")) {
        throw new Error("Audit storage unavailable");
      }

      return { rows: [] };
    });

    await expect(
      service.create(1, 20, {
        title: "Test incident",
        severity: "low",
      }),
    ).rejects.toThrow("Audit storage unavailable");

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("rolls back incident update if audit logging fails", async () => {
    const { service, client } = createTestContext();

    client.query.mockImplementation(async (sql) => {
      if (sql.includes("INSERT INTO audit_logs")) {
        throw new Error("Audit storage unavailable");
      }

      return { rows: [] };
    });

    await expect(
      service.update(1, 101, 20, {
        status: "acknowledged",
        version: 1,
      }),
    ).rejects.toThrow("Audit storage unavailable");

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });
});
