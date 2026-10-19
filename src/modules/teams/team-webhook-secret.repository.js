
export function createTeamWebhookSecretRepository() {
  return {
    async findByTeamId(client, teamId) {
      const result = await client.query(
        `SELECT team_id, secret_hash, created_at, updated_at
         FROM team_webhook_secrets
         WHERE team_id = $1`,
        [teamId],
      );

      return result.rows[0] ?? null;
    },

    async upsert(client, teamId, secretHash) {
      const result = await client.query(
        `INSERT INTO team_webhook_secrets (team_id, secret_hash)
         VALUES ($1, $2)
         ON CONFLICT (team_id)
         DO UPDATE SET
           secret_hash = EXCLUDED.secret_hash,
           updated_at = now()
         RETURNING team_id, created_at, updated_at`,
        [teamId, secretHash],
      );

      return result.rows[0];
    },

    async deleteByTeamId(client, teamId) {
      const result = await client.query(
        `DELETE FROM team_webhook_secrets
         WHERE team_id = $1
         RETURNING team_id`,
        [teamId],
      );

      return result.rows[0] ?? null;
    },
  };
}
