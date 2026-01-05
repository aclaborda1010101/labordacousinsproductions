-- =============================================================================
-- V3.0 IDEMPOTENCY & CONCURRENCY CONSTRAINTS (FIXED)
-- Ensures safe parallel generation and prevents duplicate scenes
-- =============================================================================

-- 1. Add unique constraint for scenes idempotency (using existing columns)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'scenes_project_episode_scene_unique'
  ) THEN
    ALTER TABLE public.scenes
    ADD CONSTRAINT scenes_project_episode_scene_unique 
    UNIQUE (project_id, episode_no, scene_no);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 2. Index for faster scene lookups
CREATE INDEX IF NOT EXISTS idx_scenes_episode_scene 
ON public.scenes(project_id, episode_no, scene_no);

-- 3. Create llm_failures table for logging parse failures (diagnostic only)
CREATE TABLE IF NOT EXISTS public.llm_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  function_name text NOT NULL,
  raw_snippet_hash text,
  raw_snippet text,
  parse_warnings text[],
  provider text,
  model text
);

-- Enable RLS on llm_failures
ALTER TABLE public.llm_failures ENABLE ROW LEVEL SECURITY;

-- Policy: Only project owners/members can view their failures
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'llm_failures_project_access' AND tablename = 'llm_failures'
  ) THEN
    CREATE POLICY "llm_failures_project_access" ON public.llm_failures
    FOR SELECT USING (
      project_id IS NULL 
      OR public.has_project_access(auth.uid(), project_id)
    );
  END IF;
END $$;

-- Policy: Service role can insert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'llm_failures_service_insert' AND tablename = 'llm_failures'
  ) THEN
    CREATE POLICY "llm_failures_service_insert" ON public.llm_failures
    FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_llm_failures_created 
ON public.llm_failures(created_at);

COMMENT ON TABLE public.llm_failures IS 'Diagnostic log of LLM JSON parse failures for debugging';