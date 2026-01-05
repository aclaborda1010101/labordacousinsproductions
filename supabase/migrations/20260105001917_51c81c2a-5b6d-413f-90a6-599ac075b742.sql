-- Table for Cinematic Production Engine canon elements
CREATE TABLE IF NOT EXISTS public.cpe_canon_elements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('character', 'location', 'prop', 'style', 'continuity')),
  priority TEXT NOT NULL CHECK (priority IN ('P0', 'P1', 'P2', 'P3')),
  specs JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table for CPE scenes
CREATE TABLE IF NOT EXISTS public.cpe_scenes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  slugline TEXT NOT NULL,
  technical_specs JSONB NOT NULL DEFAULT '{}',
  script TEXT,
  narrative TEXT,
  scene_order INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'locked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table for CPE production feed blocks
CREATE TABLE IF NOT EXISTS public.cpe_feed_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL CHECK (block_type IN ('analysis', 'scene', 'alert', 'command')),
  data JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'warning', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cpe_canon_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpe_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpe_feed_blocks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cpe_canon_elements
CREATE POLICY "Users can view canon elements for their projects"
ON public.cpe_canon_elements FOR SELECT
USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can create canon elements for their projects"
ON public.cpe_canon_elements FOR INSERT
WITH CHECK (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can update canon elements for their projects"
ON public.cpe_canon_elements FOR UPDATE
USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can delete canon elements for their projects"
ON public.cpe_canon_elements FOR DELETE
USING (public.has_project_access(auth.uid(), project_id));

-- RLS Policies for cpe_scenes
CREATE POLICY "Users can view scenes for their projects"
ON public.cpe_scenes FOR SELECT
USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can create scenes for their projects"
ON public.cpe_scenes FOR INSERT
WITH CHECK (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can update scenes for their projects"
ON public.cpe_scenes FOR UPDATE
USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can delete scenes for their projects"
ON public.cpe_scenes FOR DELETE
USING (public.has_project_access(auth.uid(), project_id));

-- RLS Policies for cpe_feed_blocks
CREATE POLICY "Users can view feed blocks for their projects"
ON public.cpe_feed_blocks FOR SELECT
USING (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can create feed blocks for their projects"
ON public.cpe_feed_blocks FOR INSERT
WITH CHECK (public.has_project_access(auth.uid(), project_id));

CREATE POLICY "Users can delete feed blocks for their projects"
ON public.cpe_feed_blocks FOR DELETE
USING (public.has_project_access(auth.uid(), project_id));

-- Indexes for performance
CREATE INDEX idx_cpe_canon_elements_project ON public.cpe_canon_elements(project_id);
CREATE INDEX idx_cpe_canon_elements_priority ON public.cpe_canon_elements(priority);
CREATE INDEX idx_cpe_scenes_project ON public.cpe_scenes(project_id);
CREATE INDEX idx_cpe_feed_blocks_project ON public.cpe_feed_blocks(project_id, created_at DESC);

-- Triggers for updated_at
CREATE TRIGGER update_cpe_canon_elements_updated_at
BEFORE UPDATE ON public.cpe_canon_elements
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cpe_scenes_updated_at
BEFORE UPDATE ON public.cpe_scenes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();