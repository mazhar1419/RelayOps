CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT users_email_not_empty
        CHECK (length(btrim(email)) > 0),

    CONSTRAINT users_password_hash_not_empty
        CHECK (length(btrim(password_hash)) > 0)
);