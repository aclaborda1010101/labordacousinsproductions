-- Add run tracking columns to locations table
ALTER TABLE public.locations 
ADD COLUMN IF NOT EXISTS current_run_id uuid REFERENCES generation_runs(id),
ADD COLUMN IF NOT EXISTS accepted_run_id uuid REFERENCES generation_runs(id),
ADD COLUMN IF NOT EXISTS canon_asset_id uuid REFERENCES canon_assets(id);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_locations_current_run ON public.locations(current_run_id);
CREATE INDEX IF NOT EXISTS idx_locations_accepted_run ON public.locations(accepted_run_id);
CREATE INDEX IF NOT EXISTS idx_locations_canon_asset ON public.locations(canon_asset_id);

-- Comment for documentation
COMMENT ON COLUMN public.locations.current_run_id IS 'Latest generation run for this location';
COMMENT ON COLUMN public.locations.accepted_run_id IS 'Accepted/approved generation run for this location';
COMMENT ON COLUMN public.locations.canon_asset_id IS 'Reference to canon_assets if location is marked as canon';