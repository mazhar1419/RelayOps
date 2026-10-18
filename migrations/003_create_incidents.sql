CREATE TABLE incidents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    team_id BIGINT NOT NULL
        REFERENCES teams(id) ON DELETE RESTRICT,

    title TEXT NOT NULL,
    description TEXT,

    severity TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'open',

    assignee_id BIGINT,

    created_by BIGINT
        REFERENCES users(id) ON DELETE SET NULL,

    version INTEGER NOT NULL DEFAULT 1,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,

    CONSTRAINT incidents_title_not_empty
        CHECK (length(btrim(title)) > 0),

    CONSTRAINT incidents_severity_valid
        CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    CONSTRAINT incidents_status_valid
        CHECK (status IN ('open', 'acknowledged', 'resolved')),

    CONSTRAINT incidents_version_positive
        CHECK (version > 0),

    CONSTRAINT incidents_resolved_at_consistent
        CHECK (
            (status = 'resolved' AND resolved_at IS NOT NULL)
            OR
            (status <> 'resolved' AND resolved_at IS NULL)
        ),

    CONSTRAINT incidents_team_id_id_unique
        UNIQUE (team_id, id),

    CONSTRAINT incidents_assignee_same_team
        FOREIGN KEY (team_id, assignee_id)
        REFERENCES team_memberships (team_id, user_id)
        ON DELETE RESTRICT
);

CREATE INDEX incidents_team_status_created_idx
    ON incidents (team_id, status, created_at DESC);

CREATE INDEX incidents_team_assignee_idx
    ON incidents (team_id, assignee_id)
    WHERE assignee_id IS NOT NULL;