-- =====================================================
-- NEW PRODUCTION PIPELINE: STORYBOARDS WRAPPER TABLE
-- =====================================================

-- Create storyboards wrapper table to manage global status per scene
CREATE TABLE IF NOT EXISTS public.storyboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_id UUID NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved')),
  style_id TEXT NOT NULL DEFAULT 'pencil_storyboard_grayscale',
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, scene_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_storyboards_project_scene 
  ON public.storyboards (project_id, scene_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_storyboards_updated_at ON public.storyboards;
CREATE TRIGGER trg_storyboards_updated_at
BEFORE UPDATE ON public.storyboards
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================
-- ADD FIELDS TO storyboard_panels
-- =====================================================

-- Add action_beat_ref field
ALTER TABLE public.storyboard_panels 
ADD COLUMN IF NOT EXISTS action_beat_ref TEXT;

-- Add characters_present array field
ALTER TABLE public.storyboard_panels 
ADD COLUMN IF NOT EXISTS characters_present TEXT[] DEFAULT '{}';

-- Add props_present array field
ALTER TABLE public.storyboard_panels 
ADD COLUMN IF NOT EXISTS props_present TEXT[] DEFAULT '{}';

-- =====================================================
-- ENSURE scene_technical_docs HAS STATUS FIELD
-- =====================================================

-- Add status field if not exists (with locked option)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scene_technical_docs' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.scene_technical_docs 
    ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'approved', 'locked'));
  END IF;
END $$;

-- =====================================================
-- RLS POLICIES FOR storyboards (simplified - owner only)
-- =====================================================

ALTER TABLE public.storyboards ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view storyboards for their projects
CREATE POLICY "Users can view storyboards for owned projects"
ON public.storyboards
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = storyboards.project_id
    AND p.owner_id = auth.uid()
  )
);

-- Allow authenticated users to insert storyboards for their projects
CREATE POLICY "Users can create storyboards for owned projects"
ON public.storyboards
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = storyboards.project_id
    AND p.owner_id = auth.uid()
  )
);

-- Allow authenticated users to update storyboards for their projects
CREATE POLICY "Users can update storyboards for owned projects"
ON public.storyboards
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = storyboards.project_id
    AND p.owner_id = auth.uid()
  )
);

-- Allow authenticated users to delete storyboards for their projects
CREATE POLICY "Users can delete storyboards for owned projects"
ON public.storyboards
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = storyboards.project_id
    AND p.owner_id = auth.uid()
  )
);