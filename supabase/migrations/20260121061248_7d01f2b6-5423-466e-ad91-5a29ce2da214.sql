-- ============================================================================
-- V13: CANON PACKS + DRIFT DETECTION
-- Hollywood-grade consistency system
-- ============================================================================

-- Create canon_packs table for persistent context per episode/season
CREATE TABLE public.canon_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  pack_type TEXT NOT NULL CHECK (pack_type IN ('season', 'episode', 'act')),
  episode_number INTEGER,
  act_number INTEGER,
  
  -- Canon data (1-2k tokens max per pack)
  voice_tone_rules JSONB DEFAULT '[]'::jsonb,      -- 10 concrete voice rules
  active_cast JSONB DEFAULT '{}'::jsonb,           -- only relevant characters + relationships
  timeline_state JSONB DEFAULT '{}'::jsonb,        -- date, time, emotional state
  active_props_locs JSONB DEFAULT '[]'::jsonb,     -- props/locations in use
  continuity_locks JSONB DEFAULT '[]'::jsonb,      -- immutable rules (what CANNOT change)
  
  -- Metadata
  token_estimate INTEGER,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Unique constraint per project+type+episode
  UNIQUE(project_id, pack_type, episode_number, act_number)
);

-- Add drift_warnings to generation_blocks
ALTER TABLE public.generation_blocks 
ADD COLUMN IF NOT EXISTS drift_warnings INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS model_used TEXT,
ADD COLUMN IF NOT EXISTS model_reason TEXT,
ADD COLUMN IF NOT EXISTS canon_pack_id UUID REFERENCES public.canon_packs(id);

-- Indexes for canon_packs
CREATE INDEX idx_canon_packs_project ON public.canon_packs(project_id);
CREATE INDEX idx_canon_packs_episode ON public.canon_packs(project_id, episode_number);

-- Index for drift tracking
CREATE INDEX idx_gen_blocks_drift ON public.generation_blocks(project_id, drift_warnings) 
  WHERE drift_warnings > 0;

-- Enable RLS for canon_packs
ALTER TABLE public.canon_packs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for canon_packs
CREATE POLICY "Users can view their project canon packs" 
  ON public.canon_packs 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p 
      WHERE p.id = canon_packs.project_id 
      AND (p.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm 
        WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can insert canon packs for their projects" 
  ON public.canon_packs 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p 
      WHERE p.id = canon_packs.project_id 
      AND (p.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm 
        WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can update their project canon packs" 
  ON public.canon_packs 
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p 
      WHERE p.id = canon_packs.project_id 
      AND (p.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm 
        WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can delete their project canon packs" 
  ON public.canon_packs 
  FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p 
      WHERE p.id = canon_packs.project_id 
      AND (p.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm 
        WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
      ))
    )
  );

-- Helper function: Get active canon pack for an episode
CREATE OR REPLACE FUNCTION public.get_canon_pack(
  p_project_id UUID,
  p_episode_number INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pack JSONB;
BEGIN
  -- First try episode-specific pack
  IF p_episode_number IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', id,
      'pack_type', pack_type,
      'voice_tone_rules', voice_tone_rules,
      'active_cast', active_cast,
      'timeline_state', timeline_state,
      'active_props_locs', active_props_locs,
      'continuity_locks', continuity_locks
    ) INTO v_pack
    FROM public.canon_packs
    WHERE project_id = p_project_id
      AND pack_type = 'episode'
      AND episode_number = p_episode_number
    LIMIT 1;
    
    IF v_pack IS NOT NULL THEN
      RETURN v_pack;
    END IF;
  END IF;
  
  -- Fallback to season pack
  SELECT jsonb_build_object(
    'id', id,
    'pack_type', pack_type,
    'voice_tone_rules', voice_tone_rules,
    'active_cast', active_cast,
    'timeline_state', timeline_state,
    'active_props_locs', active_props_locs,
    'continuity_locks', continuity_locks
  ) INTO v_pack
  FROM public.canon_packs
  WHERE project_id = p_project_id
    AND pack_type = 'season'
  ORDER BY version DESC
  LIMIT 1;
  
  RETURN COALESCE(v_pack, '{}'::jsonb);
END;
$$;

-- Helper function: Increment drift warning and check threshold
CREATE OR REPLACE FUNCTION public.increment_drift_warning(
  p_block_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE public.generation_blocks
  SET drift_warnings = drift_warnings + 1
  WHERE id = p_block_id
  RETURNING drift_warnings INTO v_new_count;
  
  RETURN COALESCE(v_new_count, 0);
END;
$$;

-- Comment for documentation
COMMENT ON TABLE public.canon_packs IS 
'V13 Canon Lock System: Stores 1-2k token context packs per episode/season to prevent narrative drift. Contains voice rules, active cast states, timeline, and immutable continuity locks.';