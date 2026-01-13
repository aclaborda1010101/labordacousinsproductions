-- Create table for location spatial references (360° coverage)
CREATE TABLE IF NOT EXISTS public.location_spatial_refs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  slot_type TEXT NOT NULL DEFAULT 'spatial_reference',
  angle TEXT NOT NULL, -- 'front', 'back', 'lateral_left', 'lateral_right', 'panoramic_360'
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'uploaded'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  CONSTRAINT valid_angle CHECK (angle IN ('front', 'back', 'lateral_left', 'lateral_right', 'panoramic_360')),
  CONSTRAINT unique_location_angle UNIQUE (location_id, angle)
);

-- Enable RLS
ALTER TABLE public.location_spatial_refs ENABLE ROW LEVEL SECURITY;

-- RLS policies - users can manage their own project's location refs
CREATE POLICY "Users can view spatial refs for their locations"
ON public.location_spatial_refs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.projects p ON l.project_id = p.id
    WHERE l.id = location_spatial_refs.location_id
    AND (p.owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.project_members pm WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
    ))
  )
);

CREATE POLICY "Users can insert spatial refs for their locations"
ON public.location_spatial_refs
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.projects p ON l.project_id = p.id
    WHERE l.id = location_spatial_refs.location_id
    AND (p.owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.project_members pm WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
    ))
  )
);

CREATE POLICY "Users can update spatial refs for their locations"
ON public.location_spatial_refs
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.projects p ON l.project_id = p.id
    WHERE l.id = location_spatial_refs.location_id
    AND (p.owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.project_members pm WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
    ))
  )
);

CREATE POLICY "Users can delete spatial refs for their locations"
ON public.location_spatial_refs
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.projects p ON l.project_id = p.id
    WHERE l.id = location_spatial_refs.location_id
    AND (p.owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.project_members pm WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
    ))
  )
);

-- Add index for performance
CREATE INDEX idx_location_spatial_refs_location_id ON public.location_spatial_refs(location_id);

-- Add trigger for updated_at
CREATE TRIGGER update_location_spatial_refs_updated_at
BEFORE UPDATE ON public.location_spatial_refs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();