-- Add run_id to keyframes table for telemetry tracking
ALTER TABLE public.keyframes 
  ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES public.generation_runs(id) ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_keyframes_run_id 
  ON public.keyframes(run_id) 
  WHERE run_id IS NOT NULL;