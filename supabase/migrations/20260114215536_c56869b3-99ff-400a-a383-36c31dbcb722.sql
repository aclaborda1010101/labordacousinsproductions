-- Add density_targets column to persist narrative density configuration
ALTER TABLE project_outlines 
ADD COLUMN IF NOT EXISTS density_targets JSONB DEFAULT NULL;

COMMENT ON COLUMN project_outlines.density_targets IS 
'Production targets for narrative density (protagonists, locations, scenes, etc.)';