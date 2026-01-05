-- Ensure scenes table has rich metadata column for forensic analysis data
-- Add metadata column if it doesn't exist (it may already exist from previous migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scenes' 
    AND column_name = 'forensic_metadata'
  ) THEN
    ALTER TABLE public.scenes ADD COLUMN forensic_metadata JSONB DEFAULT '{}'::jsonb;
    COMMENT ON COLUMN public.scenes.forensic_metadata IS 'Rich metadata from forensic script analysis v2.0 with confidence scores';
  END IF;
END $$;

-- Update existing metadata column comment
COMMENT ON COLUMN public.scenes.metadata IS 'Technical metadata for AI generation (visual_style, audio_cues, lighting_hints, etc.)';

-- Create index for efficient querying of forensic metadata
CREATE INDEX IF NOT EXISTS idx_scenes_forensic_metadata ON public.scenes USING GIN (forensic_metadata);

-- Add confidence tracking for parsed content
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scenes' 
    AND column_name = 'parse_confidence'
  ) THEN
    ALTER TABLE public.scenes ADD COLUMN parse_confidence NUMERIC(3,2) DEFAULT 0.5;
    COMMENT ON COLUMN public.scenes.parse_confidence IS 'Overall confidence score (0-1) from forensic parsing';
  END IF;
END $$;

-- Create index for filtering by confidence
CREATE INDEX IF NOT EXISTS idx_scenes_parse_confidence ON public.scenes (parse_confidence);
