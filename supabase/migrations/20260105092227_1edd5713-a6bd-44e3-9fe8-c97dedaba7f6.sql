-- V3.0 FOUNDATION MIGRATION
-- Unified production data schema

-- 1.1 SCENES: Add technical_metadata column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'scenes' 
    AND column_name = 'technical_metadata'
  ) THEN
    ALTER TABLE public.scenes ADD COLUMN technical_metadata JSONB DEFAULT '{
      "_status": "EMPTY",
      "camera": {"lens": null, "movement": null, "framing": null},
      "lighting": {"type": null, "direction": null, "mood": null},
      "sound": {"sfx": [], "ambience": []},
      "color": {"palette": null, "contrast": null}
    }'::jsonb;
  END IF;
END $$;

-- 1.2 CHARACTERS: Add canon system columns
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS canon_level TEXT DEFAULT 'P3';
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS confidence FLOAT;

-- Add constraints for characters (using DO block to avoid duplicate constraint errors)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'characters_canon_level_check'
  ) THEN
    ALTER TABLE public.characters ADD CONSTRAINT characters_canon_level_check 
      CHECK (canon_level IN ('P0', 'P1', 'P2', 'P3'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'characters_source_check'
  ) THEN
    ALTER TABLE public.characters ADD CONSTRAINT characters_source_check 
      CHECK (source IN ('USER_PROVIDED', 'EXTRACTED', 'GENERATED'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'characters_confidence_check'
  ) THEN
    ALTER TABLE public.characters ADD CONSTRAINT characters_confidence_check 
      CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0));
  END IF;
END $$;

-- 1.3 LOCATIONS: Add canon system columns
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS visual_dna JSONB;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS canon_level TEXT DEFAULT 'P3';
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS confidence FLOAT;

-- Add constraints for locations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'locations_canon_level_check'
  ) THEN
    ALTER TABLE public.locations ADD CONSTRAINT locations_canon_level_check 
      CHECK (canon_level IN ('P0', 'P1', 'P2', 'P3'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'locations_source_check'
  ) THEN
    ALTER TABLE public.locations ADD CONSTRAINT locations_source_check 
      CHECK (source IN ('USER_PROVIDED', 'EXTRACTED', 'GENERATED'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'locations_confidence_check'
  ) THEN
    ALTER TABLE public.locations ADD CONSTRAINT locations_confidence_check 
      CHECK (confidence IS NULL OR (confidence >= 0.0 AND confidence <= 1.0));
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN public.scenes.technical_metadata IS 'V3.0 Foundation: Canonical technical metadata with _status (EMPTY|PARTIAL|EXPLICIT)';
COMMENT ON COLUMN public.characters.canon_level IS 'V3.0 Foundation: P0=User locked, P1=Explicit text, P2=Logical inference, P3=Weak inference';
COMMENT ON COLUMN public.locations.canon_level IS 'V3.0 Foundation: P0=User locked, P1=Explicit text, P2=Logical inference, P3=Weak inference';