CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(254) NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_expiry
ON sessions (user_id, expires_at);

CREATE TABLE IF NOT EXISTS websites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100),
    url TEXT NOT NULL,
    current_url_generation INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT websites_current_url_generation_positive
        CHECK (current_url_generation > 0)
);

CREATE INDEX IF NOT EXISTS idx_websites_user_created
ON websites (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS website_url_versions (
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    generation INTEGER NOT NULL CHECK (generation > 0),
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (website_id, generation)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'websites_current_url_version_fk'
          AND conrelid = 'websites'::regclass
    ) THEN
        ALTER TABLE websites
        ADD CONSTRAINT websites_current_url_version_fk
        FOREIGN KEY (id, current_url_generation)
        REFERENCES website_url_versions (website_id, generation)
        DEFERRABLE INITIALLY DEFERRED;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS monitoring_checks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    url_generation INTEGER,
    status_code INTEGER,
    response_time_ms INTEGER,
    is_online BOOLEAN NOT NULL,
    error TEXT,
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT monitoring_checks_url_version_fk
        FOREIGN KEY (website_id, url_generation)
        REFERENCES website_url_versions (website_id, generation)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_monitoring_checks_website_checked
ON monitoring_checks (website_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_monitoring_checks_website_generation_checked
ON monitoring_checks (website_id, url_generation, checked_at DESC);
