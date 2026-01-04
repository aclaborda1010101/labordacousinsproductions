-- Add missing SHOT_ASSISTANT columns to shots table
ALTER TABLE public.shots 
ADD COLUMN IF NOT EXISTS lighting jsonb,
ADD COLUMN IF NOT EXISTS keyframe_hints jsonb;

-- Rename sound_plan to sound_design for consistency if it exists
-- (sound_plan already exists, we'll use it for sound_design data)

-- Add comment to document the columns
COMMENT ON COLUMN public.shots.lighting IS 'Lighting setup: style, color_temp, key_light_direction';
COMMENT ON COLUMN public.shots.keyframe_hints IS 'Keyframe hints: start_frame, end_frame, mid_frames';
COMMENT ON COLUMN public.shots.edit_intent IS 'Edit intent: expected_cut, hold_ms, rhythm_note, viewer_notice, intention';
COMMENT ON COLUMN public.shots.continuity_notes IS 'Continuity: wardrobe_notes, props_in_frame, match_to_previous';