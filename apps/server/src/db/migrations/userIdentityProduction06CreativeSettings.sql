ALTER TABLE production_projects ADD COLUMN creative_settings JSON NULL;

UPDATE production_projects AS project
SET project.creative_settings = (
  SELECT JSON_EXTRACT(event.metadata, '$.generation')
  FROM audit_events AS event
  WHERE event.workspace_id = project.workspace_id
    AND event.action = 'productionProject.scriptCreated'
    AND JSON_UNQUOTE(JSON_EXTRACT(event.metadata, '$.projectId')) = project.id
  ORDER BY event.created_at DESC
  LIMIT 1
)
WHERE project.creative_settings IS NULL
  AND EXISTS (
    SELECT 1
    FROM audit_events AS event
    WHERE event.workspace_id = project.workspace_id
      AND event.action = 'productionProject.scriptCreated'
      AND JSON_UNQUOTE(JSON_EXTRACT(event.metadata, '$.projectId')) = project.id
  );
