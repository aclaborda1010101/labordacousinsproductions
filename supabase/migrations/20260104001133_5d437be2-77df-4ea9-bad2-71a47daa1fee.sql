-- Add parent_run_id for tracking regeneration chains
ALTER TABLE public.generation_runs 
  ADD COLUMN IF NOT EXISTS parent_run_id uuid REFERENCES public.generation_runs(id) ON DELETE SET NULL;

-- Add index for efficient regeneration history queries
CREATE INDEX IF NOT EXISTS idx_generation_runs_parent_run_id 
  ON public.generation_runs(parent_run_id) 
  WHERE parent_run_id IS NOT NULL;

-- Ensure status field has all required values (it should already exist)
COMMENT ON COLUMN public.generation_runs.status IS 'generated|accepted|failed|rejected';