-- First update any existing DIRECTOR values to PRO
UPDATE public.projects 
SET creative_mode = 'PRO' 
WHERE creative_mode = 'DIRECTOR';

-- Update any existing DIRECTOR values in scenes
UPDATE public.scenes 
SET override_mode = 'PRO' 
WHERE override_mode = 'DIRECTOR';

-- Now update creative_mode constraint to only allow ASSISTED and PRO
ALTER TABLE public.projects 
DROP CONSTRAINT IF EXISTS projects_creative_mode_check;

ALTER TABLE public.projects 
ADD CONSTRAINT projects_creative_mode_check 
CHECK (creative_mode IN ('ASSISTED', 'PRO'));

-- Update scenes override_mode constraint
ALTER TABLE public.scenes 
DROP CONSTRAINT IF EXISTS scenes_override_mode_check;

ALTER TABLE public.scenes 
ADD CONSTRAINT scenes_override_mode_check 
CHECK (override_mode IS NULL OR override_mode IN ('ASSISTED', 'PRO'));