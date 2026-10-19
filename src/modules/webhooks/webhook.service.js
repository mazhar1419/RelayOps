
export function createWebhookService(
  pool,
  webhookRepository,
  incidentRepository,
) {
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

  return {
    async receive(input) {
      return withTransaction(async (client) => {
        // 1. Try to claim this event using the database unique constraint.
        // Do this BEFORE creating an incident.
        const event = await webhookRepository.createEvent(client, {
          teamId: input.teamId,
          source: input.source,
          externalEventId: input.externalEventId,
          payload: input.payload,
          incidentId: null,
        });

        // 2. If another request already claimed the event, return it.
        // Under PostgreSQL READ COMMITTED, the next query can see the
        // conflicting transaction after ON CONFLICT has finished waiting.
        if (!event) {
          const existing =
            await webhookRepository.findExistingEvent(
              client,
              input.teamId,
              input.source,
              input.externalEventId,
            );

          if (!existing) {
            const error = new Error(
              "Duplicate event was detected but could not be retrieved",
            );
            error.status = 503;
            throw error;
          }

          return {
            duplicate: true,
            event: existing,
            incident: null,
          };
        }

        // 3. Only the request that successfully inserted the event
        // is allowed to create its incident.
        const incident = await incidentRepository.create(client, {
          teamId: input.teamId,
          title: input.title,
          description: input.description ?? null,
          severity: input.severity,
          assigneeId: null,
          actorUserId: null,
        });

        // 4. Link the event to the newly created incident.
        const linkedEvent = await webhookRepository.attachIncident(
          client,
          input.teamId,
          event.id,
          incident.id,
        );

        if (!linkedEvent) {
          throw new Error(
            "Failed to link webhook event to its incident",
          );
        }

        // 5. Record the incident creation in the audit log.
        await client.query(
          `INSERT INTO audit_logs
             (team_id, incident_id, actor_user_id, action, metadata)
           VALUES ($1, $2, NULL, $3, $4::jsonb)`,
          [
            input.teamId,
            incident.id,
            "incident.created",
            JSON.stringify({
              source: input.source,
              externalEventId: input.externalEventId,
              origin: "webhook",
            }),
          ],
        );

        return {
          duplicate: false,
          event: linkedEvent,
          incident,
        };
      });
    },
  };
}
