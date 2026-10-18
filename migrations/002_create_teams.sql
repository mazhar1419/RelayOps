CREATE TABLE teams (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    name TEXT NOT NULL,

    created_by BIGINT REFERENCES users(id)
        ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT teams_name_not_empty
        CHECK (length(btrim(name)) > 0),

    CONSTRAINT teams_id_id_unique
        UNIQUE (id)
);

CREATE TABLE team_memberships (
    team_id BIGINT NOT NULL
        REFERENCES teams(id) ON DELETE RESTRICT,

    user_id BIGINT NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,

    role TEXT NOT NULL DEFAULT 'responder',

    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT team_memberships_pk
        PRIMARY KEY (team_id, user_id),

    CONSTRAINT team_memberships_role_valid
        CHECK (role IN ('owner', 'admin', 'responder', 'viewer'))
);

CREATE INDEX team_memberships_user_team_idx
    ON team_memberships (user_id, team_id);