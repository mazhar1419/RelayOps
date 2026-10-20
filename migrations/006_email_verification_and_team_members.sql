ALTER TABLE users
  ADD COLUMN email_verified_at TIMESTAMPTZ;

-- Preserve access for accounts that existed before email verification was introduced.
UPDATE users
SET email_verified_at = created_at
WHERE email_verified_at IS NULL;

CREATE TABLE email_verification_codes (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_verification_code_hash_not_empty CHECK (length(btrim(code_hash)) > 0),
  CONSTRAINT email_verification_attempts_nonnegative CHECK (attempts >= 0)
);

CREATE INDEX email_verification_codes_expiry_idx ON email_verification_codes (expires_at);

CREATE TABLE team_invitations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'responder',
  invited_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_invitation_email_not_empty CHECK (length(btrim(email)) > 0),
  CONSTRAINT team_invitation_role_valid CHECK (role IN ('admin', 'responder', 'viewer')),
  CONSTRAINT team_invitation_unique_email UNIQUE (team_id, email)
);
CREATE INDEX team_invitations_email_idx ON team_invitations (lower(email), expires_at);
