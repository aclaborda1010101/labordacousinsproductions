-- Add missing columns for STORYBOARD v1.0 SPEC
ALTER TABLE storyboard_panels 
ADD COLUMN IF NOT EXISTS dialogue_snippet TEXT,
ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id);

-- Add index for location lookups
CREATE INDEX IF NOT EXISTS idx_storyboard_panels_location_id ON storyboard_panels(location_id);

-- Add comments documenting schema_version requirements
COMMENT ON COLUMN storyboard_panels.staging IS 'JSON with schema_version:"1.0", movement_arrows[], spatial_info, axis_180. See SPEC v1.0';
COMMENT ON COLUMN storyboard_panels.continuity IS 'JSON with schema_version:"1.0", visual_dna_lock_ids[], style_pack_lock_id, must_match_previous[], do_not_change[]';