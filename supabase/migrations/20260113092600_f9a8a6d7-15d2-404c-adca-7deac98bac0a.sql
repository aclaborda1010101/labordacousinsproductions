-- Delete the orphaned draft outline that duplicates the completed one
DELETE FROM project_outlines 
WHERE id = '56ee205e-3097-4332-b05e-18a6f1f3e620';

-- Also clean up any other drafts that have the same outline_json as a completed outline
DELETE FROM project_outlines po1
WHERE po1.status = 'draft'
  AND EXISTS (
    SELECT 1 FROM project_outlines po2
    WHERE po2.project_id = po1.project_id
      AND po2.status IN ('completed', 'approved')
      AND po2.outline_json IS NOT NULL
      AND po1.outline_json IS NOT NULL
      AND po2.id != po1.id
      AND po2.created_at < po1.created_at
  );