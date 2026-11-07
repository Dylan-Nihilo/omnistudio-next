CREATE TABLE IF NOT EXISTS production_script_records (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  generation_data JSON NOT NULL,
  confirmed_snapshot JSON NOT NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY production_script_record_project_revision_unique (project_id, revision),
  KEY production_script_record_creator_index (created_by, created_at),
  CONSTRAINT production_script_record_project_fk FOREIGN KEY (project_id) REFERENCES production_projects(id) ON DELETE CASCADE,
  CONSTRAINT production_script_record_creator_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
