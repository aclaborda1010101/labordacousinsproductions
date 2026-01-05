-- Add parsed_json column to scenes table for rich script data
-- This stores the complete parsed/generated script metadata per scene

ALTER TABLE public.scenes 
ADD COLUMN IF NOT EXISTS parsed_json JSONB DEFAULT '{}';

-- Add comment explaining the column purpose
COMMENT ON COLUMN public.scenes.parsed_json IS 'Rich script data from Parser/Generator: dialogue, action, technical cues, confidence scores';

-- Create index for JSONB querying
CREATE INDEX IF NOT EXISTS idx_scenes_parsed_json_gin ON public.scenes USING GIN (parsed_json);

-- Add visual_style_source to track where the style came from
ALTER TABLE public.scenes 
ADD COLUMN IF NOT EXISTS visual_style_source TEXT DEFAULT 'default';

-- Add confidence_score for the overall scene parse quality
ALTER TABLE public.scenes 
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2) DEFAULT 0.50;

COMMENT ON COLUMN public.scenes.confidence_score IS 'Overall confidence of parsed data (0.00-1.00)';