
-- Fix search_path for new functions
CREATE OR REPLACE FUNCTION public.get_active_visual_dna(char_id UUID)
RETURNS JSONB AS $$
DECLARE
  vdna JSONB;
BEGIN
  SELECT visual_dna INTO vdna
  FROM public.character_visual_dna
  WHERE character_id = char_id AND is_active = true
  LIMIT 1;
  
  RETURN COALESCE(vdna, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.create_visual_dna_version(
  char_id UUID,
  new_version_name TEXT,
  modifications JSONB
)
RETURNS UUID AS $$
DECLARE
  current_dna JSONB;
  current_lock JSONB;
  new_version_num INTEGER;
  new_id UUID;
BEGIN
  SELECT visual_dna, continuity_lock INTO current_dna, current_lock
  FROM public.character_visual_dna
  WHERE character_id = char_id AND is_active = true;
  
  SELECT COALESCE(MAX(version), 0) + 1 INTO new_version_num
  FROM public.character_visual_dna
  WHERE character_id = char_id;
  
  UPDATE public.character_visual_dna
  SET is_active = false
  WHERE character_id = char_id AND is_active = true;
  
  INSERT INTO public.character_visual_dna (
    character_id, version, version_name, is_active, visual_dna, continuity_lock
  ) VALUES (
    char_id, new_version_num, new_version_name, true, 
    COALESCE(current_dna, '{}'::jsonb) || modifications,
    COALESCE(current_lock, '{"never_change":[],"must_avoid":[],"allowed_variants":[]}'::jsonb)
  )
  RETURNING id INTO new_id;
  
  UPDATE public.characters SET active_visual_dna_id = new_id WHERE id = char_id;
  
  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
