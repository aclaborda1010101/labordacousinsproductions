-- Add creative_mode column to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS creative_mode text DEFAULT 'ASSISTED' 
CHECK (creative_mode IN ('ASSISTED', 'DIRECTOR', 'PRO'));

-- Add override_mode column to scenes table for per-scene overrides
ALTER TABLE public.scenes 
ADD COLUMN IF NOT EXISTS override_mode text DEFAULT NULL 
CHECK (override_mode IS NULL OR override_mode IN ('ASSISTED', 'DIRECTOR', 'PRO'));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_projects_creative_mode ON public.projects(creative_mode);
CREATE INDEX IF NOT EXISTS idx_scenes_override_mode ON public.scenes(override_mode);