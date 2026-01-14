-- Add canvas_format column to style_packs table
-- This stores the global video format configuration for the entire project pipeline

ALTER TABLE style_packs 
ADD COLUMN IF NOT EXISTS canvas_format JSONB DEFAULT '{
  "aspect_ratio": "16:9",
  "orientation": "horizontal",
  "safe_area": {"top": 5, "bottom": 5, "left": 5, "right": 5}
}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN style_packs.canvas_format IS 'Global canvas format for the entire pipeline: storyboard, keyframes, video. Defines aspect_ratio, orientation, and safe_area margins.';