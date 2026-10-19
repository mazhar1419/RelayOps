export function createIncidentRepository(pool) {
  return {
    async findTeamMembership(client, teamId, userId) {
      const result = await client.query(
        `SELECT role
         FROM team_memberships
         WHERE team_id = $1 AND user_id = $2`,
        [teamId, userId],
      );

      return result.rows[0] ?? null;
    },

    async create(client, data) {
      const result = await client.query(
        `INSERT INTO incidents (
           team_id, title, description, severity,
           assignee_id, created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          data.teamId,
          data.title,
          data.description ?? null,
          data.severity,
          data.assigneeId ?? null,
          data.actorUserId,
        ],
      );

      return result.rows[0];
    },

    async list(client, teamId, { limit, offset }) {
      const result = await client.query(
        `SELECT *
         FROM incidents
         WHERE team_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT $2 OFFSET $3`,
        [teamId, limit, offset],
      );

      return result.rows;
    },

    async findById(client, teamId, incidentId) {
      const result = await client.query(
        `SELECT *
         FROM incidents
         WHERE team_id = $1 AND id = $2`,
        [teamId, incidentId],
      );

      return result.rows[0] ?? null;
    },

    async update(client, teamId, incidentId, data) {
      const result = await client.query(
        `UPDATE incidents
         SET title = COALESCE($1, title),
             description = CASE WHEN $2 THEN $3 ELSE description END,
             severity = COALESCE($4, severity),
             status = COALESCE($5, status),
             assignee_id = CASE WHEN $6 THEN $7 ELSE assignee_id END,
             version = version + 1,
             updated_at = now(),
             resolved_at = CASE
               WHEN $5 = 'resolved' THEN now()
               WHEN $5 IN ('open', 'acknowledged') THEN NULL
               ELSE resolved_at
             END
         WHERE team_id = $8
           AND id = $9
           AND version = $10
         RETURNING *`,
        [
          data.title ?? null,
          Object.hasOwn(data, "description"),
          data.description ?? null,
          data.severity ?? null,
          data.status ?? null,
          Object.hasOwn(data, "assigneeId"),
          data.assigneeId ?? null,
          teamId,
          incidentId,
          data.version,
        ],
      );

      return result.rows[0] ?? null;
    },
  };
}