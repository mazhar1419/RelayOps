export function createTeamRepository(pool) {
  return {
    async create(client, name, userId) {
      const result = await client.query(
        `INSERT INTO teams (name, created_by) VALUES ($1, $2)
         RETURNING id, name, created_by, created_at`, [name, userId],
      );
      return result.rows[0];
    },
    async addMember(client, teamId, userId, role) {
      await client.query(
        `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, $3)`,
        [teamId, userId, role],
      );
    },
    async listForUser(userId) {
      const result = await pool.query(
        `SELECT t.id, t.name, t.created_by, t.created_at, tm.role
         FROM teams t JOIN team_memberships tm ON tm.team_id = t.id
         WHERE tm.user_id = $1 ORDER BY t.created_at DESC, t.id DESC`, [userId],
      );
      return result.rows;
    },
    async findForUser(teamId, userId) {
      const result = await pool.query(
        `SELECT t.id, t.name, t.created_by, t.created_at, tm.role
         FROM teams t JOIN team_memberships tm ON tm.team_id = t.id
         WHERE t.id = $1 AND tm.user_id = $2`, [teamId, userId],
      );
      return result.rows[0] ?? null;
    },
    async listMembers(teamId) {
      const result = await pool.query(
        `SELECT u.id AS user_id, u.email, tm.role, tm.joined_at
         FROM team_memberships tm JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = $1 ORDER BY CASE tm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, tm.joined_at ASC`,
        [teamId],
      );
      return result.rows;
    },
    async findVerifiedUserByEmail(email) {
      const result = await pool.query(
        `SELECT id, email FROM users WHERE email = $1 AND email_verified_at IS NOT NULL`, [email],
      );
      return result.rows[0] ?? null;
    },
    async addMembership(teamId, userId, role) {
      const result = await pool.query(
        `INSERT INTO team_memberships (team_id, user_id, role)
         VALUES ($1, $2, $3) RETURNING team_id, user_id, role, joined_at`,
        [teamId, userId, role],
      );
      return result.rows[0];
    },
    async createInvitation(teamId, email, role, invitedBy) {
      const result = await pool.query(
        `INSERT INTO team_invitations (team_id, email, role, invited_by, expires_at, created_at)
         VALUES ($1, lower($2), $3, $4, now() + interval '7 days', now())
         ON CONFLICT (team_id, email) DO UPDATE SET
           role = EXCLUDED.role, invited_by = EXCLUDED.invited_by,
           expires_at = EXCLUDED.expires_at, created_at = now()
         RETURNING id, team_id, email, role, invited_by, expires_at, created_at`,
        [teamId, email, role, invitedBy],
      );
      return result.rows[0];
    },
    async listInvitations(teamId) {
      const result = await pool.query(
        `SELECT id, team_id, email, role, invited_by, expires_at, created_at
         FROM team_invitations WHERE team_id = $1 AND expires_at > now()
         ORDER BY created_at DESC`, [teamId],
      );
      return result.rows;
    },
    async cancelInvitation(teamId, invitationId) {
      const result = await pool.query(
        `DELETE FROM team_invitations WHERE team_id = $1 AND id = $2 RETURNING id`,
        [teamId, invitationId],
      );
      return Boolean(result.rows[0]);
    },
    async updateMemberRole(teamId, userId, role) {
      const result = await pool.query(
        `UPDATE team_memberships SET role = $3
         WHERE team_id = $1 AND user_id = $2 AND role <> 'owner'
         RETURNING team_id, user_id, role, joined_at`, [teamId, userId, role],
      );
      return result.rows[0] ?? null;
    },
    async removeMember(teamId, userId) {
      const result = await pool.query(
        `DELETE FROM team_memberships WHERE team_id = $1 AND user_id = $2 AND role <> 'owner' RETURNING user_id`,
        [teamId, userId],
      );
      return Boolean(result.rows[0]);
    },
  };
}
