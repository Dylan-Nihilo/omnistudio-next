CREATE TABLE IF NOT EXISTS production_script_drafts (
  project_id VARCHAR(36) NOT NULL PRIMARY KEY,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  draft_data JSON NOT NULL,
  generation_data JSON NULL,
  updated_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY production_script_draft_updated_by_index (updated_by, updated_at),
  CONSTRAINT production_script_draft_project_fk FOREIGN KEY (project_id) REFERENCES production_projects(id) ON DELETE CASCADE,
  CONSTRAINT production_script_draft_user_fk FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
