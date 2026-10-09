-- ACT: 旧团队积分归创建者，多团队合并到一个个人钱包；由迁移器事务和迁移记录保证只入账一次。
INSERT INTO user_wallets (id, user_id, balance, frozen, created_at, updated_at)
SELECT UUID(), u.id, 0, 0, u.created_at, u.updated_at FROM users u
WHERE NOT EXISTS (SELECT 1 FROM user_wallets n WHERE n.user_id = u.id);

UPDATE user_wallets n
INNER JOIN (
  SELECT w.created_by AS user_id, SUM(a.balance) AS balance, SUM(a.frozen) AS frozen
  FROM wallets a INNER JOIN workspaces w ON w.id = a.workspace_id
  GROUP BY w.created_by
) a ON a.user_id = n.user_id
SET n.balance = n.balance + a.balance, n.frozen = n.frozen + a.frozen, n.updated_at = UTC_TIMESTAMP();

INSERT INTO user_credit_ledger (
  id, wallet_id, user_id, actor_user_id, job_id, kind, amount, balance_after, frozen_after,
  idempotency_key, reason, metadata, created_at, updated_at
)
SELECT l.id, n.id, w.created_by, l.actor_user_id, l.job_id, l.kind, l.amount, l.balance_after, l.frozen_after,
  l.idempotency_key, l.reason,
  JSON_SET(COALESCE(l.metadata, JSON_OBJECT()), '$.legacyWorkspaceId', l.workspace_id, '$.legacyWalletId', l.wallet_id),
  l.created_at, l.updated_at
FROM credit_ledger l
INNER JOIN workspaces w ON w.id = l.workspace_id
INNER JOIN user_wallets n ON n.user_id = w.created_by;

INSERT INTO user_generation_jobs (
  id, user_id, provider_id, model_id, media_type, status, quoted_credits, captured_credits,
  price_book_version_id, idempotency_key, request_snapshot, result_snapshot, created_at, updated_at
)
SELECT g.id, w.created_by,
  COALESCE(NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(g.request_snapshot, '$.providerId')), 'null'), ''),
    (SELECT MIN(m.provider_id) FROM platform_models m WHERE m.model_id = g.model_id AND m.media_type = g.media_type)),
  g.model_id, g.media_type, g.status, g.quoted_credits, g.captured_credits,
  g.price_book_version_id, g.idempotency_key,
  JSON_SET(g.request_snapshot, '$.legacyUserId', g.user_id, '$.legacyWorkspaceId', g.workspace_id),
  g.result_snapshot, g.created_at, g.updated_at
FROM generation_jobs g INNER JOIN workspaces w ON w.id = g.workspace_id;

INSERT INTO platform_price_book_versions (id, version, status, published_at, created_at, updated_at)
SELECT id, version, status, published_at, created_at, updated_at FROM price_book_versions;

INSERT INTO platform_pricing_items (
  id, price_book_version_id, provider_id, model_id, media_type, unit, credits_per_unit, `constraints`, created_at, updated_at
)
SELECT UUID(), p.price_book_version_id, m.provider_id, p.model_id, p.media_type, p.unit,
  p.credits_per_unit, p.`constraints`, p.created_at, p.updated_at
FROM pricing_items p INNER JOIN platform_models m ON m.model_id = p.model_id AND m.media_type = p.media_type;

INSERT INTO platform_pricing_settings (id, active_price_book_version_id, created_at, updated_at)
SELECT 'platform', active_price_book_version_id, created_at, updated_at FROM pricing_settings
WHERE active_price_book_version_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM platform_pricing_settings WHERE id = 'platform')
ORDER BY updated_at DESC, id LIMIT 1;

INSERT INTO user_team_invitations (
  id, team_id, email, token_hash, expires_at, accepted_at, created_by, created_at, updated_at
)
SELECT id, workspace_id, email, token_hash, expires_at, accepted_at, created_by, created_at, updated_at FROM invitations;
