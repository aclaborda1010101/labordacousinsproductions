-- ============================================
-- MICROSHOT ANTI-HALLUCINATION PIPELINE
-- Technical Doc Inheritance + A/B Keyframe Pipeline
-- ============================================

-- 1. Add technical inheritance columns to shots
ALTER TABLE public.shots
  ADD COLUMN IF NOT EXISTS inherit_technical BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS technical_overrides JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS technical_shot_idx INTEGER;

COMMENT ON COLUMN public.shots.inherit_technical IS 
  'If true, shot inherits camera/lighting/focus from scene_technical_docs';
COMMENT ON COLUMN public.shots.technical_overrides IS 
  'User overrides for specific fields (only if inherit_technical=true)';
COMMENT ON COLUMN public.shots.technical_shot_idx IS 
  'Maps to shot index in technical doc for inheritance';

-- 2. Add A/B pipeline columns to keyframes
ALTER TABLE public.keyframes
  ADD COLUMN IF NOT EXISTS staging_image_url TEXT,
  ADD COLUMN IF NOT EXISTS identity_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS identity_anchors JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS identity_score NUMERIC(3,2);

COMMENT ON COLUMN public.keyframes.staging_image_url IS 
  'Paso A output: composition/camera/blocking before identity fix';
COMMENT ON COLUMN public.keyframes.identity_status IS 
  'pending | fixed | failed - status of Paso B identity fix';
COMMENT ON COLUMN public.keyframes.identity_anchors IS 
  'Reference image URLs used for identity fix';
COMMENT ON COLUMN public.keyframes.identity_score IS 
  'QC score from identity validation (0.0-1.0)';

-- 3. Add pipeline tracking to micro_shots
ALTER TABLE public.micro_shots
  ADD COLUMN IF NOT EXISTS keyframe_pipeline_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS action_beat TEXT,
  ADD COLUMN IF NOT EXISTS camera_beat TEXT;

COMMENT ON COLUMN public.micro_shots.keyframe_pipeline_status IS 
  'pending | staging | identity_fix | complete | failed';
COMMENT ON COLUMN public.micro_shots.action_beat IS 
  'Minimal action description for this microshot segment';
COMMENT ON COLUMN public.micro_shots.camera_beat IS 
  'Minimal camera movement for this microshot segment';

-- 4. Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_shots_inherit_technical ON public.shots(inherit_technical) WHERE inherit_technical = true;
CREATE INDEX IF NOT EXISTS idx_keyframes_identity_status ON public.keyframes(identity_status);
CREATE INDEX IF NOT EXISTS idx_micro_shots_pipeline_status ON public.micro_shots(keyframe_pipeline_status);