
export function createTeamRepository(pool) {
  return {
    async create(client, name, userId) {
      const result = await client.query(
        `INSERT INTO teams (name, created_by)
         VALUES ($1, $2)
         RETURNING id, name, created_by, created_at`,
        [name, userId],
      );

      return result.rows[0];
    },

    async addMember(client, teamId, userId, role) {
      await client.query(
        `INSERT INTO team_memberships (team_id, user_id, role)
         VALUES ($1, $2, $3)`,
        [teamId, userId, role],
      );
    },

    async listForUser(userId) {
      const result = await pool.query(
        `SELECT
           t.id,
           t.name,
           t.created_by,
           t.created_at,
           tm.role
         FROM teams t
         JOIN team_memberships tm ON tm.team_id = t.id
         WHERE tm.user_id = $1
         ORDER BY t.created_at DESC, t.id DESC`,
        [userId],
      );

      return result.rows;
    },

    async findForUser(teamId, userId) {
      const result = await pool.query(
        `SELECT
           t.id,
           t.name,
           t.created_by,
           t.created_at,
           tm.role
         FROM teams t
         JOIN team_memberships tm ON tm.team_id = t.id
         WHERE t.id = $1 AND tm.user_id = $2`,
        [teamId, userId],
      );

      return result.rows[0] ?? null;
    },
  };
}
