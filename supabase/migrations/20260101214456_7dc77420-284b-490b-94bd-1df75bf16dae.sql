-- Create character_role enum
CREATE TYPE public.character_role AS ENUM ('protagonist', 'recurring', 'episodic', 'extra');

-- Add role to characters if not already typed correctly
ALTER TABLE public.characters 
ADD COLUMN IF NOT EXISTS character_role public.character_role DEFAULT 'episodic';

-- Create character pack slots table
CREATE TABLE public.character_pack_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  slot_type TEXT NOT NULL, -- 'turnaround', 'expression', 'outfit', 'closeup', 'base_look'
  slot_index INTEGER NOT NULL DEFAULT 0,
  view_angle TEXT, -- 'front', 'side', 'back', '3/4'
  expression_name TEXT, -- 'neutral', 'happy', 'sad', 'angry', etc.
  outfit_id UUID REFERENCES public.character_outfits(id),
  image_url TEXT,
  prompt_text TEXT,
  seed BIGINT,
  status TEXT NOT NULL DEFAULT 'empty', -- 'empty', 'generating', 'qc_pending', 'approved', 'failed', 'waiver'
  qc_score INTEGER,
  qc_issues JSONB DEFAULT '[]'::jsonb,
  fix_notes TEXT,
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.character_pack_slots ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "Access via character"
ON public.character_pack_slots
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM characters c
    WHERE c.id = character_pack_slots.character_id
    AND has_project_access(auth.uid(), c.project_id)
  )
);

-- Add pack_completeness_score to characters
ALTER TABLE public.characters 
ADD COLUMN IF NOT EXISTS pack_completeness_score INTEGER DEFAULT 0;

-- Create index for faster lookups
CREATE INDEX idx_character_pack_slots_character ON public.character_pack_slots(character_id);
CREATE INDEX idx_character_pack_slots_status ON public.character_pack_slots(status);

-- Function to calculate pack completeness
CREATE OR REPLACE FUNCTION public.calculate_pack_completeness(p_character_id UUID)
RETURNS INTEGER AS $$
DECLARE
  total_required INTEGER;
  total_approved INTEGER;
  completeness INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_required
  FROM character_pack_slots
  WHERE character_id = p_character_id AND required = true;
  
  SELECT COUNT(*) INTO total_approved
  FROM character_pack_slots
  WHERE character_id = p_character_id 
    AND required = true 
    AND status IN ('approved', 'waiver');
  
  IF total_required = 0 THEN
    RETURN 0;
  END IF;
  
  completeness := ROUND((total_approved::NUMERIC / total_required::NUMERIC) * 100);
  
  -- Update character
  UPDATE characters SET pack_completeness_score = completeness WHERE id = p_character_id;
  
  RETURN completeness;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to update completeness on slot change
CREATE OR REPLACE FUNCTION public.update_pack_completeness()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM calculate_pack_completeness(NEW.character_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_update_pack_completeness
AFTER INSERT OR UPDATE OR DELETE ON public.character_pack_slots
FOR EACH ROW
EXECUTE FUNCTION public.update_pack_completeness();