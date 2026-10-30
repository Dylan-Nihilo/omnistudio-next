CREATE TABLE IF NOT EXISTS production_projects (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL,
  customer_id VARCHAR(36) NULL,
  title VARCHAR(200) NOT NULL,
  status ENUM('draft', 'scripted', 'storyboarded', 'generating', 'editing', 'review', 'approved', 'delivered') NOT NULL DEFAULT 'draft',
  budget_cents DECIMAL(26,6) UNSIGNED NOT NULL DEFAULT 0,
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY production_project_workspace_index (workspace_id, created_at),
  KEY production_project_creator_index (created_by),
  CONSTRAINT production_project_workspace_fk FOREIGN KEY (workspace_id) REFERENCES user_teams(id),
  CONSTRAINT production_project_creator_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS production_seasons (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  season_number INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  status ENUM('draft', 'active', 'archived') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY production_season_unique (project_id, season_number),
  KEY production_season_project_index (project_id, season_number),
  CONSTRAINT production_season_project_fk FOREIGN KEY (project_id) REFERENCES production_projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS production_episodes (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  season_id VARCHAR(36) NOT NULL,
  episode_number INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  status ENUM('draft', 'scripted', 'storyboarded', 'generating', 'editing', 'review', 'approved', 'delivered') NOT NULL DEFAULT 'draft',
  target_duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY production_episode_unique (season_id, episode_number),
  KEY production_episode_season_index (season_id, episode_number),
  CONSTRAINT production_episode_season_fk FOREIGN KEY (season_id) REFERENCES production_seasons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS production_scenes (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  episode_id VARCHAR(36) NOT NULL,
  scene_number INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  continuity_notes TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY production_scene_unique (episode_id, scene_number),
  KEY production_scene_episode_index (episode_id, scene_number),
  CONSTRAINT production_scene_episode_fk FOREIGN KEY (episode_id) REFERENCES production_episodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS production_shots (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  scene_id VARCHAR(36) NOT NULL,
  shot_number INT UNSIGNED NOT NULL,
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  shot_type VARCHAR(80) NULL,
  camera VARCHAR(500) NULL,
  lighting VARCHAR(500) NULL,
  dialogue TEXT NULL,
  narration TEXT NULL,
  prompt TEXT NULL,
  status ENUM('draft', 'ready', 'generating', 'review', 'changesRequested', 'approved') NOT NULL DEFAULT 'draft',
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY production_shot_unique (scene_id, shot_number),
  KEY production_shot_scene_index (scene_id, shot_number),
  CONSTRAINT production_shot_scene_fk FOREIGN KEY (scene_id) REFERENCES production_scenes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS production_project_members (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role ENUM('owner', 'producer', 'writer', 'director', 'artist', 'editor', 'reviewer', 'viewer') NOT NULL DEFAULT 'viewer',
  status ENUM('active', 'removed') NOT NULL DEFAULT 'active',
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY production_project_member_unique (project_id, user_id),
  KEY production_project_member_user_index (user_id, status),
  CONSTRAINT production_project_member_project_fk FOREIGN KEY (project_id) REFERENCES production_projects(id) ON DELETE CASCADE,
  CONSTRAINT production_project_member_user_fk FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT production_project_member_creator_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
