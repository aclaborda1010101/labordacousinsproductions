-- ============================================
-- PHASE 2: REFERENCE IMAGE ANCHORING
-- Enhanced reference system with weight/influence tracking
-- ============================================

-- ============================================
-- 1. ENHANCE CHARACTER_PACK_SLOTS TABLE
-- ============================================

ALTER TABLE character_pack_slots
ADD COLUMN IF NOT EXISTS reference_anchor_id UUID,
ADD COLUMN IF NOT EXISTS reference_weight NUMERIC DEFAULT 0.7,
ADD COLUMN IF NOT EXISTS ip_adapter_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS generation_metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN character_pack_slots.reference_anchor_id IS 'Reference anchor that was used for this generation';
COMMENT ON COLUMN character_pack_slots.reference_weight IS 'Weight/influence of reference image (0.0-1.0), 0.7 = 70% influence';
COMMENT ON COLUMN character_pack_slots.ip_adapter_enabled IS 'Whether IP adapter was used for this generation';
COMMENT ON COLUMN character_pack_slots.generation_metadata IS 'Complete generation params: engine, model, seed, steps, etc.';

-- ============================================
-- 2. CREATE REFERENCE_ANCHORS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS reference_anchors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  
  anchor_type TEXT NOT NULL CHECK (anchor_type IN (
    'identity_primary',
    'identity_secondary',
    'expression_neutral',
    'turnaround_front',
    'turnaround_side',
    'outfit_default',
    'custom'
  )),
  
  image_url TEXT NOT NULL,
  
  priority INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT TRUE,
  approved BOOLEAN DEFAULT FALSE,
  approved_by UUID REFERENCES profiles(user_id),
  approved_at TIMESTAMP WITH TIME ZONE,
  
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMP WITH TIME ZONE,
  
  metadata JSONB DEFAULT '{
    "face_embedding": null,
    "dominant_colors": [],
    "quality_score": 0,
    "likeness_verified": false
  }'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(character_id, anchor_type, image_url)
);

CREATE INDEX IF NOT EXISTS idx_reference_anchors_character ON reference_anchors(character_id);
CREATE INDEX IF NOT EXISTS idx_reference_anchors_type ON reference_anchors(anchor_type);
CREATE INDEX IF NOT EXISTS idx_reference_anchors_active ON reference_anchors(character_id, is_active) WHERE is_active = true;

-- Add foreign key for character_pack_slots
ALTER TABLE character_pack_slots
ADD CONSTRAINT fk_character_pack_slots_reference_anchor
FOREIGN KEY (reference_anchor_id) REFERENCES reference_anchors(id) ON DELETE SET NULL;

-- ============================================
-- 3. CREATE LIKENESS_COMPARISONS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS likeness_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  reference_anchor_id UUID NOT NULL REFERENCES reference_anchors(id) ON DELETE CASCADE,
  generated_slot_id UUID NOT NULL REFERENCES character_pack_slots(id) ON DELETE CASCADE,
  
  overall_likeness_score NUMERIC CHECK (overall_likeness_score >= 0 AND overall_likeness_score <= 100),
  
  scores JSONB DEFAULT '{
    "face_structure": 0,
    "eye_match": 0,
    "nose_match": 0,
    "mouth_match": 0,
    "skin_tone_match": 0,
    "hair_match": 0,
    "overall_proportion": 0
  }'::jsonb,
  
  issues JSONB DEFAULT '[]'::jsonb,
  
  passes_threshold BOOLEAN DEFAULT FALSE,
  threshold_used NUMERIC DEFAULT 80,
  
  ai_analysis TEXT,
  ai_model_used TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_likeness_comparisons_anchor ON likeness_comparisons(reference_anchor_id);
CREATE INDEX IF NOT EXISTS idx_likeness_comparisons_slot ON likeness_comparisons(generated_slot_id);

-- ============================================
-- 4. CREATE GENERATION_HISTORY TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS generation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot_id UUID REFERENCES character_pack_slots(id) ON DELETE SET NULL,
  shot_id UUID REFERENCES shots(id) ON DELETE SET NULL,
  
  engine TEXT NOT NULL,
  model TEXT NOT NULL,
  
  prompt_text TEXT NOT NULL,
  negative_prompt TEXT,
  
  technical_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  reference_images JSONB DEFAULT '[]'::jsonb,
  
  result_url TEXT,
  success BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  
  qc_score NUMERIC,
  likeness_score NUMERIC,
  
  cost_usd NUMERIC,
  duration_seconds NUMERIC,
  
  is_reproducible BOOLEAN DEFAULT TRUE,
  reproduction_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generation_history_character ON generation_history(character_id);
CREATE INDEX IF NOT EXISTS idx_generation_history_slot ON generation_history(slot_id);
CREATE INDEX IF NOT EXISTS idx_generation_history_created ON generation_history(created_at DESC);

-- ============================================
-- 5. HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION get_primary_identity_anchor(char_id UUID)
RETURNS TABLE(
  anchor_id UUID,
  image_url TEXT,
  anchor_type TEXT,
  priority INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ra.id as anchor_id,
    ra.image_url,
    ra.anchor_type,
    ra.priority
  FROM reference_anchors ra
  WHERE ra.character_id = char_id
    AND ra.is_active = true
    AND ra.approved = true
    AND ra.anchor_type IN ('identity_primary', 'identity_secondary')
  ORDER BY ra.priority ASC, ra.created_at ASC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION get_active_anchors(char_id UUID, anchor_types TEXT[] DEFAULT NULL)
RETURNS TABLE(
  anchor_id UUID,
  image_url TEXT,
  anchor_type TEXT,
  priority INTEGER,
  usage_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ra.id as anchor_id,
    ra.image_url,
    ra.anchor_type,
    ra.priority,
    ra.usage_count
  FROM reference_anchors ra
  WHERE ra.character_id = char_id
    AND ra.is_active = true
    AND ra.approved = true
    AND (anchor_types IS NULL OR ra.anchor_type = ANY(anchor_types))
  ORDER BY ra.priority ASC, ra.usage_count ASC;
END;
$$;

CREATE OR REPLACE FUNCTION record_anchor_usage(p_anchor_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE reference_anchors
  SET 
    usage_count = usage_count + 1,
    last_used_at = NOW()
  WHERE id = p_anchor_id;
END;
$$;

-- ============================================
-- 6. TRIGGERS
-- ============================================

CREATE TRIGGER update_reference_anchors_updated_at
  BEFORE UPDATE ON reference_anchors
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE reference_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE likeness_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via character for reference_anchors" ON reference_anchors
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM characters c
    WHERE c.id = reference_anchors.character_id
    AND has_project_access(auth.uid(), c.project_id)
  )
);

CREATE POLICY "Access via anchor for likeness_comparisons" ON likeness_comparisons
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM reference_anchors ra
    JOIN characters c ON c.id = ra.character_id
    WHERE ra.id = likeness_comparisons.reference_anchor_id
    AND has_project_access(auth.uid(), c.project_id)
  )
);

CREATE POLICY "Access via character for generation_history" ON generation_history
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM characters c
    WHERE c.id = generation_history.character_id
    AND has_project_access(auth.uid(), c.project_id)
  )
);