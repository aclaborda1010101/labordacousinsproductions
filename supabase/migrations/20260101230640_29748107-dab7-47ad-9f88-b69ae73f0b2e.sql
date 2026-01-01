-- Create location_pack_slots table for location turnaround persistence
CREATE TABLE public.location_pack_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  slot_type TEXT NOT NULL, -- 'turnaround'
  slot_index INTEGER NOT NULL DEFAULT 0,
  view_angle TEXT, -- 'establishing', 'detail', '3/4', 'close-up', 'alternate'
  time_of_day TEXT, -- 'day', 'night', 'dawn', 'dusk'
  weather TEXT, -- 'clear', 'rain', 'fog', etc.
  required BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'generating', 'review', 'approved', 'waiver'
  image_url TEXT,
  prompt_text TEXT,
  seed INTEGER,
  qc_score NUMERIC,
  qc_issues JSONB,
  fix_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.location_pack_slots ENABLE ROW LEVEL SECURITY;

-- Create policies for location_pack_slots
CREATE POLICY "Users can view location slots for their projects"
ON public.location_pack_slots
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.projects p ON l.project_id = p.id
    WHERE l.id = location_pack_slots.location_id
    AND (p.owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
    ))
  )
);

CREATE POLICY "Users can insert location slots for their projects"
ON public.location_pack_slots
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.projects p ON l.project_id = p.id
    WHERE l.id = location_pack_slots.location_id
    AND (p.owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
    ))
  )
);

CREATE POLICY "Users can update location slots for their projects"
ON public.location_pack_slots
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.projects p ON l.project_id = p.id
    WHERE l.id = location_pack_slots.location_id
    AND (p.owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
    ))
  )
);

CREATE POLICY "Users can delete location slots for their projects"
ON public.location_pack_slots
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.locations l
    JOIN public.projects p ON l.project_id = p.id
    WHERE l.id = location_pack_slots.location_id
    AND (p.owner_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.project_members pm
      WHERE pm.project_id = p.id AND pm.user_id = auth.uid()
    ))
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_location_pack_slots_updated_at
BEFORE UPDATE ON public.location_pack_slots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_location_pack_slots_location_id ON public.location_pack_slots(location_id);
CREATE INDEX idx_location_pack_slots_status ON public.location_pack_slots(status);