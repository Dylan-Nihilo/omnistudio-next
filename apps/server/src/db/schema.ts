import {
  bigint,
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

const timestamps = {
  createdAt: datetime("created_at", { mode: "date" }).notNull(),
  updatedAt: datetime("updated_at", { mode: "date" }).notNull(),
};

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  status: mysqlEnum("status", ["active", "disabled"]).notNull().default("active"),
  ...timestamps,
}, table => ({ emailIndex: uniqueIndex("users_email_unique").on(table.email) }));

export const workspaces = mysqlTable("workspaces", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 160 }).notNull(),
  createdBy: varchar("created_by", { length: 36 }).notNull(),
  ...timestamps,
}, table => ({ slugIndex: uniqueIndex("workspaces_slug_unique").on(table.slug), creatorIndex: index("workspaces_creator_index").on(table.createdBy) }));

export const workspaceMemberships = mysqlTable("workspace_memberships", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspaceId: varchar("workspace_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  role: mysqlEnum("role", ["owner", "admin", "member"]).notNull().default("member"),
  ...timestamps,
}, table => ({ membershipIndex: uniqueIndex("workspace_membership_unique").on(table.workspaceId, table.userId), userIndex: index("workspace_membership_user_index").on(table.userId) }));

export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  csrfTokenHash: varchar("csrf_token_hash", { length: 128 }).notNull(),
  expiresAt: datetime("expires_at", { mode: "date" }).notNull(),
  revokedAt: datetime("revoked_at", { mode: "date" }),
  ...timestamps,
}, table => ({ tokenIndex: uniqueIndex("sessions_token_unique").on(table.tokenHash), userIndex: index("sessions_user_index").on(table.userId) }));

export const invitations = mysqlTable("invitations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspaceId: varchar("workspace_id", { length: 36 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["admin", "member"]).notNull().default("member"),
  tokenHash: varchar("token_hash", { length: 128 }).notNull(),
  expiresAt: datetime("expires_at", { mode: "date" }).notNull(),
  acceptedAt: datetime("accepted_at", { mode: "date" }),
  createdBy: varchar("created_by", { length: 36 }).notNull(),
  ...timestamps,
}, table => ({ tokenIndex: uniqueIndex("invitations_token_unique").on(table.tokenHash), workspaceEmailIndex: index("invitations_workspace_email_index").on(table.workspaceId, table.email) }));

export const platformRoles = mysqlTable("platform_roles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  role: mysqlEnum("role", ["root"]).notNull(),
  ...timestamps,
}, table => ({ userRoleIndex: uniqueIndex("platform_role_user_unique").on(table.userId, table.role) }));

export const wallets = mysqlTable("user_wallets", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  balance: decimal("balance", { precision: 26, scale: 6, unsigned: true }).notNull().default("0"),
  frozen: decimal("frozen", { precision: 26, scale: 6, unsigned: true }).notNull().default("0"),
  ...timestamps,
}, table => ({ userIndex: uniqueIndex("user_wallet_unique").on(table.userId) }));

export const priceBookVersions = mysqlTable("platform_price_book_versions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  version: int("version", { unsigned: true }).notNull(),
  status: mysqlEnum("status", ["draft", "published", "retired"]).notNull().default("draft"),
  publishedAt: datetime("published_at", { mode: "date" }),
  ...timestamps,
}, table => ({ versionIndex: uniqueIndex("price_book_version_unique").on(table.version) }));

export const pricingItems = mysqlTable("platform_pricing_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  priceBookVersionId: varchar("price_book_version_id", { length: 36 }).notNull(),
  providerId: varchar("provider_id", { length: 100 }).notNull(),
  modelId: varchar("model_id", { length: 200 }).notNull(),
  mediaType: mysqlEnum("media_type", ["text", "image", "video", "audio"]).notNull(),
  unit: varchar("unit", { length: 32 }).notNull(),
  creditsPerUnit: decimal("credits_per_unit", { precision: 20, scale: 4, mode: "string", unsigned: true }).notNull(),
  constraints: json("constraints").notNull(),
  ...timestamps,
}, table => ({ itemIndex: uniqueIndex("platform_pricing_item_unique").on(table.priceBookVersionId, table.providerId, table.modelId, table.mediaType) }));

