-- Add missing columns for unified generation telemetry
ALTER TABLE public.generation_runs 
  ADD COLUMN IF NOT EXISTS run_type text DEFAULT 'editorial', -- "character" | "location" | "keyframe" | "editorial"
  ADD COLUMN IF NOT EXISTS output_type text DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS phase text DEFAULT 'exploration',
  ADD COLUMN IF NOT EXISTS engine_selected_by text DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS engine_reason text,
  ADD COLUMN IF NOT EXISTS prompt text,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS generation_time_ms integer,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS is_canon boolean DEFAULT false;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_generation_runs_project_created 
  ON public.generation_runs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generation_runs_project_type 
  ON public.generation_runs (project_id, run_type);