ALTER TABLE editor_render_jobs
  ADD COLUMN request_id VARCHAR(36) NULL AFTER project_name,
  ADD COLUMN request_hash CHAR(64) NULL AFTER request_id;

UPDATE editor_render_jobs
SET request_id = UUID(), request_hash = SHA2(CAST(payload AS CHAR), 256)
WHERE request_id IS NULL OR request_hash IS NULL;

ALTER TABLE editor_render_jobs
  MODIFY COLUMN request_id VARCHAR(36) NOT NULL,
  MODIFY COLUMN request_hash CHAR(64) NOT NULL,
  ADD UNIQUE KEY editor_render_request_unique (user_id, request_id);
