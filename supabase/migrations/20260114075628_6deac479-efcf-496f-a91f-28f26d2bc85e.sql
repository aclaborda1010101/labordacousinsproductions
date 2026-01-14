-- Add 2-step pipeline fields to storyboard_panels
ALTER TABLE storyboard_panels
ADD COLUMN IF NOT EXISTS pipeline_phase TEXT DEFAULT 'staging',
ADD COLUMN IF NOT EXISTS staging_image_url TEXT,
ADD COLUMN IF NOT EXISTS staging_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS identity_fix_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS identity_fix_status TEXT DEFAULT 'pending';

-- Add comment for documentation
COMMENT ON COLUMN storyboard_panels.pipeline_phase IS 'Current phase: staging | identity_fix | complete';
COMMENT ON COLUMN storyboard_panels.staging_image_url IS 'Image from Paso A (composition without finalized face)';
COMMENT ON COLUMN storyboard_panels.staging_status IS 'Status of Paso A: pending | generating | success | failed';
COMMENT ON COLUMN storyboard_panels.identity_fix_attempts IS 'Number of identity fix attempts (Paso B)';
COMMENT ON COLUMN storyboard_panels.identity_fix_status IS 'Status of Paso B: pending | generating | success | failed';

-- Index for pipeline queries
CREATE INDEX IF NOT EXISTS idx_panels_pipeline_phase ON storyboard_panels(pipeline_phase);
CREATE INDEX IF NOT EXISTS idx_panels_staging_status ON storyboard_panels(staging_status);