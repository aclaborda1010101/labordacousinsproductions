-- Create table to persist outlines (intermediate state before episode generation)
CREATE TABLE IF NOT EXISTS public.project_outlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  outline_json JSONB NOT NULL,
  quality TEXT DEFAULT 'pending',
  qc_issues JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft', -- draft, approved, rejected
  idea TEXT,
  genre TEXT,
  tone TEXT,
  format TEXT,
  episode_count INTEGER,
  target_duration INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by project
CREATE INDEX IF NOT EXISTS idx_project_outlines_project ON public.project_outlines(project_id);

-- Enable RLS
ALTER TABLE public.project_outlines ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can only access outlines for projects they own
CREATE POLICY "Users can view outlines for their projects"
ON public.project_outlines FOR SELECT
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Users can insert outlines for their projects"
ON public.project_outlines FOR INSERT
WITH CHECK (
  project_id IN (
    SELECT id FROM public.projects WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update outlines for their projects"
ON public.project_outlines FOR UPDATE
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete outlines for their projects"
ON public.project_outlines FOR DELETE
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE owner_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_project_outlines_updated_at
BEFORE UPDATE ON public.project_outlines
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();