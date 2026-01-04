-- Add accepted_at and preset_id to generation_runs
ALTER TABLE public.generation_runs 
ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
ADD COLUMN IF NOT EXISTS preset_id text;

-- Create editorial_events table for tracking suggestions and user decisions
CREATE TABLE IF NOT EXISTS public.editorial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  project_id text NOT NULL,
  run_id uuid REFERENCES public.generation_runs(id) ON DELETE SET NULL,
  asset_type text NOT NULL CHECK (asset_type IN ('character', 'location', 'keyframe')),
  event_type text NOT NULL CHECK (event_type IN ('suggestion_shown', 'suggestion_applied', 'suggestion_dismissed', 'auto_hint')),
  suggestion_id text,
  payload jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.editorial_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for editorial_events
CREATE POLICY "Users can insert editorial events"
ON public.editorial_events
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can view their project events"
ON public.editorial_events
FOR SELECT
USING (true);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_editorial_events_project ON public.editorial_events(project_id);
CREATE INDEX IF NOT EXISTS idx_editorial_events_run ON public.editorial_events(run_id);
CREATE INDEX IF NOT EXISTS idx_generation_runs_preset ON public.generation_runs(preset_id);
CREATE INDEX IF NOT EXISTS idx_generation_runs_accepted_at ON public.generation_runs(accepted_at);

-- Function to set accepted_at when status changes to accepted
CREATE OR REPLACE FUNCTION public.set_accepted_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    NEW.accepted_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger for auto-setting accepted_at
DROP TRIGGER IF EXISTS trigger_set_accepted_at ON public.generation_runs;
CREATE TRIGGER trigger_set_accepted_at
BEFORE UPDATE ON public.generation_runs
FOR EACH ROW
EXECUTE FUNCTION public.set_accepted_at();