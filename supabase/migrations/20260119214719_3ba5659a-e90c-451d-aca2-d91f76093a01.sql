-- =====================================================
-- MICROSHOT PIPELINE v1: Schema Enhancements for A→B
-- =====================================================

-- 1. Add provider preference and continuity fields to shots
ALTER TABLE shots ADD COLUMN IF NOT EXISTS provider_preference TEXT DEFAULT 'auto' 
  CHECK (provider_preference IN ('auto', 'kling', 'runway', 'veo'));

ALTER TABLE shots ADD COLUMN IF NOT EXISTS continuity_anchor_image_url TEXT;

ALTER TABLE shots ADD COLUMN IF NOT EXISTS output_video_url TEXT;

ALTER TABLE shots ADD COLUMN IF NOT EXISTS style_lock JSONB DEFAULT '{}';

-- 2. Add end frame extraction and seed fields to micro_shots
ALTER TABLE micro_shots ADD COLUMN IF NOT EXISTS negative_prompt TEXT;

ALTER TABLE micro_shots ADD COLUMN IF NOT EXISTS seed INTEGER;

ALTER TABLE micro_shots ADD COLUMN IF NOT EXISTS end_frame_image_url TEXT;

-- 3. Add index for efficient microshot lookups by video status
CREATE INDEX IF NOT EXISTS idx_micro_shots_video_status ON micro_shots(video_status);

-- 4. Add comment for documentation
COMMENT ON COLUMN shots.provider_preference IS 'Preferred video engine: auto (selector chooses), kling (A→B native), runway (A→B native), veo (chaining only)';
COMMENT ON COLUMN shots.continuity_anchor_image_url IS 'Last frame of previous shot used as start frame for first microshot';
COMMENT ON COLUMN micro_shots.end_frame_image_url IS 'Extracted last frame from generated video, used for chaining to next microshot';
COMMENT ON COLUMN micro_shots.seed IS 'Fixed seed for reproducibility within a shot';