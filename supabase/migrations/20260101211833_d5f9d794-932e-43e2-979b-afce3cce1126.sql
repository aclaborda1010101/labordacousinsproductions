-- Engine Shootout results and Taste Profile
CREATE TABLE public.engine_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  scene_description TEXT NOT NULL,
  duration_sec NUMERIC(6,2) DEFAULT 8.0,
  veo_result JSONB DEFAULT '{}',
  kling_result JSONB DEFAULT '{}',
  qc_results JSONB DEFAULT '{}',
  winner TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.engine_tests ENABLE ROW LEVEL SECURITY;

-- RLS policies for engine_tests
CREATE POLICY "Users can view engine tests for their projects" 
ON public.engine_tests FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.projects p 
  WHERE p.id = project_id AND p.owner_id = auth.uid()
));

CREATE POLICY "Users can create engine tests for their projects" 
ON public.engine_tests FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.projects p 
  WHERE p.id = project_id AND p.owner_id = auth.uid()
));

CREATE POLICY "Users can update their engine tests" 
ON public.engine_tests FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.projects p 
  WHERE p.id = project_id AND p.owner_id = auth.uid()
));

-- Add preferred_engine column to projects for taste profile
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS preferred_engine TEXT DEFAULT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS engine_test_completed BOOLEAN DEFAULT false;