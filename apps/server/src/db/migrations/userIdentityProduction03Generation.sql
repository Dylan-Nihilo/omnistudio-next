ALTER TABLE user_generation_jobs
  ADD COLUMN project_id VARCHAR(36) NULL AFTER user_id,
  ADD COLUMN season_id VARCHAR(36) NULL AFTER project_id,
  ADD COLUMN episode_id VARCHAR(36) NULL AFTER season_id,
  ADD COLUMN scene_id VARCHAR(36) NULL AFTER episode_id,
  ADD COLUMN shot_id VARCHAR(36) NULL AFTER scene_id,
  ADD COLUMN attempt_number INT UNSIGNED NULL AFTER shot_id,
  ADD COLUMN estimated_cost_cents DECIMAL(26,6) UNSIGNED NOT NULL DEFAULT 0 AFTER captured_credits,
  ADD COLUMN reserved_cost_cents DECIMAL(26,6) UNSIGNED NOT NULL DEFAULT 0 AFTER estimated_cost_cents,
  ADD COLUMN actual_cost_cents DECIMAL(26,6) UNSIGNED NOT NULL DEFAULT 0 AFTER reserved_cost_cents,
  ADD KEY user_generation_job_project_index (project_id, created_at),
  ADD KEY user_generation_job_shot_index (shot_id, attempt_number);

CREATE TABLE IF NOT EXISTS production_clip_variants (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  shot_id VARCHAR(36) NOT NULL,
  generation_job_id VARCHAR(36) NOT NULL,
  attempt_number INT UNSIGNED NOT NULL,
  media_type ENUM('image', 'video', 'audio') NOT NULL,
  file_path VARCHAR(2048) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  status ENUM('candidate', 'changesRequested', 'approved', 'rejected') NOT NULL DEFAULT 'candidate',
  prompt_snapshot JSON NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY production_clip_variant_shot_attempt_unique (shot_id, attempt_number),
  KEY production_clip_variant_project_index (project_id, created_at),
  KEY production_clip_variant_job_index (generation_job_id),
  CONSTRAINT production_clip_variant_project_fk FOREIGN KEY (project_id) REFERENCES production_projects(id) ON DELETE CASCADE,
  CONSTRAINT production_clip_variant_shot_fk FOREIGN KEY (shot_id) REFERENCES production_shots(id) ON DELETE CASCADE,
  CONSTRAINT production_clip_variant_creator_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
