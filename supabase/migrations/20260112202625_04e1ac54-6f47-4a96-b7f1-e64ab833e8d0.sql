-- V3 Async Outline Engine: Job State + Progress Columns + TTL Recovery

-- 1) Add new columns for async job state (idempotent)
ALTER TABLE project_outlines
ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS progress INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS attempts INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS error_code TEXT,
ADD COLUMN IF NOT EXISTS error_detail TEXT,
ADD COLUMN IF NOT EXISTS input_chars INT,
ADD COLUMN IF NOT EXISTS summary_text TEXT;

-- 2) Add constraint for progress range (drop first if exists to recreate)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'progress_range_check') THEN
    ALTER TABLE project_outlines DROP CONSTRAINT progress_range_check;
  END IF;
END $$;

ALTER TABLE project_outlines ADD CONSTRAINT progress_range_check CHECK (progress >= 0 AND progress <= 100);

-- 3) Update status constraint to include new states
DO $$
BEGIN
  -- Drop old constraint if exists
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_outlines_status_check') THEN
    ALTER TABLE project_outlines DROP CONSTRAINT project_outlines_status_check;
  END IF;
END $$;

ALTER TABLE project_outlines ADD CONSTRAINT project_outlines_status_check 
  CHECK (status IN ('idle', 'queued', 'generating', 'completed', 'draft', 'approved', 'failed', 'timeout', 'error'));

-- 4) Create index for efficient polling queries
CREATE INDEX IF NOT EXISTS idx_project_outlines_status_updated ON project_outlines(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_project_outlines_project_status ON project_outlines(project_id, status);

-- 5) TTL recovery function: marks stuck outlines as timeout
CREATE OR REPLACE FUNCTION mark_stuck_outlines_timeout(p_minutes INT DEFAULT 5)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE v_count INT;
BEGIN
  UPDATE project_outlines
  SET status = 'timeout',
      error_code = 'GATEWAY_TIMEOUT_OR_STUCK',
      error_detail = 'Outline stuck in generating beyond TTL (' || p_minutes || ' minutes)',
      updated_at = now()
  WHERE status IN ('queued', 'generating')
    AND updated_at < now() - (p_minutes || ' minutes')::interval;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 6) Helper function to resume stuck outlines
CREATE OR REPLACE FUNCTION get_resumable_outline(p_project_id UUID)
RETURNS TABLE(
  id UUID,
  stage TEXT,
  progress INT,
  attempts INT,
  summary_text TEXT,
  input_chars INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    po.id,
    po.stage,
    po.progress,
    po.attempts,
    po.summary_text,
    po.input_chars
  FROM project_outlines po
  WHERE po.project_id = p_project_id
    AND po.status IN ('queued', 'generating', 'timeout')
  ORDER BY po.updated_at DESC
  LIMIT 1;
END;
$$;