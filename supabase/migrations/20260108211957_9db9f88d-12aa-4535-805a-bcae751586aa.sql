-- 1. Update recalc_character_pack to only count the 14 valid slot types
CREATE OR REPLACE FUNCTION public.recalc_character_pack(p_character_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_slots int := 14;  -- Standard pack size (fixed)
  v_completed_slots int;
  v_score int;
  v_status text;
  v_ready boolean;
  
  -- Define the 14 valid slot types
  v_valid_types text[] := ARRAY[
    'ref_closeup_front', 'ref_profile',
    'closeup_front', 'closeup_profile',
    'turn_front_34', 'turn_side', 'turn_back', 'turn_back_34',
    'expr_neutral', 'expr_happy', 'expr_sad', 'expr_angry', 'expr_surprised', 'expr_fear'
  ];
BEGIN
  -- Count ONLY valid slot types that are complete
  SELECT count(*) INTO v_completed_slots
  FROM character_pack_slots
  WHERE character_id = p_character_id
    AND slot_type = ANY(v_valid_types)
    AND image_url IS NOT NULL
    AND image_url != ''
    AND status IN ('uploaded', 'generated', 'needs_review', 'approved', 'complete', 'accepted');

  -- Calculate percentage (always out of 14)
  v_score := round(100.0 * v_completed_slots / v_total_slots);

  -- Determine pack status
  IF v_completed_slots = 0 THEN
    v_status := 'hero_only';
  ELSIF v_completed_slots < v_total_slots THEN
    v_status := 'building';
  ELSE
    v_status := 'ready';
  END IF;

  v_ready := (v_completed_slots >= v_total_slots);

  -- Update character
  UPDATE characters
  SET 
    pack_completeness_score = v_score,
    pack_status = v_status,
    is_ready_for_video = v_ready,
    production_ready_slots = v_completed_slots,
    updated_at = now()
  WHERE id = p_character_id;
END;
$$;

-- 2. Clean up legacy slots that are no longer used
DELETE FROM character_pack_slots
WHERE slot_type NOT IN (
  'ref_closeup_front', 'ref_profile',
  'closeup_front', 'closeup_profile',
  'turn_front_34', 'turn_side', 'turn_back', 'turn_back_34',
  'expr_neutral', 'expr_happy', 'expr_sad', 'expr_angry', 'expr_surprised', 'expr_fear'
);

-- 3. Recalculate all characters
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM characters LOOP
    PERFORM recalc_character_pack(rec.id);
  END LOOP;
END $$;