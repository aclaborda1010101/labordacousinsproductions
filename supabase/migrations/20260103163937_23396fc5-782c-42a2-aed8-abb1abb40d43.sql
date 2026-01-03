-- Add cinematography v3 columns to shots table
ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS coverage_type text;
ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS story_purpose text;
ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS transition_in text DEFAULT 'CUT';
ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS transition_out text DEFAULT 'hard_cut';
ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS edit_intent jsonb;
ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS ai_risk jsonb;
ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS continuity_notes text;

-- Add index for coverage type queries
CREATE INDEX IF NOT EXISTS idx_shots_coverage_type ON public.shots(coverage_type);
CREATE INDEX IF NOT EXISTS idx_shots_story_purpose ON public.shots(story_purpose);

-- Add comment for documentation
COMMENT ON COLUMN public.shots.coverage_type IS 'Master, Single, Two-Shot, OTS_A, OTS_B, Insert, Reaction, etc.';
COMMENT ON COLUMN public.shots.story_purpose IS 'establish_geography, reveal_information, build_tension, emotional_connection, dialogue_focus, transition';
COMMENT ON COLUMN public.shots.transition_in IS 'Transition type from previous shot: CUT, DISSOLVE, MATCH_CUT, J_CUT, L_CUT';
COMMENT ON COLUMN public.shots.transition_out IS 'Transition to next shot: hard_cut, audio_prelap, visual_match';
COMMENT ON COLUMN public.shots.edit_intent IS 'Edit intent metadata: expected_cut, hold_ms, rhythm_note';
COMMENT ON COLUMN public.shots.ai_risk IS 'Array of AI generation risks: Identity_Drift, Hand_Deform, Spatial_Jump, etc.';
COMMENT ON COLUMN public.shots.continuity_notes IS 'Risk mitigation and continuity notes';