export const pricingSettings = mysqlTable("platform_pricing_settings", {
  id: varchar("id", { length: 36 }).primaryKey(),
  activePriceBookVersionId: varchar("active_price_book_version_id", { length: 36 }),
  ...timestamps,
});

export const creditLedger = mysqlTable("user_credit_ledger", {
  id: varchar("id", { length: 36 }).primaryKey(),
  walletId: varchar("wallet_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  actorUserId: varchar("actor_user_id", { length: 36 }),
  jobId: varchar("job_id", { length: 36 }),
  kind: mysqlEnum("kind", ["grant", "adjustment", "reserve", "capture", "release", "transferIn", "transferOut"]).notNull(),
  amount: decimal("amount", { precision: 26, scale: 6 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 26, scale: 6, unsigned: true }).notNull(),
  frozenAfter: decimal("frozen_after", { precision: 26, scale: 6, unsigned: true }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 180 }).notNull(),
  reason: varchar("reason", { length: 500 }),
  metadata: json("metadata"),
  ...timestamps,
}, table => ({ idempotencyIndex: uniqueIndex("credit_ledger_idempotency_unique").on(table.idempotencyKey), walletIndex: index("credit_ledger_wallet_index").on(table.walletId, table.createdAt), jobIndex: index("credit_ledger_job_index").on(table.jobId) }));

export const generationJobs = mysqlTable("user_generation_jobs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  providerId: varchar("provider_id", { length: 100 }).notNull(),
  modelId: varchar("model_id", { length: 200 }).notNull(),
  mediaType: mysqlEnum("media_type", ["text", "image", "video", "audio"]).notNull(),
  status: mysqlEnum("status", ["quoted", "reserved", "running", "succeeded", "failed", "cancelled"]).notNull().default("quoted"),
  quotedCredits: decimal("quoted_credits", { precision: 26, scale: 6, unsigned: true }).notNull(),
  capturedCredits: decimal("captured_credits", { precision: 26, scale: 6, unsigned: true }).notNull().default("0"),
  priceBookVersionId: varchar("price_book_version_id", { length: 36 }),
  idempotencyKey: varchar("idempotency_key", { length: 180 }).notNull(),
  requestSnapshot: json("request_snapshot").notNull(),
  resultSnapshot: json("result_snapshot"),
  ...timestamps,
}, table => ({ idempotencyIndex: uniqueIndex("user_generation_job_idempotency_unique").on(table.idempotencyKey), userIndex: index("user_generation_job_user_index").on(table.userId, table.createdAt) }));

