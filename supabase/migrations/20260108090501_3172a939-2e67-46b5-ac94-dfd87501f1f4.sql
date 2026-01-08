-- Update the recalc_character_pack function to use correct pack_status values
CREATE OR REPLACE FUNCTION public.recalc_character_pack(p_character_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_slots int;
  v_completed_slots int;
  v_score int;
  v_status text;
  v_ready boolean;
BEGIN
  -- Count total slots for this character (standard pack has 14 slots)
  SELECT count(*) INTO v_total_slots
  FROM character_pack_slots
  WHERE character_id = p_character_id;

  -- If no slots exist, use default of 14
  IF v_total_slots = 0 THEN
    v_total_slots := 14;
  END IF;

  -- Count completed slots (has image_url and valid status)
  -- Accept: uploaded, generated, needs_review, approved, complete
  SELECT count(*) INTO v_completed_slots
  FROM character_pack_slots
  WHERE character_id = p_character_id
    AND image_url IS NOT NULL
    AND image_url != ''
    AND status IN ('uploaded', 'generated', 'needs_review', 'approved', 'complete', 'accepted');

  -- Calculate percentage
  IF v_total_slots > 0 THEN
    v_score := round(100.0 * v_completed_slots / v_total_slots);
  ELSE
    v_score := 0;
  END IF;

  -- Determine pack status (must be: hero_only, building, ready per constraint)
  IF v_completed_slots = 0 THEN
    v_status := 'hero_only';  -- Use hero_only for empty/minimal
  ELSIF v_completed_slots < v_total_slots THEN
    v_status := 'building';
  ELSE
    v_status := 'ready';
  END IF;

  -- Ready for video if pack is complete (all slots filled)
  v_ready := (v_completed_slots >= v_total_slots) AND (v_total_slots > 0);

  -- Update character record
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

-- Recalculate all existing characters to fix the 0% issue
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM characters LOOP
    PERFORM recalc_character_pack(r.id);
  END LOOP;
END;
$$;