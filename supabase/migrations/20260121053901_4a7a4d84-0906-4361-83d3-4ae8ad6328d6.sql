-- ============================================================================
-- V12: GENERATION BLOCKS TABLE
-- Enables granular retry and state persistence for Writer's Room pipeline
-- ============================================================================

-- Create generation_blocks table for pipeline state management
CREATE TABLE public.generation_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  script_id UUID REFERENCES public.scripts(id) ON DELETE SET NULL,
  
  -- Block type and ordering
  block_type TEXT NOT NULL CHECK (block_type IN ('bible', 'outline', 'scene_card', 'script', 'polish')),
  block_index INTEGER NOT NULL,
  episode_number INTEGER,
  scene_range TEXT,  -- e.g., "1-2" for script blocks
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'done', 'failed', 'skipped')),
  retry_count INTEGER DEFAULT 0,
  
  -- Context and output
  input_context JSONB,
  output_data JSONB,
  
  -- Continuity tracking (V12: Hollywood pipeline)
  continuity_summary JSONB,  -- { last_scene_exit, emotional_state, time_continuity, pending_threads }
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Error tracking
  error_message TEXT,
  error_code TEXT
);

-- Indexes for efficient queries
CREATE INDEX idx_gen_blocks_project ON public.generation_blocks(project_id);
CREATE INDEX idx_gen_blocks_project_status ON public.generation_blocks(project_id, status);
CREATE INDEX idx_gen_blocks_type ON public.generation_blocks(block_type);
CREATE INDEX idx_gen_blocks_episode ON public.generation_blocks(project_id, episode_number);

-- Composite index for pipeline resumption
CREATE INDEX idx_gen_blocks_resume ON public.generation_blocks(project_id, block_type, block_index) 
  WHERE status IN ('pending', 'generating', 'failed');

-- Enable RLS
ALTER TABLE public.generation_blocks ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access blocks for their projects
CREATE POLICY "Users can view their project blocks" 
  ON public.generation_blocks 
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p 
      WHERE p.id = generation_blocks.project_id 
      AND (p.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm 
        WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can insert blocks for their projects" 
  ON public.generation_blocks 
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p 
      WHERE p.id = generation_blocks.project_id 
      AND (p.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm 
        WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can update their project blocks" 
  ON public.generation_blocks 
  FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p 
      WHERE p.id = generation_blocks.project_id 
      AND (p.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm 
        WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Users can delete their project blocks" 
  ON public.generation_blocks 
  FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p 
      WHERE p.id = generation_blocks.project_id 
      AND (p.owner_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.project_members pm 
        WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
      ))
    )
  );

-- Helper function: Get last continuity summary for a project/episode
CREATE OR REPLACE FUNCTION public.get_last_continuity_summary(
  p_project_id UUID,
  p_episode_number INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_summary JSONB;
BEGIN
  SELECT continuity_summary INTO v_summary
  FROM public.generation_blocks
  WHERE project_id = p_project_id
    AND block_type = 'script'
    AND status = 'done'
    AND continuity_summary IS NOT NULL
    AND (p_episode_number IS NULL OR episode_number = p_episode_number)
  ORDER BY block_index DESC
  LIMIT 1;
  
  RETURN COALESCE(v_summary, '{}'::jsonb);
END;
$$;

-- Helper function: Reset failed blocks for retry
CREATE OR REPLACE FUNCTION public.reset_failed_blocks(
  p_project_id UUID,
  p_block_type TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.generation_blocks
  SET 
    status = 'pending',
    retry_count = retry_count + 1,
    error_message = NULL,
    error_code = NULL,
    started_at = NULL,
    completed_at = NULL
  WHERE project_id = p_project_id
    AND status = 'failed'
    AND (p_block_type IS NULL OR block_type = p_block_type);
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Add comment for documentation
COMMENT ON TABLE public.generation_blocks IS 
'V12 Writer''s Room Pipeline: Stores state for each generation block enabling granular retry and Hollywood-grade quality control. Each block represents 2 scenes (script) or 8-12 cards (scene_card).';