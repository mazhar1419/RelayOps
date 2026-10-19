
CREATE TABLE team_webhook_secrets (
    team_id BIGINT PRIMARY KEY
        REFERENCES teams(id) ON DELETE CASCADE,

    secret_hash TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT team_webhook_secret_hash_not_empty
        CHECK (length(btrim(secret_hash)) > 0)
);
