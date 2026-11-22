BEGIN;

ALTER TABLE websites
ADD COLUMN IF NOT EXISTS current_url_generation INTEGER NOT NULL DEFAULT 1;

ALTER TABLE monitoring_checks
ADD COLUMN IF NOT EXISTS url_generation INTEGER;

CREATE TABLE IF NOT EXISTS website_url_versions (
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    generation INTEGER NOT NULL CHECK (generation > 0),
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (website_id, generation)
);

INSERT INTO website_url_versions (website_id, generation, url)
SELECT id, current_url_generation, url
FROM websites
ON CONFLICT (website_id, generation) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'websites_current_url_generation_positive'
          AND conrelid = 'websites'::regclass
    ) THEN
        ALTER TABLE websites
        ADD CONSTRAINT websites_current_url_generation_positive
        CHECK (current_url_generation > 0) NOT VALID;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'monitoring_checks_url_version_fk'
          AND conrelid = 'monitoring_checks'::regclass
    ) THEN
        ALTER TABLE monitoring_checks
        ADD CONSTRAINT monitoring_checks_url_version_fk
        FOREIGN KEY (website_id, url_generation)
        REFERENCES website_url_versions (website_id, generation)
        ON DELETE CASCADE
        NOT VALID;
    END IF;

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
        DEFERRABLE INITIALLY DEFERRED
        NOT VALID;
    END IF;
END;
$$;

COMMIT;
