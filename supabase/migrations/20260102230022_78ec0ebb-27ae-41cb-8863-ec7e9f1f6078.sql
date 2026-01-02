-- Add parsed_json column to scenes table for storing dialogue and script data
ALTER TABLE public.scenes 
ADD COLUMN IF NOT EXISTS parsed_json JSONB DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.scenes.parsed_json IS 'Stores parsed script data including dialogue, action, music/sfx cues, and VFX requirements';