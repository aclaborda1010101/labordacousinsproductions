-- Add quality_tier column to project_outlines for persisting the user's tier selection
ALTER TABLE project_outlines 
ADD COLUMN IF NOT EXISTS quality_tier text DEFAULT 'profesional';

-- Add comment explaining the column
COMMENT ON COLUMN project_outlines.quality_tier IS 'User-selected quality tier: rapido, profesional, or hollywood';