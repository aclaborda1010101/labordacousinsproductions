
-- ============================================
-- PHASE 0 CRITICAL FEATURES - DATABASE MIGRATION
-- ============================================

-- ============================================
-- 1. AUDIO PIPELINE
-- ============================================

CREATE TABLE IF NOT EXISTS audio_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shot_id UUID REFERENCES shots(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  
  room_tone JSONB NOT NULL DEFAULT '{
    "description": "",
    "frequency_profile": "",
    "reverb_size": "medium",
    "decay_time_seconds": 1.5
  }'::jsonb,
  
  ambience_layers JSONB NOT NULL DEFAULT '[]'::jsonb,
  foley_layers JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  mix_notes JSONB NOT NULL DEFAULT '{
    "dynamics": "wide_dynamic_range",
    "eq_notes": "",
    "reverb_settings": "",
    "compression": "none"
  }'::jsonb,
  
  validated BOOLEAN DEFAULT FALSE,
  validation_errors JSONB DEFAULT '[]'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audio_layers_shot ON audio_layers(shot_id);
CREATE INDEX IF NOT EXISTS idx_audio_layers_scene ON audio_layers(scene_id);
CREATE INDEX IF NOT EXISTS idx_audio_layers_location ON audio_layers(location_id);
CREATE INDEX IF NOT EXISTS idx_audio_layers_project ON audio_layers(project_id);

-- Audio Presets Library
CREATE TABLE IF NOT EXISTS audio_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  subcategory TEXT,
  description TEXT NOT NULL,
  preset_data JSONB NOT NULL,
  tags TEXT[] DEFAULT '{}',
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audio_presets_category ON audio_presets(category);
CREATE INDEX IF NOT EXISTS idx_audio_presets_tags ON audio_presets USING GIN(tags);

-- Insert default audio presets
INSERT INTO audio_presets (name, category, subcategory, description, preset_data, tags) VALUES
('Large Warehouse Reverb', 'room_tone', 'indoor', 'Empty industrial warehouse with 2.5 second decay', '{"frequency_profile": "low_rumble_mid_emptiness", "reverb_size": "large", "decay_time_seconds": 2.5}', ARRAY['warehouse', 'industrial', 'empty']),
('Small Office Reverb', 'room_tone', 'indoor', 'Modern office with short reverb', '{"frequency_profile": "neutral_clean", "reverb_size": "small", "decay_time_seconds": 0.5}', ARRAY['office', 'modern', 'corporate']),
('Outdoor Open Air', 'room_tone', 'outdoor', 'Minimal reverb for outdoor scenes', '{"frequency_profile": "clear_open", "reverb_size": "none", "decay_time_seconds": 0.1}', ARRAY['outdoor', 'nature', 'open']),
('City Traffic Distant', 'ambience', 'outdoor', 'Distant urban traffic hum', '{"volume": "low", "panning": "centered", "loop": true}', ARRAY['city', 'urban', 'traffic']),
('Wind Through Trees', 'ambience', 'outdoor', 'Gentle wind rustling leaves', '{"volume": "low", "panning": "stereo_wide", "loop": true}', ARRAY['nature', 'wind', 'trees']),
('Office AC Hum', 'ambience', 'indoor', 'Subtle air conditioning background', '{"volume": "very_low", "panning": "centered", "loop": true}', ARRAY['office', 'hvac', 'modern']),
('Warehouse Echo', 'ambience', 'indoor', 'Subtle echoes and distant machinery', '{"volume": "low", "panning": "stereo_wide", "loop": true}', ARRAY['warehouse', 'industrial', 'echo']),
('Footsteps Concrete Heavy', 'foley', 'footsteps', 'Heavy boots on concrete', '{"volume": "medium", "typical_timing": "0.8s_intervals", "sync_notes": "match_to_visual_steps"}', ARRAY['footsteps', 'boots', 'concrete', 'heavy']),
('Footsteps Wood Soft', 'foley', 'footsteps', 'Soft shoes on wooden floor', '{"volume": "low", "typical_timing": "0.6s_intervals", "sync_notes": "match_to_visual_steps"}', ARRAY['footsteps', 'shoes', 'wood', 'soft']),
('Door Open Creak', 'foley', 'props', 'Old door opening with creak', '{"volume": "medium", "typical_timing": "single_event", "sync_notes": "sync_to_door_movement"}', ARRAY['door', 'creak', 'old']),
('Cloth Rustle', 'foley', 'clothing', 'Fabric movement and rustle', '{"volume": "low", "typical_timing": "continuous", "sync_notes": "match_to_body_movement"}', ARRAY['cloth', 'fabric', 'movement'])
ON CONFLICT DO NOTHING;

-- ============================================
-- 5. ENHANCED CONTINUITY ANCHORS
-- ============================================

