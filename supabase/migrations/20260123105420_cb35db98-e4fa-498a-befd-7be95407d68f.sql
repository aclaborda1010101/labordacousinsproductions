-- ============================================
-- SHOWRUNNER IA SYSTEM - Phase 1 Foundation
-- ============================================

-- 1. Create visual_context_memory table
-- Stores visual language used per scene for continuity tracking
CREATE TABLE IF NOT EXISTS public.visual_context_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_id UUID NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  episode_number INTEGER NOT NULL DEFAULT 1,
  scene_number INTEGER NOT NULL,
  
  -- Emotional state tracking
  emotional_start TEXT,
  emotional_end TEXT,
  emotional_delta TEXT,
  
  -- Visual language used (what was actually used in this scene)
  dominant_lenses JSONB DEFAULT '[]'::jsonb,
  dominant_movements JSONB DEFAULT '[]'::jsonb,
  dominant_shot_types JSONB DEFAULT '[]'::jsonb,
  camera_height_tendency TEXT CHECK (camera_height_tendency IN ('low', 'neutral', 'high', 'mixed')),
  coverage_style TEXT CHECK (coverage_style IN ('fragmented', 'clean', 'mixed', 'documentary')),
  
  -- Pacing and rhythm
  average_shot_duration_sec NUMERIC(5,2),
  shot_count INTEGER DEFAULT 0,
  pacing_level TEXT CHECK (pacing_level IN ('slow', 'moderate', 'fast', 'frenetic')),
  
  -- Constraints for next scene (computed after approval)
  forbidden_next JSONB DEFAULT '{}'::jsonb,
  recommended_next JSONB DEFAULT '{}'::jsonb,
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'computed', 'validated', 'locked')),
  computed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT visual_context_memory_scene_unique UNIQUE(scene_id)
);

-- 2. Create showrunner_decisions table
-- Editorial decisions made by Showrunner IA before storyboard generation
CREATE TABLE IF NOT EXISTS public.showrunner_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_id UUID NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  
  -- Editorial questions answered (the "why" before the "how")
  where_we_came_from TEXT,
  what_must_change TEXT,
  what_cannot_repeat TEXT,
  
  -- Resulting constraints
  visual_strategy TEXT,
  camera_language_allowed JSONB DEFAULT '{}'::jsonb,
  lens_range_allowed TEXT[] DEFAULT ARRAY[]::TEXT[],
  movement_allowed TEXT[] DEFAULT ARRAY[]::TEXT[],
  shot_types_allowed TEXT[] DEFAULT ARRAY[]::TEXT[],
  
  -- Energy and pacing guidance
  visual_energy TEXT CHECK (visual_energy IN ('low', 'medium', 'high', 'explosive')),
  pacing_guidance TEXT,
  
  -- Validation state
  validated BOOLEAN DEFAULT false,
  validated_at TIMESTAMPTZ,
  validated_by UUID REFERENCES public.profiles(user_id),
  
  -- Mode: 'auto' = IA decided, 'manual' = user edited
  mode TEXT DEFAULT 'auto' CHECK (mode IN ('auto', 'manual', 'hybrid')),
  confidence_score NUMERIC(3,2) DEFAULT 0.0,
  
  -- AI reasoning (for debugging and learning)
  reasoning TEXT,
  model_used TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT showrunner_decisions_scene_unique UNIQUE(scene_id)
);

-- 3. Extend scene_intent table with new showrunner fields
ALTER TABLE public.scene_intent 
  ADD COLUMN IF NOT EXISTS visual_energy TEXT CHECK (visual_energy IN ('low', 'medium', 'high', 'explosive')),
  ADD COLUMN IF NOT EXISTS continuity_constraints JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS allowed_camera_language JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS forbidden_repetitions JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS showrunner_validated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS showrunner_notes TEXT,
  ADD COLUMN IF NOT EXISTS showrunner_decision_id UUID REFERENCES public.showrunner_decisions(id);

-- 4. Enable RLS on new tables
ALTER TABLE public.visual_context_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showrunner_decisions ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for visual_context_memory
CREATE POLICY "Users can view visual memory for their projects"
  ON public.visual_context_memory FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE owner_id = auth.uid()
      UNION
      SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert visual memory for their projects"
  ON public.visual_context_memory FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE owner_id = auth.uid()
      UNION
      SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update visual memory for their projects"
  ON public.visual_context_memory FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE owner_id = auth.uid()
      UNION
      SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete visual memory for their projects"
  ON public.visual_context_memory FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE owner_id = auth.uid()
      UNION
      SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
    )
  );

-- 6. RLS Policies for showrunner_decisions
CREATE POLICY "Users can view showrunner decisions for their projects"
  ON public.showrunner_decisions FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE owner_id = auth.uid()
      UNION
      SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert showrunner decisions for their projects"
  ON public.showrunner_decisions FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE owner_id = auth.uid()
      UNION
      SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update showrunner decisions for their projects"
  ON public.showrunner_decisions FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE owner_id = auth.uid()
      UNION
      SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete showrunner decisions for their projects"
  ON public.showrunner_decisions FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE owner_id = auth.uid()
      UNION
      SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
    )
  );

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_visual_context_memory_project 
  ON public.visual_context_memory(project_id);
CREATE INDEX IF NOT EXISTS idx_visual_context_memory_scene 
  ON public.visual_context_memory(scene_id);
CREATE INDEX IF NOT EXISTS idx_visual_context_memory_episode_scene 
  ON public.visual_context_memory(project_id, episode_number, scene_number);

CREATE INDEX IF NOT EXISTS idx_showrunner_decisions_project 
  ON public.showrunner_decisions(project_id);
CREATE INDEX IF NOT EXISTS idx_showrunner_decisions_scene 
  ON public.showrunner_decisions(scene_id);

-- 8. Create updated_at trigger for new tables
CREATE TRIGGER update_visual_context_memory_updated_at
  BEFORE UPDATE ON public.visual_context_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_showrunner_decisions_updated_at
  BEFORE UPDATE ON public.showrunner_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Enable realtime for showrunner_decisions (useful for live collaboration)
ALTER PUBLICATION supabase_realtime ADD TABLE public.showrunner_decisions;