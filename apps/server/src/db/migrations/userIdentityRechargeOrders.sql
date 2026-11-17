CREATE TABLE IF NOT EXISTS user_recharge_orders (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  package_id VARCHAR(48) NOT NULL,
  package_name VARCHAR(80) NOT NULL,
  credits DECIMAL(26, 6) UNSIGNED NOT NULL,
  amount_cents INT UNSIGNED NOT NULL,
  payment_method ENUM('alipay', 'wechat') NOT NULL,
  status ENUM('pending', 'paid', 'cancelled', 'expired') NOT NULL DEFAULT 'pending',
  agreement_version VARCHAR(32) NOT NULL,
  idempotency_key VARCHAR(180) NOT NULL,
  provider_trade_no VARCHAR(128) NULL,
  expires_at DATETIME NOT NULL,
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY user_recharge_order_idempotency_unique (idempotency_key),
  UNIQUE KEY user_recharge_order_provider_trade_unique (provider_trade_no),
  KEY user_recharge_order_user_index (user_id, created_at),
  KEY user_recharge_order_status_index (status, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE user_credit_ledger
  MODIFY kind ENUM('grant', 'adjustment', 'reserve', 'capture', 'release', 'transferIn', 'transferOut', 'recharge') NOT NULL;
