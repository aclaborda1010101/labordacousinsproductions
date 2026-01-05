-- Add rich metadata column to scenes table for production-quality data
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Add visual_style column for quick filtering (B&W vs COLOR timelines like Oppenheimer)
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS visual_style TEXT DEFAULT 'COLOR';

-- Add audio_cues for sound design extraction
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS audio_cues TEXT[] DEFAULT '{}';

-- Add visual_fx_cues for VFX notes
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS visual_fx_cues TEXT[] DEFAULT '{}';

-- Add characters_present as names for quick access
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS characters_present TEXT[] DEFAULT '{}';

-- Add technical_notes for camera directions found in script
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS technical_notes TEXT;

-- Add standardized location for cross-language normalization
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS standardized_location TEXT;

-- Add standardized time for cross-language normalization
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS standardized_time TEXT;

-- Create index for visual_style filtering (useful for Oppenheimer-style timelines)
CREATE INDEX IF NOT EXISTS idx_scenes_visual_style ON public.scenes(visual_style);

-- Create index for metadata JSONB queries
CREATE INDEX IF NOT EXISTS idx_scenes_metadata ON public.scenes USING GIN(metadata);

COMMENT ON COLUMN public.scenes.metadata IS 'Rich metadata extracted from script for AI generation (lighting, camera hints, etc.)';
COMMENT ON COLUMN public.scenes.visual_style IS 'COLOR or MONOCHROME - for managing visual timelines';
COMMENT ON COLUMN public.scenes.audio_cues IS 'Sound effects and audio cues extracted from action lines';
COMMENT ON COLUMN public.scenes.visual_fx_cues IS 'VFX notes and visual effects extracted from script';