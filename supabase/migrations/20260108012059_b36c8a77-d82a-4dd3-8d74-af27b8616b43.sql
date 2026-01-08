-- Add entity_subtype to characters for animals, robots, etc.
ALTER TABLE public.characters 
ADD COLUMN IF NOT EXISTS entity_subtype TEXT DEFAULT 'human';

-- Add check constraint
ALTER TABLE public.characters 
ADD CONSTRAINT characters_entity_subtype_check 
CHECK (entity_subtype IN ('human', 'animal', 'creature', 'robot', 'other'));

-- Create reference_anchors table if not exists (for regeneration consistency)
CREATE TABLE IF NOT EXISTS public.character_reference_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  anchor_type TEXT NOT NULL,
  image_url TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  influence_weight NUMERIC DEFAULT 0.75,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(character_id, anchor_type)
);

-- Enable RLS
ALTER TABLE public.character_reference_anchors ENABLE ROW LEVEL SECURITY;

-- RLS policies for character_reference_anchors
CREATE POLICY "Users can view anchors for their projects"
ON public.character_reference_anchors FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.characters c
    JOIN public.projects p ON c.project_id = p.id
    WHERE c.id = character_reference_anchors.character_id
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can insert anchors for their projects"
ON public.character_reference_anchors FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.characters c
    JOIN public.projects p ON c.project_id = p.id
    WHERE c.id = character_reference_anchors.character_id
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can update anchors for their projects"
ON public.character_reference_anchors FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.characters c
    JOIN public.projects p ON c.project_id = p.id
    WHERE c.id = character_reference_anchors.character_id
    AND p.owner_id = auth.uid()
  )
);

CREATE POLICY "Users can delete anchors for their projects"
ON public.character_reference_anchors FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.characters c
    JOIN public.projects p ON c.project_id = p.id
    WHERE c.id = character_reference_anchors.character_id
    AND p.owner_id = auth.uid()
  )
);