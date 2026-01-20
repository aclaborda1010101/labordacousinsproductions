-- Add 'obsolete' status to project_outlines constraint
ALTER TABLE project_outlines 
DROP CONSTRAINT IF EXISTS project_outlines_status_check;

ALTER TABLE project_outlines 
ADD CONSTRAINT project_outlines_status_check 
CHECK (status = ANY (ARRAY[
  'idle'::text, 'queued'::text, 'generating'::text, 'completed'::text, 'draft'::text, 
  'approved'::text, 'failed'::text, 'timeout'::text, 'error'::text, 'stalled'::text, 'obsolete'::text
]));