export const generationUsageDaily = mysqlTable("generation_usage_daily", {
  id: varchar("id", { length: 36 }).primaryKey(),
  day: varchar("day", { length: 10 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  directoryHash: varchar("directory_hash", { length: 64 }).notNull(),
  workspaceName: varchar("workspace_name", { length: 255 }).notNull(),
  providerId: varchar("provider_id", { length: 100 }).notNull(),
  modelId: varchar("model_id", { length: 200 }).notNull(),
  mediaType: mysqlEnum("media_type", ["text", "image", "video", "audio"]).notNull(),
  videoBillingKind: varchar("video_billing_kind", { length: 32 }).notNull().default("none"),
  requestCount: int("request_count", { unsigned: true }).notNull().default(0),
  successCount: int("success_count", { unsigned: true }).notNull().default(0),
  failedCount: int("failed_count", { unsigned: true }).notNull().default(0),
  outputCount: int("output_count", { unsigned: true }).notNull().default(0),
  units: decimal("units", { precision: 26, scale: 6, mode: "string", unsigned: true }).notNull().default("0"),
  capturedCredits: decimal("captured_credits", { precision: 26, scale: 6, mode: "string", unsigned: true }).notNull().default("0"),
  billableInputTokens: decimal("billable_input_tokens", { precision: 26, scale: 0, mode: "string", unsigned: true }).notNull().default("0"),
  outputTokens: decimal("output_tokens", { precision: 26, scale: 0, mode: "string", unsigned: true }).notNull().default("0"),
  videoSeconds: decimal("video_seconds", { precision: 26, scale: 6, mode: "string", unsigned: true }).notNull().default("0"),
  pendingCount: int("pending_count", { unsigned: true }).notNull().default(0),
  usableCount: int("usable_count", { unsigned: true }).notNull().default(0),
  wasteCount: int("waste_count", { unsigned: true }).notNull().default(0),
  ...timestamps,
}, table => ({ summaryIndex: uniqueIndex("generation_usage_daily_unique").on(table.day, table.userId, table.directoryHash, table.providerId, table.modelId, table.mediaType, table.videoBillingKind), userIndex: index("generation_usage_daily_user_index").on(table.userId, table.day) }));

export const generationOutputs = mysqlTable("generation_outputs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  jobId: varchar("job_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  outputIndex: int("output_index", { unsigned: true }).notNull(),
  mediaType: mysqlEnum("media_type", ["text", "image", "video", "audio"]).notNull(),
  status: mysqlEnum("status", ["pending", "usable", "waste"]).notNull().default("pending"),
  wasteReason: varchar("waste_reason", { length: 500 }),
  outputSnapshot: json("output_snapshot").notNull(),
  reviewedBy: varchar("reviewed_by", { length: 36 }),
  reviewedAt: datetime("reviewed_at", { mode: "date" }),
  ...timestamps,
}, table => ({ jobOutputIndex: uniqueIndex("generation_output_job_index_unique").on(table.jobId, table.outputIndex), userStatusIndex: index("generation_output_user_status_index").on(table.userId, table.status, table.createdAt) }));

export const teams = mysqlTable("user_teams", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  ownerUserId: varchar("owner_user_id", { length: 36 }).notNull(),
  status: mysqlEnum("status", ["active", "archived"]).notNull().default("active"),
  ...timestamps,
}, table => ({ ownerIndex: index("user_team_owner_index").on(table.ownerUserId) }));

export const teamMembers = mysqlTable("user_team_members", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 }).notNull(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  role: mysqlEnum("role", ["owner", "member"]).notNull().default("member"),
  ...timestamps,
}, table => ({ memberIndex: uniqueIndex("user_team_member_unique").on(table.teamId, table.userId), userIndex: index("user_team_member_user_index").on(table.userId) }));

export const teamInvitations = mysqlTable("user_team_invitations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: datetime("expires_at", { mode: "date" }).notNull(),
  acceptedAt: datetime("accepted_at", { mode: "date" }),
  revokedAt: datetime("revoked_at", { mode: "date" }),
  createdBy: varchar("created_by", { length: 36 }).notNull(),
  ...timestamps,
}, table => ({ tokenIndex: uniqueIndex("user_team_invitation_token_unique").on(table.tokenHash), teamIndex: index("user_team_invitation_team_index").on(table.teamId, table.email) }));

export const personalProjects = mysqlTable("personal_projects", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  directory: text("directory").notNull(),
  directoryHash: varchar("directory_hash", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  ...timestamps,
}, table => ({ directoryIndex: uniqueIndex("personal_project_directory_unique").on(table.directoryHash), userIndex: index("personal_project_user_index").on(table.userId) }));

export const teamAssets = mysqlTable("user_team_assets", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 }).notNull(),
  uploadedBy: varchar("uploaded_by", { length: 36 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 150 }).notNull(),
  bytes: bigint("bytes", { mode: "number", unsigned: true }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  ...timestamps,
}, table => ({ teamIndex: index("user_team_asset_team_index").on(table.teamId, table.createdAt) }));

