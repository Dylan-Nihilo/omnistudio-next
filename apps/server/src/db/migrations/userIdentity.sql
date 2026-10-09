CREATE TABLE IF NOT EXISTS user_wallets (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  balance BIGINT UNSIGNED NOT NULL DEFAULT 0,
  frozen BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY user_wallet_unique (user_id),
  CONSTRAINT user_wallet_frozen_lte_balance CHECK (frozen <= balance),
  CONSTRAINT user_wallet_safe_balance CHECK (balance <= 9007199254740991),
  CONSTRAINT user_wallet_user_fk FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_teams (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  owner_user_id VARCHAR(36) NOT NULL,
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY user_team_owner_index (owner_user_id),
  CONSTRAINT user_team_owner_fk FOREIGN KEY (owner_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_team_members (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  team_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role ENUM('owner', 'member') NOT NULL DEFAULT 'member',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY user_team_member_unique (team_id, user_id),
  KEY user_team_member_user_index (user_id),
  CONSTRAINT user_team_member_team_fk FOREIGN KEY (team_id) REFERENCES user_teams(id),
  CONSTRAINT user_team_member_user_fk FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_team_invitations (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  team_id VARCHAR(36) NOT NULL,
  email VARCHAR(320) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY user_team_invitation_token_unique (token_hash),
  KEY user_team_invitation_team_index (team_id, email),
  CONSTRAINT user_team_invitation_team_fk FOREIGN KEY (team_id) REFERENCES user_teams(id),
  CONSTRAINT user_team_invitation_creator_fk FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_projects (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  directory TEXT NOT NULL,
  directory_hash VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY personal_project_directory_unique (directory_hash),
  KEY personal_project_user_index (user_id),
  CONSTRAINT personal_project_user_fk FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_team_assets (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  team_id VARCHAR(36) NOT NULL,
  uploaded_by VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  bytes BIGINT UNSIGNED NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY user_team_asset_team_index (team_id, created_at),
  CONSTRAINT user_team_asset_team_fk FOREIGN KEY (team_id) REFERENCES user_teams(id),
  CONSTRAINT user_team_asset_user_fk FOREIGN KEY (uploaded_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_credit_transfers (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  team_id VARCHAR(36) NOT NULL,
  sender_user_id VARCHAR(36) NOT NULL,
  recipient_user_id VARCHAR(36) NOT NULL,
  amount BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY user_credit_transfer_idempotency_unique (sender_user_id, idempotency_key),
  CONSTRAINT user_credit_transfer_positive CHECK (amount > 0),
  CONSTRAINT user_credit_transfer_distinct CHECK (sender_user_id <> recipient_user_id),
  CONSTRAINT user_credit_transfer_sender_fk FOREIGN KEY (sender_user_id) REFERENCES users(id),
  CONSTRAINT user_credit_transfer_recipient_fk FOREIGN KEY (recipient_user_id) REFERENCES users(id),
  CONSTRAINT user_credit_transfer_team_fk FOREIGN KEY (team_id) REFERENCES user_teams(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_credit_ledger (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  wallet_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  actor_user_id VARCHAR(36) NULL,
  job_id VARCHAR(36) NULL,
  kind ENUM('grant', 'adjustment', 'reserve', 'capture', 'release', 'transferIn', 'transferOut') NOT NULL,
  amount BIGINT NOT NULL,
  balance_after BIGINT UNSIGNED NOT NULL,
  frozen_after BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(180) NOT NULL,
  reason VARCHAR(500) NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY credit_ledger_idempotency_unique (idempotency_key),
  KEY credit_ledger_wallet_index (wallet_id, created_at),
  KEY credit_ledger_job_index (job_id),
  CONSTRAINT user_credit_ledger_wallet_fk FOREIGN KEY (wallet_id) REFERENCES user_wallets(id),
  CONSTRAINT user_credit_ledger_user_fk FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_generation_jobs (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  provider_id VARCHAR(100) NOT NULL,
  model_id VARCHAR(200) NOT NULL,
  media_type ENUM('text', 'image', 'video', 'audio') NOT NULL,
  status ENUM('quoted', 'reserved', 'running', 'succeeded', 'failed', 'cancelled') NOT NULL DEFAULT 'quoted',
  quoted_credits BIGINT UNSIGNED NOT NULL,
  captured_credits BIGINT UNSIGNED NOT NULL DEFAULT 0,
  price_book_version_id VARCHAR(36) NULL,
  idempotency_key VARCHAR(180) NOT NULL,
  request_snapshot JSON NOT NULL,
  result_snapshot JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY user_generation_job_idempotency_unique (idempotency_key),
  KEY user_generation_job_user_index (user_id, created_at),
  CONSTRAINT user_generation_job_user_fk FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_service_credentials (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  kind ENUM('mcp', 'a2a') NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  enabled INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY user_service_token_unique (token_hash),
  UNIQUE KEY user_service_kind_unique (user_id, kind),
  CONSTRAINT user_service_user_fk FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_secrets (
  id VARCHAR(100) NOT NULL PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_price_book_versions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  version INT UNSIGNED NOT NULL,
  status ENUM('draft', 'published', 'retired') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY price_book_version_unique (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_pricing_items (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  price_book_version_id VARCHAR(36) NOT NULL,
  provider_id VARCHAR(100) NOT NULL,
  model_id VARCHAR(200) NOT NULL,
  media_type ENUM('text', 'image', 'video', 'audio') NOT NULL,
  unit VARCHAR(32) NOT NULL,
  credits_per_unit BIGINT UNSIGNED NOT NULL,
  constraints JSON NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY platform_pricing_item_unique (price_book_version_id, provider_id, model_id, media_type),
  CONSTRAINT platform_pricing_version_fk FOREIGN KEY (price_book_version_id) REFERENCES platform_price_book_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_pricing_settings (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  active_price_book_version_id VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO user_wallets (id, user_id, balance, frozen, created_at, updated_at)
SELECT UUID(), id, 0, 0, created_at, updated_at FROM users;

INSERT IGNORE INTO user_teams (id, name, owner_user_id, status, created_at, updated_at)
SELECT id, name, created_by, 'active', created_at, updated_at FROM workspaces;

INSERT IGNORE INTO user_team_members (id, team_id, user_id, role, created_at, updated_at)
SELECT id, workspace_id, user_id, IF(role = 'owner', 'owner', 'member'), created_at, updated_at FROM workspace_memberships;

DELETE FROM platform_roles WHERE role = 'admin';
ALTER TABLE platform_roles MODIFY role ENUM('root') NOT NULL;
