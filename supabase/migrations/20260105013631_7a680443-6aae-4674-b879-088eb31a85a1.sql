-- ==============================================
-- ICEBERG CHARACTER PACK MVP - Database Layer (v2)
-- First clean up duplicates, then add constraints
-- ==============================================

-- 1) Clean up duplicate slots - keep only the most recent one per character+slot_type
DELETE FROM public.character_pack_slots
WHERE id NOT IN (
  SELECT DISTINCT ON (character_id, slot_type) id
  FROM public.character_pack_slots
  ORDER BY character_id, slot_type, updated_at DESC
);

-- 2) Ensure pack_status constraint uses correct values
ALTER TABLE public.characters 
DROP CONSTRAINT IF EXISTS characters_pack_status_check;

ALTER TABLE public.characters 
ADD CONSTRAINT characters_pack_status_check 
CHECK (pack_status IS NULL OR pack_status IN ('hero_only', 'building', 'ready'));

-- 3) Add unique constraint on character_pack_slots (character_id, slot_type)
ALTER TABLE public.character_pack_slots 
DROP CONSTRAINT IF EXISTS character_pack_slots_character_slot_unique;

ALTER TABLE public.character_pack_slots
ADD CONSTRAINT character_pack_slots_character_slot_unique 
UNIQUE (character_id, slot_type);

-- 4) Add current_run_id and accepted_run_id to character_pack_slots if missing
ALTER TABLE public.character_pack_slots 
ADD COLUMN IF NOT EXISTS current_run_id UUID REFERENCES public.generation_runs(id);

ALTER TABLE public.character_pack_slots 
ADD COLUMN IF NOT EXISTS accepted_run_id UUID REFERENCES public.generation_runs(id);

-- 5) Create recalc_character_pack function (MVP: 4 slots)
CREATE OR REPLACE FUNCTION public.recalc_character_pack(p_character_id UUID)
RETURNS void AS $$
DECLARE
  accepted_count INTEGER;
  new_status TEXT;
  new_score INTEGER;
BEGIN
  -- Count accepted slots (MVP slots: hero_front, profile_left, back, expression_neutral)
  SELECT COUNT(*) INTO accepted_count
  FROM public.character_pack_slots
  WHERE character_id = p_character_id
    AND slot_type IN ('hero_front', 'profile_left', 'back', 'expression_neutral')
    AND status = 'accepted';
  
  -- Calculate completeness score (0-100 based on 4 slots)
  new_score := accepted_count * 25;
  
  -- Determine pack status
  CASE 
    WHEN accepted_count = 0 THEN new_status := 'hero_only';
    WHEN accepted_count >= 4 THEN new_status := 'ready';
    ELSE new_status := 'building';
  END CASE;
  
  -- Update character
  UPDATE public.characters 
  SET 
    pack_completeness_score = new_score,
    pack_status = new_status,
    is_ready_for_video = (accepted_count >= 4),
    updated_at = now()
  WHERE id = p_character_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 6) Create trigger to auto-recalc on slot changes
CREATE OR REPLACE FUNCTION public.trigger_recalc_character_pack()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_character_pack(OLD.character_id);
    RETURN OLD;
  ELSE
    PERFORM recalc_character_pack(NEW.character_id);
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_recalc_character_pack ON public.character_pack_slots;

CREATE TRIGGER trg_recalc_character_pack
AFTER INSERT OR UPDATE OR DELETE ON public.character_pack_slots
FOR EACH ROW
EXECUTE FUNCTION public.trigger_recalc_character_pack();

-- 7) Add autopilot settings to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS autopilot_enabled BOOLEAN DEFAULT true;

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS autopilot_max_runs_per_character INTEGER DEFAULT 3;