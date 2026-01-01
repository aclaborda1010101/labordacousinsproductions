-- Create version history table for scripts and scenes
CREATE TABLE public.entity_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('script', 'scene')),
  entity_id UUID NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  data JSONB NOT NULL DEFAULT '{}',
  change_summary TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(entity_id, version_number)
);

-- Enable RLS
ALTER TABLE public.entity_versions ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Project access for versions" 
ON public.entity_versions 
FOR ALL 
USING (has_project_access(auth.uid(), project_id));

-- Add index for faster lookups
CREATE INDEX idx_entity_versions_entity ON public.entity_versions(entity_id, version_number DESC);

-- Enable realtime for jobs table
ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.renders;