CREATE TABLE IF NOT EXISTS continuity_anchors_enhanced (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  shot_id UUID REFERENCES shots(id) ON DELETE CASCADE,
  
  time_of_day TEXT NOT NULL,
  time_exact TEXT,
  weather TEXT NOT NULL,
  temperature TEXT,
  
  character_states JSONB DEFAULT '{}'::jsonb,
  lighting_continuity JSONB DEFAULT '{}'::jsonb,
  props_states JSONB DEFAULT '{}'::jsonb,
  locked_values JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_continuity_anchors_enhanced_scene ON continuity_anchors_enhanced(scene_id);
CREATE INDEX IF NOT EXISTS idx_continuity_anchors_enhanced_shot ON continuity_anchors_enhanced(shot_id);
CREATE INDEX IF NOT EXISTS idx_continuity_anchors_enhanced_project ON continuity_anchors_enhanced(project_id);

-- ============================================
-- 6. CONTINUITY LOCK VALIDATION LOGS
-- ============================================

CREATE TABLE IF NOT EXISTS continuity_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shot_id UUID REFERENCES shots(id) ON DELETE CASCADE,
  
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  entity_name TEXT NOT NULL,
  
  locked_field TEXT NOT NULL,
  expected_value TEXT NOT NULL,
  attempted_value TEXT NOT NULL,
  
  violation_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  
  status TEXT DEFAULT 'pending',
  
  fix_notes TEXT,
  fixed_at TIMESTAMP WITH TIME ZONE,
  fixed_by TEXT,
  
  detected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_continuity_violations_shot ON continuity_violations(shot_id);
CREATE INDEX IF NOT EXISTS idx_continuity_violations_status ON continuity_violations(status);
CREATE INDEX IF NOT EXISTS idx_continuity_violations_project ON continuity_violations(project_id);

-- ============================================
-- 7. PRE-RENDER VALIDATION CHECKLIST
-- ============================================

CREATE TABLE IF NOT EXISTS pre_render_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shot_id UUID NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  
  can_render BOOLEAN DEFAULT FALSE,
  
  checks JSONB NOT NULL DEFAULT '{
    "required_refs_present": false,
    "audio_layers_valid": false,
    "timestamps_present": false,
    "continuity_locks_valid": false,
    "keyframes_complete": false
  }'::jsonb,
  
  blockers JSONB DEFAULT '[]'::jsonb,
  warnings JSONB DEFAULT '[]'::jsonb,
  
  validated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validated_by TEXT,
  
  override_validation BOOLEAN DEFAULT FALSE,
  override_reason TEXT,
  override_by TEXT,
  override_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_pre_render_validations_shot ON pre_render_validations(shot_id);
CREATE INDEX IF NOT EXISTS idx_pre_render_validations_can_render ON pre_render_validations(can_render);

-- ============================================
-- 8. UPDATE SHOTS TABLE
-- ============================================

ALTER TABLE shots ADD COLUMN IF NOT EXISTS audio_layer_id UUID REFERENCES audio_layers(id) ON DELETE SET NULL;
ALTER TABLE shots ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'not_validated';
ALTER TABLE shots ADD COLUMN IF NOT EXISTS blocking_timestamps JSONB DEFAULT '[]'::jsonb;

-- ============================================
-- 9. HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION validate_audio_layers(layer_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  layer_record RECORD;
  ambience_count INTEGER;
  foley_count INTEGER;
BEGIN
  SELECT * INTO layer_record FROM audio_layers WHERE id = layer_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  SELECT jsonb_array_length(layer_record.ambience_layers) INTO ambience_count;
  IF ambience_count < 2 THEN
    RETURN FALSE;
  END IF;
  
  SELECT jsonb_array_length(layer_record.foley_layers) INTO foley_count;
  IF foley_count < 2 THEN
    RETURN FALSE;
  END IF;
  
  IF layer_record.room_tone IS NULL OR layer_record.room_tone::text = '{}'::text THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION can_shot_render(shot_uuid UUID)
RETURNS TABLE(can_render BOOLEAN, blockers JSONB) AS $$
DECLARE
  shot_record RECORD;
  validation_record RECORD;
BEGIN
  SELECT * INTO shot_record FROM shots WHERE id = shot_uuid;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, '["Shot not found"]'::jsonb;
    RETURN;
  END IF;
  
  SELECT * INTO validation_record FROM pre_render_validations WHERE shot_id = shot_uuid;
  
  IF NOT FOUND THEN
    INSERT INTO pre_render_validations (shot_id) VALUES (shot_uuid);
    SELECT * INTO validation_record FROM pre_render_validations WHERE shot_id = shot_uuid;
  END IF;
  
  RETURN QUERY SELECT validation_record.can_render, validation_record.blockers;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- 10. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE audio_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE continuity_anchors_enhanced ENABLE ROW LEVEL SECURITY;
ALTER TABLE continuity_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_render_validations ENABLE ROW LEVEL SECURITY;

-- Audio layers - project access
CREATE POLICY "Project access for audio_layers" ON audio_layers
  FOR ALL USING (has_project_access(auth.uid(), project_id));

-- Audio presets - public read, no write (admin managed)
CREATE POLICY "Anyone can read audio_presets" ON audio_presets
  FOR SELECT USING (true);

-- Continuity anchors enhanced - project access
CREATE POLICY "Project access for continuity_anchors_enhanced" ON continuity_anchors_enhanced
  FOR ALL USING (has_project_access(auth.uid(), project_id));

-- Continuity violations - project access
CREATE POLICY "Project access for continuity_violations" ON continuity_violations
  FOR ALL USING (has_project_access(auth.uid(), project_id));

-- Pre-render validations - access via shot
CREATE POLICY "Access via shot for pre_render_validations" ON pre_render_validations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM shots sh
      JOIN scenes sc ON sc.id = sh.scene_id
      WHERE sh.id = pre_render_validations.shot_id
      AND has_project_access(auth.uid(), sc.project_id)
    )
  );
