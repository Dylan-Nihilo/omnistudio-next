CREATE TABLE IF NOT EXISTS production_reviews (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  shot_id VARCHAR(36) NOT NULL,
  variant_id VARCHAR(36) NOT NULL,
  author_user_id VARCHAR(36) NOT NULL,
  body TEXT NOT NULL,
  timecode_ms INT UNSIGNED NULL,
  mentions JSON NULL,
  status ENUM('open', 'resolved') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY production_review_variant_index (variant_id, created_at),
  KEY production_review_project_index (project_id, created_at),
  CONSTRAINT production_review_project_fk FOREIGN KEY (project_id) REFERENCES production_projects(id) ON DELETE CASCADE,
  CONSTRAINT production_review_shot_fk FOREIGN KEY (shot_id) REFERENCES production_shots(id) ON DELETE CASCADE,
  CONSTRAINT production_review_variant_fk FOREIGN KEY (variant_id) REFERENCES production_clip_variants(id) ON DELETE CASCADE,
  CONSTRAINT production_review_author_fk FOREIGN KEY (author_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS production_approvals (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  project_id VARCHAR(36) NOT NULL,
  shot_id VARCHAR(36) NOT NULL,
  variant_id VARCHAR(36) NOT NULL,
  actor_user_id VARCHAR(36) NOT NULL,
  decision ENUM('approved', 'changesRequested') NOT NULL,
  comment TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY production_approval_variant_index (variant_id, created_at),
  KEY production_approval_project_index (project_id, created_at),
  CONSTRAINT production_approval_project_fk FOREIGN KEY (project_id) REFERENCES production_projects(id) ON DELETE CASCADE,
  CONSTRAINT production_approval_shot_fk FOREIGN KEY (shot_id) REFERENCES production_shots(id) ON DELETE CASCADE,
  CONSTRAINT production_approval_variant_fk FOREIGN KEY (variant_id) REFERENCES production_clip_variants(id) ON DELETE CASCADE,
  CONSTRAINT production_approval_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
