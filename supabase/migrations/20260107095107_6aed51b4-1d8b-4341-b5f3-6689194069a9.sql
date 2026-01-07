-- Add visual_preset and style_config columns to style_packs table
ALTER TABLE public.style_packs 
ADD COLUMN IF NOT EXISTS visual_preset TEXT,
ADD COLUMN IF NOT EXISTS style_config JSONB DEFAULT '{}';

-- Add index for faster preset lookups
CREATE INDEX IF NOT EXISTS idx_style_packs_visual_preset ON public.style_packs(visual_preset);

-- Add micro_shot_duration to scenes table for shot duration control
ALTER TABLE public.scenes
ADD COLUMN IF NOT EXISTS micro_shot_duration INTEGER DEFAULT 2 CHECK (micro_shot_duration >= 1 AND micro_shot_duration <= 3);

COMMENT ON COLUMN public.style_packs.visual_preset IS 'Selected visual preset ID (noir, epic, documentary, fantasy, realistic, vintage, horror, comedy)';
COMMENT ON COLUMN public.style_packs.style_config IS 'Complete style configuration including camera, lighting, and prompt modifiers';
COMMENT ON COLUMN public.scenes.micro_shot_duration IS 'Default micro-shot duration in seconds (1, 2, or 3)';