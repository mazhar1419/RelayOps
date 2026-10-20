import { timingSafeEqual } from "node:crypto";

export function createAuthRepository(pool) {
  return {
    async createUser(email, passwordHash) {
      const result = await pool.query(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email, created_at, email_verified_at`,
        [email, passwordHash],
      );
      return result.rows[0];
    },

    async findByEmail(email) {
      const result = await pool.query(
        `SELECT id, email, password_hash, created_at, email_verified_at
         FROM users WHERE email = $1`,
        [email],
      );
      return result.rows[0] ?? null;
    },

    async findPublicUserById(id) {
      const result = await pool.query(
        `SELECT id, email, created_at, email_verified_at
         FROM users WHERE id = $1`,
        [id],
      );
      return result.rows[0] ?? null;
    },

    async saveVerificationCode(userId, codeHash, expiresAt) {
      await pool.query(
        `INSERT INTO email_verification_codes (user_id, code_hash, expires_at, attempts, created_at)
         VALUES ($1, $2, $3, 0, now())
         ON CONFLICT (user_id) DO UPDATE SET
           code_hash = EXCLUDED.code_hash,
           expires_at = EXCLUDED.expires_at,
           attempts = 0,
           created_at = now()`,
        [userId, codeHash, expiresAt],
      );
    },

    async verifyEmailCode(email, codeHash) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(
          `SELECT u.id, c.code_hash, c.expires_at, c.attempts
           FROM users u
           JOIN email_verification_codes c ON c.user_id = u.id
           WHERE u.email = $1
           FOR UPDATE OF u, c`,
          [email],
        );
        const record = result.rows[0];
        if (!record || Number(record.attempts) >= 5 || new Date(record.expires_at) <= new Date()) {
          await client.query("COMMIT");
          return false;
        }
        const storedHash = Buffer.from(record.code_hash, "hex");
        const receivedHash = Buffer.from(codeHash, "hex");
        const matches = storedHash.length === receivedHash.length && timingSafeEqual(storedHash, receivedHash);
        if (!matches) {
          await client.query(
            `UPDATE email_verification_codes SET attempts = attempts + 1 WHERE user_id = $1`,
            [record.id],
          );
          await client.query("COMMIT");
          return false;
        }
        await client.query(
          `UPDATE users SET email_verified_at = now() WHERE id = $1`,
          [record.id],
        );
        await client.query(
          `INSERT INTO team_memberships (team_id, user_id, role)
           SELECT i.team_id, $1, i.role
           FROM team_invitations i
           WHERE lower(i.email) = lower((SELECT email FROM users WHERE id = $1))
             AND i.expires_at > now()
           ON CONFLICT (team_id, user_id) DO NOTHING`,
          [record.id],
        );
        await client.query(
          `DELETE FROM team_invitations
           WHERE lower(email) = lower((SELECT email FROM users WHERE id = $1))`,
          [record.id],
        );
        await client.query(`DELETE FROM email_verification_codes WHERE user_id = $1`, [record.id]);
        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async findUnverifiedUser(email) {
      const result = await pool.query(
        `SELECT id, email FROM users WHERE email = $1 AND email_verified_at IS NULL`,
        [email],
      );
      return result.rows[0] ?? null;
    },
  };
}
