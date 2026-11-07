ALTER TABLE production_project_assets
  ADD COLUMN reference_path VARCHAR(2048) NULL,
  ADD COLUMN reference_mime_type VARCHAR(120) NULL,
  ADD COLUMN reference_prompt TEXT NULL,
  ADD COLUMN reference_generation_job_id VARCHAR(36) NULL,
  ADD COLUMN reference_status ENUM('none', 'generating', 'succeeded', 'failed') NOT NULL DEFAULT 'none',
  ADD COLUMN reference_revision INT UNSIGNED NOT NULL DEFAULT 0;
