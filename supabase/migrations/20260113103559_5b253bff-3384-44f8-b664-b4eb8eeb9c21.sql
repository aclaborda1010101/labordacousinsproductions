-- =====================================================
-- FASE 1: Storyboard Panels + Technical Docs Schema
-- =====================================================

-- 1.1 Tabla storyboard_panels
CREATE TABLE IF NOT EXISTS public.storyboard_panels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID REFERENCES public.scenes(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  panel_no INTEGER NOT NULL,
  panel_intent TEXT,
  shot_hint TEXT,
  image_prompt TEXT,
  image_url TEXT,
  notes TEXT,
  approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(scene_id, panel_no)
);

-- Enable RLS
ALTER TABLE public.storyboard_panels ENABLE ROW LEVEL SECURITY;

-- RLS policies for storyboard_panels
CREATE POLICY "Users can view storyboard panels in their projects"
  ON public.storyboard_panels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = storyboard_panels.project_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert storyboard panels in their projects"
  ON public.storyboard_panels FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = storyboard_panels.project_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update storyboard panels in their projects"
  ON public.storyboard_panels FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = storyboard_panels.project_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete storyboard panels in their projects"
  ON public.storyboard_panels FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = storyboard_panels.project_id
      AND p.owner_id = auth.uid()
    )
  );

-- 1.2 Ampliar tabla shots con campos del Documento Técnico
ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS 
  focus_config JSONB DEFAULT '{"mode": "follow", "base_distance_m": 2.5, "depth_profile": "medium", "events": []}';

ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS 
  timing_config JSONB DEFAULT '{"start_s": 0, "end_s": 3, "beats": []}';

ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS 
  camera_path JSONB DEFAULT '{"type": "static", "path": [], "speed": null, "easing": null}';

ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS 
  camera_position JSONB DEFAULT '{"x": 0, "y": 1.5, "z": -3}';

ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS 
  camera_rotation JSONB DEFAULT '{"pan": 0, "tilt": 0, "roll": 0}';

ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS 
  constraints JSONB DEFAULT '{"must_keep": [], "must_not": [], "negatives": []}';

ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS 
  storyboard_panel_id UUID REFERENCES public.storyboard_panels(id) ON DELETE SET NULL;

-- 1.3 Tabla scene_technical_docs (metadata a nivel escena)
CREATE TABLE IF NOT EXISTS public.scene_technical_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID REFERENCES public.scenes(id) ON DELETE CASCADE UNIQUE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  
  -- Visual Style Reference
  visual_style JSONB DEFAULT '{}',
  
  -- Camera Setup (constantes de escena)
  cameras JSONB DEFAULT '[]',
  
  -- Continuity Lock (nivel escena)
  continuity_lock JSONB DEFAULT '{
    "enabled": true,
    "locked_props": [],
    "wardrobe_lock": true,
    "color_lock": true,
    "time_of_day_lock": true
  }',
  
  -- Edit Plan
  edit_plan JSONB DEFAULT '{"mode": "assisted", "recommended_cut_points": []}',
  
  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'locked')),
  version INTEGER DEFAULT 1,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scene_technical_docs ENABLE ROW LEVEL SECURITY;

-- RLS policies for scene_technical_docs
CREATE POLICY "Users can view technical docs in their projects"
  ON public.scene_technical_docs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = scene_technical_docs.project_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert technical docs in their projects"
  ON public.scene_technical_docs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = scene_technical_docs.project_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update technical docs in their projects"
  ON public.scene_technical_docs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = scene_technical_docs.project_id
      AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete technical docs in their projects"
  ON public.scene_technical_docs FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = scene_technical_docs.project_id
      AND p.owner_id = auth.uid()
    )
  );

-- Trigger para updated_at en storyboard_panels
CREATE TRIGGER update_storyboard_panels_updated_at
  BEFORE UPDATE ON public.storyboard_panels
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para updated_at en scene_technical_docs
CREATE TRIGGER update_scene_technical_docs_updated_at
  BEFORE UPDATE ON public.scene_technical_docs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_storyboard_panels_scene_id ON public.storyboard_panels(scene_id);
CREATE INDEX IF NOT EXISTS idx_storyboard_panels_project_id ON public.storyboard_panels(project_id);
CREATE INDEX IF NOT EXISTS idx_scene_technical_docs_scene_id ON public.scene_technical_docs(scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_technical_docs_project_id ON public.scene_technical_docs(project_id);
CREATE INDEX IF NOT EXISTS idx_shots_storyboard_panel_id ON public.shots(storyboard_panel_id);