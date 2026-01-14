-- Phase 1: Add recovery columns for resilient storyboard pipeline
-- This enables failed_safe state, prompt recovery, and identity reinjection

-- Add recovery data columns to storyboard_panels
ALTER TABLE storyboard_panels 
ADD COLUMN IF NOT EXISTS last_prompt TEXT,
ADD COLUMN IF NOT EXISTS last_style_preset_id TEXT,
ADD COLUMN IF NOT EXISTS last_character_refs JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS recovery_data JSONB DEFAULT '{}';

-- Add comment for recovery_data structure
COMMENT ON COLUMN storyboard_panels.recovery_data IS 'Contains: style_preset_id, character_refs, canvas_format, identity_issues for regeneration';

-- Add index for pending_regen status queries (common operation)
CREATE INDEX IF NOT EXISTS idx_storyboard_panels_pending_regen 
ON storyboard_panels(scene_id, image_status) 
WHERE image_status = 'pending_regen';