export const creditTransfers = mysqlTable("user_credit_transfers", {
  id: varchar("id", { length: 36 }).primaryKey(),
  teamId: varchar("team_id", { length: 36 }).notNull(),
  senderUserId: varchar("sender_user_id", { length: 36 }).notNull(),
  recipientUserId: varchar("recipient_user_id", { length: 36 }).notNull(),
  amount: decimal("amount", { precision: 26, scale: 6, unsigned: true }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  reason: varchar("reason", { length: 500 }).notNull(),
  ...timestamps,
}, table => ({ idempotencyIndex: uniqueIndex("user_credit_transfer_idempotency_unique").on(table.senderUserId, table.idempotencyKey) }));

export const serviceCredentials = mysqlTable("user_service_credentials", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).notNull(),
  kind: mysqlEnum("kind", ["mcp", "a2a"]).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  enabled: int("enabled", { unsigned: true }).notNull().default(1),
  ...timestamps,
}, table => ({ tokenIndex: uniqueIndex("user_service_token_unique").on(table.tokenHash), userKindIndex: uniqueIndex("user_service_kind_unique").on(table.userId, table.kind) }));

export const platformSecrets = mysqlTable("platform_secrets", {
  id: varchar("id", { length: 100 }).primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  ...timestamps,
});

export const auditEvents = mysqlTable("audit_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  actorUserId: varchar("actor_user_id", { length: 36 }),
  workspaceId: varchar("workspace_id", { length: 36 }),
  action: varchar("action", { length: 160 }).notNull(),
  requestId: varchar("request_id", { length: 100 }),
  metadata: json("metadata"),
  ...timestamps,
}, table => ({ actionIndex: index("audit_event_action_index").on(table.action, table.createdAt) }));

export const platformProviderConfigs = mysqlTable("platform_provider_configs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  providerId: varchar("provider_id", { length: 100 }).notNull(),
  enabled: int("enabled", { unsigned: true }).notNull().default(1),
  config: json("config").notNull(),
  secretRef: varchar("secret_ref", { length: 200 }),
  ...timestamps,
}, table => ({ providerIndex: uniqueIndex("platform_provider_unique").on(table.providerId) }));

export const providerHealth = mysqlTable("provider_health", {
  id: varchar("id", { length: 36 }).primaryKey(),
  providerId: varchar("provider_id", { length: 100 }).notNull(),
  status: mysqlEnum("status", ["unknown", "healthy", "degraded", "unavailable"]).notNull().default("unknown"),
  checkedAt: datetime("checked_at", { mode: "date" }).notNull(),
  message: varchar("message", { length: 500 }),
  ...timestamps,
}, table => ({ providerIndex: uniqueIndex("provider_health_unique").on(table.providerId) }));

export const platformModels = mysqlTable("platform_models", {
  id: varchar("id", { length: 36 }).primaryKey(),
  providerId: varchar("provider_id", { length: 100 }).notNull(),
  modelId: varchar("model_id", { length: 200 }).notNull(),
  label: varchar("label", { length: 200 }).notNull(),
  mediaType: mysqlEnum("media_type", ["text", "image", "video", "audio"]).notNull(),
  apiModelId: varchar("api_model_id", { length: 200 }),
  enabled: int("enabled", { unsigned: true }).notNull().default(1),
  capabilities: json("capabilities"),
  sortOrder: int("sort_order").notNull().default(0),
  ...timestamps,
}, table => ({ modelIndex: uniqueIndex("platform_model_unique").on(table.providerId, table.modelId, table.mediaType), enabledIndex: index("platform_model_enabled_index").on(table.mediaType, table.enabled, table.sortOrder) }));

export const schema = {
  users,
  workspaces,
  workspaceMemberships,
  sessions,
  invitations,
  platformRoles,
  wallets,
  priceBookVersions,
  pricingItems,
  pricingSettings,
  creditLedger,
  generationJobs,
  generationUsageDaily,
  generationOutputs,
  auditEvents,
  platformProviderConfigs,
  providerHealth,
  platformModels,
  teams,
  teamMembers,
  teamInvitations,
  personalProjects,
  teamAssets,
  creditTransfers,
  serviceCredentials,
  platformSecrets,
};

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Wallet = typeof wallets.$inferSelect;
export type CreditLedgerEntry = typeof creditLedger.$inferSelect;

export default schema;
