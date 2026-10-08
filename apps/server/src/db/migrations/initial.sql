CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(320) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  password_hash TEXT NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY users_email_unique (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY workspaces_slug_unique (slug),
  KEY workspaces_creator_index (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS workspace_memberships (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role ENUM('owner', 'admin', 'member') NOT NULL DEFAULT 'member',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY workspace_membership_unique (workspace_id, user_id),
  KEY workspace_membership_user_index (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  csrf_token_hash VARCHAR(128) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY sessions_token_unique (token_hash),
  KEY sessions_user_index (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invitations (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL,
  email VARCHAR(320) NOT NULL,
  role ENUM('admin', 'member') NOT NULL DEFAULT 'member',
  token_hash VARCHAR(128) NOT NULL,
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME NULL,
  created_by VARCHAR(36) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY invitations_token_unique (token_hash),
  KEY invitations_workspace_email_index (workspace_id, email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_roles (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  role ENUM('root', 'admin') NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY platform_role_user_unique (user_id, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS wallets (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL,
  balance BIGINT UNSIGNED NOT NULL DEFAULT 0,
  frozen BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY wallet_workspace_unique (workspace_id),
  CONSTRAINT wallet_frozen_lte_balance CHECK (frozen <= balance)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS price_book_versions (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  version INT UNSIGNED NOT NULL,
  status ENUM('draft', 'published', 'retired') NOT NULL DEFAULT 'draft',
  published_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY price_book_version_unique (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pricing_items (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  price_book_version_id VARCHAR(36) NOT NULL,
  model_id VARCHAR(200) NOT NULL,
  media_type ENUM('text', 'image', 'video', 'audio') NOT NULL,
  unit VARCHAR(32) NOT NULL,
  credits_per_unit BIGINT UNSIGNED NOT NULL,
  constraints JSON NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY pricing_item_unique (price_book_version_id, model_id, media_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pricing_settings (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  active_price_book_version_id VARCHAR(36) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS credit_ledger (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  wallet_id VARCHAR(36) NOT NULL,
  workspace_id VARCHAR(36) NOT NULL,
  actor_user_id VARCHAR(36) NULL,
  job_id VARCHAR(36) NULL,
  kind ENUM('grant', 'adjustment', 'reserve', 'capture', 'release') NOT NULL,
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
  KEY credit_ledger_job_index (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS generation_jobs (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  workspace_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
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
  UNIQUE KEY generation_job_idempotency_unique (idempotency_key),
  KEY generation_job_workspace_index (workspace_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_events (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  actor_user_id VARCHAR(36) NULL,
  workspace_id VARCHAR(36) NULL,
  action VARCHAR(160) NOT NULL,
  request_id VARCHAR(100) NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY audit_event_action_index (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_provider_configs (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  provider_id VARCHAR(100) NOT NULL,
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1,
  config JSON NOT NULL,
  secret_ref VARCHAR(200) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY platform_provider_unique (provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS provider_health (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  provider_id VARCHAR(100) NOT NULL,
  status ENUM('unknown', 'healthy', 'degraded', 'unavailable') NOT NULL DEFAULT 'unknown',
  checked_at DATETIME NOT NULL,
  message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY provider_health_unique (provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS platform_models (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  provider_id VARCHAR(100) NOT NULL,
  model_id VARCHAR(200) NOT NULL,
  label VARCHAR(200) NOT NULL,
  media_type ENUM('text', 'image', 'video', 'audio') NOT NULL,
  api_model_id VARCHAR(200) NULL,
  enabled TINYINT UNSIGNED NOT NULL DEFAULT 1,
  capabilities JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY platform_model_unique (provider_id, model_id, media_type),
  KEY platform_model_enabled_index (media_type, enabled, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
