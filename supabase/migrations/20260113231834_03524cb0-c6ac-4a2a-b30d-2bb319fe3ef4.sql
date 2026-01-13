-- Create scene_camera_plan table (the Camera Plan / Shot List document)
CREATE TABLE IF NOT EXISTS public.scene_camera_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'locked')),
  generated_from_storyboard BOOLEAN DEFAULT TRUE,
  
  -- Header info (SEC_105a style)
  plan_header JSONB NOT NULL DEFAULT '{}',
  -- { sec_code, location_code, set_code, time_context, scene_logline }
  
  -- List of shots (01, 02, 03...)
  shots_list JSONB NOT NULL DEFAULT '[]',
  -- [{ shot_no, panel_ref, shot_label, shot_type_hint, framing_hint, blocking_ref, notes }]
  
  -- Top-view blocking diagrams
  blocking_diagrams JSONB NOT NULL DEFAULT '[]',
  -- [{ blocking_id, type, frame_shape, entities[], camera_marks[], movement_arrows[] }]
  
  -- Constraints inherited from storyboard
  constraints JSONB NOT NULL DEFAULT '{}',
  -- { must_use_char_visual_dna, must_use_location_lock, no_new_props }
  
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(scene_id, version)
);

-- Add staging and continuity columns to storyboard_panels if they don't exist
ALTER TABLE public.storyboard_panels 
ADD COLUMN IF NOT EXISTS panel_code TEXT,
ADD COLUMN IF NOT EXISTS staging JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS continuity JSONB DEFAULT '{}';

-- Add comments for documentation
COMMENT ON TABLE public.scene_camera_plan IS 'Camera Plan / Shot List document generated from approved storyboard. Contains shots list and blocking diagrams.';
COMMENT ON COLUMN public.storyboard_panels.staging IS 'Staging info: { characters_present: [...], props_present: [...], location_zone, action_beat, movement_arrows: [...] }';
COMMENT ON COLUMN public.storyboard_panels.continuity IS 'Continuity locks: { wardrobe_lock_ids: [...], visual_dna_lock_ids: [...], must_match_previous: bool }';
COMMENT ON COLUMN public.storyboard_panels.panel_code IS 'Panel code like P1, P2, P3...';

-- Enable RLS
ALTER TABLE public.scene_camera_plan ENABLE ROW LEVEL SECURITY;

-- RLS Policies for scene_camera_plan
CREATE POLICY "Users can view camera plans for their projects" 
ON public.scene_camera_plan FOR SELECT 
USING (project_id IN (
  SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
));

CREATE POLICY "Users can insert camera plans for their projects" 
ON public.scene_camera_plan FOR INSERT 
WITH CHECK (project_id IN (
  SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update camera plans for their projects" 
ON public.scene_camera_plan FOR UPDATE 
USING (project_id IN (
  SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete camera plans for their projects" 
ON public.scene_camera_plan FOR DELETE 
USING (project_id IN (
  SELECT project_id FROM public.project_members WHERE user_id = auth.uid()
));

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_scene_camera_plan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_scene_camera_plan_updated_at
BEFORE UPDATE ON public.scene_camera_plan
FOR EACH ROW
EXECUTE FUNCTION public.update_scene_camera_plan_updated_at();