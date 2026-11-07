CREATE TABLE IF NOT EXISTS production_project_assets (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  asset_type ENUM('character', 'scene', 'prop') NOT NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  visual_description TEXT NULL,
  episode_ids JSON NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY production_project_asset_project_index (project_id, asset_type, created_at),
  CONSTRAINT production_project_asset_project_fk FOREIGN KEY (project_id) REFERENCES production_projects(id) ON DELETE CASCADE,
  CONSTRAINT production_project_asset_creator_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
