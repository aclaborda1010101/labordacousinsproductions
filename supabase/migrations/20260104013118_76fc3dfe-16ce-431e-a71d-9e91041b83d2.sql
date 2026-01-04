-- Add autopilot columns to generation_runs
ALTER TABLE public.generation_runs 
ADD COLUMN IF NOT EXISTS autopilot_used boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS autopilot_confidence float;

-- Create project_autopilot_settings table
CREATE TABLE IF NOT EXISTS public.project_autopilot_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE,
  autopilot_image_enabled boolean DEFAULT true,
  autopilot_confidence_threshold float DEFAULT 0.75,
  autopilot_min_runs int DEFAULT 10,
  autopilot_max_regens float DEFAULT 1.3,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_autopilot_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies for project_autopilot_settings
CREATE POLICY "Users can read autopilot settings for their projects"
ON public.project_autopilot_settings FOR SELECT
USING (
  EXISTS (SELECT 1 FROM projects WHERE id = project_id AND owner_id = auth.uid()) OR
  EXISTS (SELECT 1 FROM project_members WHERE project_id = project_autopilot_settings.project_id AND user_id = auth.uid())
);

CREATE POLICY "Users can insert autopilot settings for their projects"
ON public.project_autopilot_settings FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM projects WHERE id = project_id AND owner_id = auth.uid())
);

CREATE POLICY "Users can update autopilot settings for their projects"
ON public.project_autopilot_settings FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM projects WHERE id = project_id AND owner_id = auth.uid())
);

-- Trigger for updated_at
CREATE TRIGGER update_project_autopilot_settings_updated_at
BEFORE UPDATE ON public.project_autopilot_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();