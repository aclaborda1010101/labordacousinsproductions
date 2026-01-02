
-- ============================================
-- PHASE 1: VISUAL DNA COMPLETE SYSTEM
-- ============================================

-- 1. CREATE CHARACTER_VISUAL_DNA TABLE
CREATE TABLE IF NOT EXISTS public.character_visual_dna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE,
  
  -- Versioning
  version INTEGER NOT NULL DEFAULT 1,
  version_name TEXT DEFAULT 'default',
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Approval
  approved BOOLEAN DEFAULT FALSE,
  approved_by UUID REFERENCES public.profiles(user_id),
  approved_at TIMESTAMP WITH TIME ZONE,
  
  -- Full Visual DNA (JSONB for flexibility with 80+ fields)
  visual_dna JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Continuity Lock
  continuity_lock JSONB NOT NULL DEFAULT '{
    "never_change": [],
    "allowed_variants": [],
    "must_avoid": [],
    "version_notes": ""
  }'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique version per character
  UNIQUE(character_id, version)
);

-- 2. CREATE CHARACTER_NARRATIVE TABLE
CREATE TABLE IF NOT EXISTS public.character_narrative (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES public.characters(id) ON DELETE CASCADE UNIQUE,
  
  biography JSONB NOT NULL DEFAULT '{
    "age": 0,
    "occupation": "",
    "background": "",
    "personality_traits": [],
    "likes_dislikes": {"likes": [], "dislikes": []},
    "fears": [],
    "goals": []
  }'::jsonb,
  
  character_arc JSONB DEFAULT '{
    "starting_point": "",
    "journey": "",
    "transformation": "",
    "ending_point": ""
  }'::jsonb,
  
  relationships JSONB DEFAULT '[]'::jsonb,
  
  voice_performance JSONB DEFAULT '{
    "speaking_voice": "",
    "notable_phrases": [],
    "speech_quirks": []
  }'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. ADD REFERENCE TO CHARACTERS TABLE
ALTER TABLE public.characters 
ADD COLUMN IF NOT EXISTS active_visual_dna_id UUID REFERENCES public.character_visual_dna(id) ON DELETE SET NULL;

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_visual_dna_character ON public.character_visual_dna(character_id);
CREATE INDEX IF NOT EXISTS idx_visual_dna_active ON public.character_visual_dna(character_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_narrative_character ON public.character_narrative(character_id);

-- 5. GET ACTIVE VISUAL DNA FUNCTION
CREATE OR REPLACE FUNCTION public.get_active_visual_dna(char_id UUID)
RETURNS JSONB AS $$
DECLARE
  vdna JSONB;
BEGIN
  SELECT visual_dna INTO vdna
  FROM public.character_visual_dna
  WHERE character_id = char_id AND is_active = true
  LIMIT 1;
  
  RETURN COALESCE(vdna, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. CREATE VERSION FUNCTION
CREATE OR REPLACE FUNCTION public.create_visual_dna_version(
  char_id UUID,
  new_version_name TEXT,
  modifications JSONB
)
RETURNS UUID AS $$
DECLARE
  current_dna JSONB;
  current_lock JSONB;
  new_version_num INTEGER;
  new_id UUID;
BEGIN
  SELECT visual_dna, continuity_lock INTO current_dna, current_lock
  FROM public.character_visual_dna
  WHERE character_id = char_id AND is_active = true;
  
  SELECT COALESCE(MAX(version), 0) + 1 INTO new_version_num
  FROM public.character_visual_dna
  WHERE character_id = char_id;
  
  UPDATE public.character_visual_dna
  SET is_active = false
  WHERE character_id = char_id AND is_active = true;
  
  INSERT INTO public.character_visual_dna (
    character_id, version, version_name, is_active, visual_dna, continuity_lock
  ) VALUES (
    char_id, new_version_num, new_version_name, true, 
    COALESCE(current_dna, '{}'::jsonb) || modifications,
    COALESCE(current_lock, '{"never_change":[],"must_avoid":[],"allowed_variants":[]}'::jsonb)
  )
  RETURNING id INTO new_id;
  
  UPDATE public.characters SET active_visual_dna_id = new_id WHERE id = char_id;
  
  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. ROW LEVEL SECURITY
ALTER TABLE public.character_visual_dna ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.character_narrative ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via character for visual_dna" ON public.character_visual_dna
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.characters c
    WHERE c.id = character_visual_dna.character_id
    AND has_project_access(auth.uid(), c.project_id)
  )
);

CREATE POLICY "Access via character for narrative" ON public.character_narrative
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.characters c
    WHERE c.id = character_narrative.character_id
    AND has_project_access(auth.uid(), c.project_id)
  )
);
