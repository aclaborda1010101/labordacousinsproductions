-- Add keyframe positioning and geometry fields to support PROMPT-ENGINE v3
ALTER TABLE public.keyframes 
ADD COLUMN IF NOT EXISTS timestamp_sec NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS frame_type TEXT DEFAULT 'intermediate' CHECK (frame_type IN ('initial', 'intermediate', 'final')),
ADD COLUMN IF NOT EXISTS frame_geometry JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS staging_snapshot JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS negative_constraints JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS determinism JSONB DEFAULT '{}';

-- Add index for faster queries by shot and timestamp
CREATE INDEX IF NOT EXISTS idx_keyframes_shot_timestamp ON public.keyframes(shot_id, timestamp_sec);

-- Add comment to explain the structure
COMMENT ON COLUMN public.keyframes.frame_geometry IS 'Bounding boxes and safe zones: {boxes_percent: [{id, type, bbox: {x,y,w,h}, anchor, must_stay_within_safe_zone, overlap_rules, priority}], gaze_direction_map: [{character_id, gaze_target, gaze_angle_deg}]}';
COMMENT ON COLUMN public.keyframes.staging_snapshot IS 'Positions snapshot: {subject_positions: [{character_id, x_m, y_m, facing_deg, distance_to_camera_m}], prop_positions: [{prop_id, x_m, y_m}]}';
COMMENT ON COLUMN public.keyframes.negative_constraints IS 'List of forbidden elements for this keyframe';
COMMENT ON COLUMN public.keyframes.determinism IS 'Seed locking: {seed, resolution, steps, guidance, sampler}';