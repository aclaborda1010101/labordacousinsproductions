-- Add storyboard style preset columns
ALTER TABLE storyboards 
ADD COLUMN IF NOT EXISTS style_preset_id TEXT DEFAULT 'sb_cinematic_narrative';

ALTER TABLE storyboards 
ADD COLUMN IF NOT EXISTS style_preset_lock JSONB DEFAULT '{}';

-- Add columns to storyboard_panels for style QC
ALTER TABLE storyboard_panels
ADD COLUMN IF NOT EXISTS style_qc JSONB DEFAULT NULL;

ALTER TABLE storyboard_panels
ADD COLUMN IF NOT EXISTS style_regen_count INTEGER DEFAULT 0;

-- Index for queries
CREATE INDEX IF NOT EXISTS idx_storyboards_style_preset 
ON storyboards(style_preset_id);

-- Comment
COMMENT ON COLUMN storyboards.style_preset_id IS 'Storyboard visual style preset: sb_tech_production, sb_cinematic_narrative, sb_art_visual_dev, sb_previz_animatic';
COMMENT ON COLUMN storyboards.style_preset_lock IS 'Locked style config at generation time (promptBlock + qaProfile)';