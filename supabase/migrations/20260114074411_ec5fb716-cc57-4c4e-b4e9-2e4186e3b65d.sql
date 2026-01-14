-- Add deterministic state machine columns for storyboard panels
-- Phase 1: State tracking + timeout + mode + failure reason

-- Add timeout tracking
ALTER TABLE storyboard_panels 
ADD COLUMN IF NOT EXISTS generation_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS generation_timeout_seconds INTEGER DEFAULT 120;

-- Add failure reason for failed_safe state
ALTER TABLE storyboard_panels 
ADD COLUMN IF NOT EXISTS failure_reason TEXT;

-- Add generation mode (NORMAL, STRICT, SAFE)
ALTER TABLE storyboard_panels 
ADD COLUMN IF NOT EXISTS generation_mode TEXT DEFAULT 'NORMAL';

-- Add index for stuck panel cleanup queries
CREATE INDEX IF NOT EXISTS idx_storyboard_panels_generation_stuck 
ON storyboard_panels(scene_id, image_status, generation_started_at) 
WHERE image_status = 'generating';

-- Add index for failed_safe panels
CREATE INDEX IF NOT EXISTS idx_storyboard_panels_failed_safe 
ON storyboard_panels(scene_id, image_status) 
WHERE image_status = 'failed_safe';

-- Comment on columns
COMMENT ON COLUMN storyboard_panels.generation_started_at IS 'Timestamp when image generation started - used for timeout detection';
COMMENT ON COLUMN storyboard_panels.generation_timeout_seconds IS 'Timeout in seconds before marking panel as failed_safe (default 120s)';
COMMENT ON COLUMN storyboard_panels.failure_reason IS 'Reason for failure: TIMEOUT, NO_IMAGE_RETURNED, QC_FAILED, STUCK_GENERATING, etc.';
COMMENT ON COLUMN storyboard_panels.generation_mode IS 'Generation mode: NORMAL, STRICT (after QC fail), SAFE (after repeated failures)';