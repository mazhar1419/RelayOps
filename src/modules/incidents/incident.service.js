const EDIT_ROLES = new Set(["owner", "admin", "responder"]);
const VIEW_ROLES = new Set(["owner", "admin", "responder", "viewer"]);

export function createIncidentService(pool, repository) {
  async function withTransaction(work) {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  async function authorize(client, teamId, userId, canEdit = false) {
    const membership = await repository.findTeamMembership(
      client,
      teamId,
      userId,
    );

    const allowedRoles = canEdit ? EDIT_ROLES : VIEW_ROLES;

    if (!membership || !allowedRoles.has(membership.role)) {
      const error = new Error("You do not have access to this team");
      error.status = 403;
      throw error;
    }
  }

  return {
    async create(teamId, actorUserId, input) {
      return withTransaction(async (client) => {
        await authorize(client, teamId, actorUserId, true);

        const incident = await repository.create(client, {
          ...input,
          teamId,
          actorUserId,
        });

        await client.query(
          `INSERT INTO audit_logs
             (team_id, incident_id, actor_user_id, action, metadata)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [
            teamId,
            incident.id,
            actorUserId,
            "incident.created",
            JSON.stringify({ severity: incident.severity }),
          ],
        );

        return incident;
      });
    },

    async list(teamId, actorUserId, pagination) {
      return withTransaction(async (client) => {
        await authorize(client, teamId, actorUserId);
        return repository.list(client, teamId, pagination);
      });
    },

    async get(teamId, incidentId, actorUserId) {
      return withTransaction(async (client) => {
        await authorize(client, teamId, actorUserId);

        const incident = await repository.findById(
          client,
          teamId,
          incidentId,
        );

        if (!incident) {
          const error = new Error("Incident not found");
          error.status = 404;
          throw error;
        }

        return incident;
      });
    },

    async update(teamId, incidentId, actorUserId, input) {
      return withTransaction(async (client) => {
        await authorize(client, teamId, actorUserId, true);

        const current = await repository.findById(
          client,
          teamId,
          incidentId,
        );

        if (!current) {
          const error = new Error("Incident not found");
          error.status = 404;
          throw error;
        }

        const allowedTransitions = {
          open: ["acknowledged", "resolved"],
          acknowledged: ["open", "resolved"],
          resolved: ["open"],
        };

        if (
          input.status &&
          input.status !== current.status &&
          !allowedTransitions[current.status].includes(input.status)
        ) {
          const error = new Error(
            `Cannot transition from ${current.status} to ${input.status}`,
          );
          error.status = 409;
          throw error;
        }

        if (Object.hasOwn(input, "assigneeId") && input.assigneeId !== null) {
          const assignee = await repository.findTeamMembership(
            client,
            teamId,
            input.assigneeId,
          );

          if (!assignee) {
            const error = new Error(
              "Assignee must belong to the same team",
            );
            error.status = 422;
            throw error;
          }
        }

        const incident = await repository.update(
          client,
          teamId,
          incidentId,
          input,
        );

        if (!incident) {
          const error = new Error(
            "Incident changed concurrently; fetch it and retry",
          );
          error.status = 409;
          throw error;
        }

        await client.query(
          `INSERT INTO audit_logs
             (team_id, incident_id, actor_user_id, action, metadata)
           VALUES ($1, $2, $3, $4, $5::jsonb)`,
          [
            teamId,
            incidentId,
            actorUserId,
            "incident.updated",
            JSON.stringify({ version: incident.version }),
          ],
        );

        return incident;
      });
    },
  };
}