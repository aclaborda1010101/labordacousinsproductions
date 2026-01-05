-- V3.0 UNIFIED BATCH SYSTEM
-- Tables for tracking batch generation runs

-- Batch runs master table
CREATE TABLE IF NOT EXISTS public.batch_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  total_episodes INTEGER NOT NULL DEFAULT 1,
  quality_tier TEXT NOT NULL DEFAULT 'PRODUCTION' CHECK (quality_tier IN ('DRAFT', 'PRODUCTION')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'partial', 'done', 'failed')),
  episodes_done INTEGER NOT NULL DEFAULT 0,
  episodes_failed INTEGER NOT NULL DEFAULT 0,
  failed_episode_numbers INTEGER[] DEFAULT '{}',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Batch run items (per-episode tracking)
CREATE TABLE IF NOT EXISTS public.batch_run_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_run_id UUID NOT NULL REFERENCES public.batch_runs(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  error TEXT,
  created_scenes_count INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.batch_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_run_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for batch_runs
CREATE POLICY "Users can view batch runs for their projects"
  ON public.batch_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = batch_runs.project_id 
    AND projects.owner_id = auth.uid()
  ));

CREATE POLICY "Users can create batch runs for their projects"
  ON public.batch_runs FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = batch_runs.project_id 
    AND projects.owner_id = auth.uid()
  ));

CREATE POLICY "Users can update batch runs for their projects"
  ON public.batch_runs FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.projects 
    WHERE projects.id = batch_runs.project_id 
    AND projects.owner_id = auth.uid()
  ));

-- RLS policies for batch_run_items
CREATE POLICY "Users can view batch run items for their projects"
  ON public.batch_run_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.batch_runs br
    JOIN public.projects p ON p.id = br.project_id
    WHERE br.id = batch_run_items.batch_run_id 
    AND p.owner_id = auth.uid()
  ));

CREATE POLICY "Users can create batch run items for their projects"
  ON public.batch_run_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.batch_runs br
    JOIN public.projects p ON p.id = br.project_id
    WHERE br.id = batch_run_items.batch_run_id 
    AND p.owner_id = auth.uid()
  ));

CREATE POLICY "Users can update batch run items for their projects"
  ON public.batch_run_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.batch_runs br
    JOIN public.projects p ON p.id = br.project_id
    WHERE br.id = batch_run_items.batch_run_id 
    AND p.owner_id = auth.uid()
  ));

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_batch_runs_project ON public.batch_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_batch_run_items_batch ON public.batch_run_items(batch_run_id);

-- Update trigger
CREATE TRIGGER update_batch_runs_updated_at
  BEFORE UPDATE ON public.batch_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comments
COMMENT ON TABLE public.batch_runs IS 'V3.0: Master table for batch script generation runs';
COMMENT ON TABLE public.batch_run_items IS 'V3.0: Per-episode tracking within a batch run';