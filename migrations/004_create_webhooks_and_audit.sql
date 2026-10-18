CREATE TABLE webhook_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    team_id BIGINT NOT NULL
        REFERENCES teams(id) ON DELETE RESTRICT,

    source TEXT NOT NULL,
    external_event_id TEXT NOT NULL,
    payload JSONB NOT NULL,

    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    incident_id BIGINT,

    CONSTRAINT webhook_source_not_empty
        CHECK (length(btrim(source)) > 0),

    CONSTRAINT webhook_external_id_not_empty
        CHECK (length(btrim(external_event_id)) > 0),

    CONSTRAINT webhook_event_deduplication
        UNIQUE (team_id, source, external_event_id),

    CONSTRAINT webhook_incident_same_team
        FOREIGN KEY (team_id, incident_id)
        REFERENCES incidents (team_id, id)
        ON DELETE RESTRICT
);

CREATE INDEX webhook_events_team_incident_idx
    ON webhook_events (team_id, incident_id);


CREATE TABLE audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    team_id BIGINT NOT NULL
        REFERENCES teams(id) ON DELETE RESTRICT,

    incident_id BIGINT,

    actor_user_id BIGINT
        REFERENCES users(id) ON DELETE SET NULL,

    action TEXT NOT NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT audit_action_not_empty
        CHECK (length(btrim(action)) > 0),

    CONSTRAINT audit_incident_same_team
        FOREIGN KEY (team_id, incident_id)
        REFERENCES incidents (team_id, id)
        ON DELETE RESTRICT
);

CREATE INDEX audit_logs_team_incident_created_idx
    ON audit_logs (team_id, incident_id, created_at DESC);