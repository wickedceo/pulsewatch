CREATE INDEX CONCURRENTLY IF NOT EXISTS
idx_monitoring_checks_website_generation_checked
ON monitoring_checks (website_id, url_generation, checked_at DESC);

ALTER TABLE websites
VALIDATE CONSTRAINT websites_current_url_generation_positive;

ALTER TABLE websites
VALIDATE CONSTRAINT websites_current_url_version_fk;

ALTER TABLE monitoring_checks
VALIDATE CONSTRAINT monitoring_checks_url_version_fk;
