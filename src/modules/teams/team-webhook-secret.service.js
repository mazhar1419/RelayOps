
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

function hashSecret(secret) {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function verifySecret(receivedSecret, storedHash) {
  if (
    typeof receivedSecret !== "string" ||
    typeof storedHash !== "string"
  ) {
    return false;
  }

  const receivedHash = Buffer.from(hashSecret(receivedSecret), "hex");
  const expectedHash = Buffer.from(storedHash, "hex");

  if (receivedHash.length !== expectedHash.length) {
    return false;
  }

  return timingSafeEqual(receivedHash, expectedHash);
}

export function createTeamWebhookSecretService(pool, repository) {
  return {
    async rotate(teamId) {
      const secret = randomBytes(32).toString("hex");
      const secretHash = hashSecret(secret);
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const teamResult = await client.query(
          "SELECT id FROM teams WHERE id = $1 FOR UPDATE",
          [teamId],
        );

        if (!teamResult.rows[0]) {
          const error = new Error("Team not found");
          error.status = 404;
          throw error;
        }

        await repository.upsert(client, teamId, secretHash);

        await client.query("COMMIT");

        // Return the plaintext secret only once, to the caller.
        return { teamId, secret };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async verify(teamId, receivedSecret) {
      const result = await pool.query(
        `SELECT secret_hash
         FROM team_webhook_secrets
         WHERE team_id = $1`,
        [teamId],
      );

      const stored = result.rows[0];

      if (!stored) {
        return false;
      }

      return verifySecret(receivedSecret, stored.secret_hash);
    },

    async revoke(teamId) {
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const deleted = await repository.deleteByTeamId(client, teamId);
        await client.query("COMMIT");
        return Boolean(deleted);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
