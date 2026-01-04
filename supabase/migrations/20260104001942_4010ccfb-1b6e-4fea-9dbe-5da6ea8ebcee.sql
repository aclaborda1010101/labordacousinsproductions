-- Add run tracking columns to characters table
ALTER TABLE public.characters 
ADD COLUMN IF NOT EXISTS current_run_id uuid REFERENCES generation_runs(id),
ADD COLUMN IF NOT EXISTS accepted_run_id uuid REFERENCES generation_runs(id),
ADD COLUMN IF NOT EXISTS canon_asset_id uuid REFERENCES canon_assets(id);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_characters_current_run ON public.characters(current_run_id);
CREATE INDEX IF NOT EXISTS idx_characters_accepted_run ON public.characters(accepted_run_id);
CREATE INDEX IF NOT EXISTS idx_characters_canon_asset ON public.characters(canon_asset_id);

-- Comment for documentation
COMMENT ON COLUMN public.characters.current_run_id IS 'Latest generation run for this character portrait';
COMMENT ON COLUMN public.characters.accepted_run_id IS 'Accepted/approved generation run for this character';
COMMENT ON COLUMN public.characters.canon_asset_id IS 'Reference to canon_assets if character is marked as canon';