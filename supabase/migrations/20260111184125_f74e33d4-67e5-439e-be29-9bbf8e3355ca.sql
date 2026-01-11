-- Update the CHECK constraint on batch_runs.quality_tier to allow the new tier values
-- First drop the existing constraint, then add the new one

ALTER TABLE public.batch_runs 
DROP CONSTRAINT IF EXISTS batch_runs_quality_tier_check;

ALTER TABLE public.batch_runs 
ADD CONSTRAINT batch_runs_quality_tier_check 
CHECK (quality_tier IN ('rapido', 'profesional', 'hollywood', 'DRAFT', 'PRODUCTION'));

-- Update any existing DRAFT records to rapido and PRODUCTION to profesional
UPDATE public.batch_runs 
SET quality_tier = 'rapido' 
WHERE quality_tier = 'DRAFT';

UPDATE public.batch_runs 
SET quality_tier = 'profesional' 
WHERE quality_tier = 'PRODUCTION';