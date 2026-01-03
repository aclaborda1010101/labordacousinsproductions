-- Add name column to shots table
ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS name TEXT;

-- Add comment
COMMENT ON COLUMN public.shots.name IS 'Descriptive name for the shot, e.g., "1A - Establishing Wide" or "3B - Marcus CU Dialogue"';