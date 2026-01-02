-- Create reference scripts library table
CREATE TABLE public.reference_scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'movie', -- 'movie', 'series', 'template'
  genre TEXT,
  language TEXT DEFAULT 'es',
  content TEXT NOT NULL,
  word_count INTEGER,
  notes TEXT,
  is_global BOOLEAN DEFAULT false, -- If true, available to all projects
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reference_scripts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their project references"
ON public.reference_scripts FOR SELECT
USING (
  project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
  OR is_global = true
);

CREATE POLICY "Users can create references for their projects"
ON public.reference_scripts FOR INSERT
WITH CHECK (
  project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can update their project references"
ON public.reference_scripts FOR UPDATE
USING (
  project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

CREATE POLICY "Users can delete their project references"
ON public.reference_scripts FOR DELETE
USING (
  project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  OR project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
);

-- Index for faster queries
CREATE INDEX idx_reference_scripts_project ON public.reference_scripts(project_id);
CREATE INDEX idx_reference_scripts_global ON public.reference_scripts(is_global) WHERE is_global = true;