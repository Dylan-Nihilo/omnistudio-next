CREATE TABLE IF NOT EXISTS production_deliveries (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  status ENUM('completed', 'failed') NOT NULL,
  mp4_path VARCHAR(2048) NOT NULL,
  srt_path VARCHAR(2048) NOT NULL,
  manifest_path VARCHAR(2048) NOT NULL,
  audit_package_path VARCHAR(2048) NOT NULL,
  manifest_hash CHAR(64) NOT NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY production_delivery_project_index (project_id, created_at),
  CONSTRAINT production_delivery_project_fk FOREIGN KEY (project_id) REFERENCES production_projects(id) ON DELETE CASCADE,
  CONSTRAINT production_delivery_creator_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
