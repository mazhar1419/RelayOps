
export function createWebhookRepository() {
  return {
    async findExistingEvent(client, teamId, source, externalEventId) {
      const result = await client.query(
        `SELECT id, team_id, source, external_event_id,
                payload, received_at, incident_id
         FROM webhook_events
         WHERE team_id = $1
           AND source = $2
           AND external_event_id = $3`,
        [teamId, source, externalEventId],
      );

      return result.rows[0] ?? null;
    },

    async createEvent(client, data) {
      const result = await client.query(
        `INSERT INTO webhook_events (
           team_id,
           source,
           external_event_id,
           payload,
           incident_id
         )
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (team_id, source, external_event_id)
         DO NOTHING
         RETURNING *`,
        [
          data.teamId,
          data.source,
          data.externalEventId,
          JSON.stringify(data.payload),
          data.incidentId ?? null,
        ],
      );

      return result.rows[0] ?? null;
    },

    async attachIncident(client, teamId, eventId, incidentId) {
      const result = await client.query(
        `UPDATE webhook_events
         SET incident_id = $1
         WHERE team_id = $2
           AND id = $3
           AND incident_id IS NULL
         RETURNING *`,
        [incidentId, teamId, eventId],
      );

      return result.rows[0] ?? null;
    },
  };
}
