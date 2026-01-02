-- =============================================
-- BLOCKBUSTER FORGE v7 - DATABASE SCHEMA PHASE 1
-- =============================================

-- 1) WARDROBE TABLE (outfits con continuidad temporal)
CREATE TABLE IF NOT EXISTS public.wardrobe (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  character_id UUID REFERENCES public.characters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  outfit_type TEXT DEFAULT 'casual', -- casual, formal, action, sleepwear, etc.
  fabric_materials JSONB DEFAULT '[]'::jsonb,
  color_palette JSONB DEFAULT '{}'::jsonb,
  accessories JSONB DEFAULT '[]'::jsonb,
  condition TEXT DEFAULT 'clean', -- clean, dirty, torn, wet, bloody
  continuity_notes TEXT,
  reference_urls JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft', -- draft, ready, locked
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2) SET_PIECES TABLE (secuencias de acción/coreografías)
CREATE TABLE IF NOT EXISTS public.set_pieces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  set_piece_type TEXT DEFAULT 'action', -- action, chase, fight, stunt, dance
  duration_estimate_sec NUMERIC,
  complexity_level TEXT DEFAULT 'medium', -- low, medium, high, extreme
  safety_notes TEXT,
  vfx_requirements JSONB DEFAULT '[]'::jsonb,
  stunt_requirements JSONB DEFAULT '[]'::jsonb,
  blocking_plan JSONB DEFAULT '{}'::jsonb,
  reference_urls JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3) VFX_SFX TABLE (efectos visuales y especiales)
CREATE TABLE IF NOT EXISTS public.vfx_sfx (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  effect_type TEXT DEFAULT 'vfx', -- vfx, sfx, practical, hybrid
  category TEXT, -- explosion, fire, smoke, magic, destruction, weather, etc.
  description TEXT,
  trigger_cue TEXT, -- what triggers this effect
  duration_sec NUMERIC,
  intensity_level TEXT DEFAULT 'medium',
  integration_notes TEXT, -- how it integrates with live action
  reference_urls JSONB DEFAULT '[]'::jsonb,
  technical_specs JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4) SOUND_MUSIC TABLE (ambientes, leitmotifs, efectos sonoros)
CREATE TABLE IF NOT EXISTS public.sound_music (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sound_type TEXT DEFAULT 'ambience', -- ambience, foley, music, leitmotif, sfx
  category TEXT, -- room_tone, nature, urban, score, source_music
  description TEXT,
  location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
  character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL, -- for leitmotifs
  layers JSONB DEFAULT '[]'::jsonb, -- array of sound layers
  mix_notes TEXT,
  reference_urls JSONB DEFAULT '[]'::jsonb,
  bpm INTEGER, -- for music
  key_signature TEXT, -- for music
  mood TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5) CONTINUITY_ANCHORS TABLE (estado temporal: día/hora/clima/estado físico)
CREATE TABLE IF NOT EXISTS public.continuity_anchors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES public.scenes(id) ON DELETE CASCADE,
  character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  anchor_type TEXT NOT NULL, -- time_of_day, weather, physical_state, emotional_state, prop_state
  name TEXT NOT NULL,
  description TEXT,
  value JSONB DEFAULT '{}'::jsonb, -- specific values for this anchor
  applies_from_scene INTEGER, -- scene number where this starts
  applies_to_scene INTEGER, -- scene number where this ends (null = ongoing)
  continuity_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 6) ENTITY_REFS TABLE (referencias/assets por entidad con slots)
CREATE TABLE IF NOT EXISTS public.entity_refs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- character, location, prop, wardrobe, set_piece, vfx_sfx, sound_music
  entity_id UUID NOT NULL,
  slot TEXT NOT NULL, -- identity_front, turnaround_side, outfit_A_full, etc.
  slot_index INTEGER DEFAULT 0,
  required BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'missing', -- missing, generating, generated, uploaded, approved, rejected
  asset_url TEXT,
  asset_metadata JSONB DEFAULT '{}'::jsonb,
  prompt_used TEXT,
  negative_prompt JSONB DEFAULT '[]'::jsonb,
  acceptance_criteria JSONB DEFAULT '[]'::jsonb,
  qc_score INTEGER,
  qc_issues JSONB DEFAULT '[]'::jsonb,
  fix_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id, slot, slot_index)
);

-- 7) CONTINUITY_LOCKS TABLE (invariantes por entidad)
CREATE TABLE IF NOT EXISTS public.continuity_locks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  never_change JSONB DEFAULT '[]'::jsonb, -- array of locked attributes
  must_avoid JSONB DEFAULT '[]'::jsonb, -- things to never do
  allowed_variants JSONB DEFAULT '[]'::jsonb, -- acceptable variations
  scene_invariants JSONB DEFAULT '[]'::jsonb, -- scene-specific locks
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(entity_type, entity_id)
);

-- 8) CONTINUITY_EVENTS TABLE (estado de continuidad por escena)
CREATE TABLE IF NOT EXISTS public.continuity_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scene_id UUID NOT NULL REFERENCES public.scenes(id) ON DELETE CASCADE,
  character_id UUID REFERENCES public.characters(id) ON DELETE SET NULL,
  wardrobe_id UUID REFERENCES public.wardrobe(id) ON DELETE SET NULL,
  props JSONB DEFAULT '[]'::jsonb, -- props in use
  physical_state JSONB DEFAULT '{}'::jsonb, -- injuries, sweat, dirt, etc.
  emotional_state TEXT,
  time_context JSONB DEFAULT '{}'::jsonb, -- time of day, weather
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 9) PROPS TABLE (objetos separados de locations)
CREATE TABLE IF NOT EXISTS public.props (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prop_type TEXT, -- phone, laptop, weapon, document, vehicle, etc.
  description TEXT,
  materials JSONB DEFAULT '[]'::jsonb,
  condition TEXT DEFAULT 'new', -- new, used, worn, damaged
  color_finish TEXT,
  dimensions TEXT,
  interaction_rules TEXT, -- how characters interact with it
  placement_rules TEXT, -- where it sits, orientation
  continuity_notes TEXT,
  reference_urls JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 10) SCRIPT_BREAKDOWNS TABLE (resultados del breakdown)
CREATE TABLE IF NOT EXISTS public.script_breakdowns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  script_id UUID NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  breakdown_data JSONB DEFAULT '{}'::jsonb, -- full breakdown results
  entities_detected JSONB DEFAULT '[]'::jsonb, -- list of detected entities
  scenes_detected JSONB DEFAULT '[]'::jsonb, -- list of detected scenes
  continuity_risks JSONB DEFAULT '[]'::jsonb, -- identified risks
  status TEXT DEFAULT 'pending', -- pending, complete, imported
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 11) EPISODES TABLE (para series)
CREATE TABLE IF NOT EXISTS public.episodes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  episode_index INTEGER NOT NULL DEFAULT 1,
  title TEXT,
  duration_target_min INTEGER DEFAULT 30,
  script_id UUID REFERENCES public.scripts(id) ON DELETE SET NULL,
  summary TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, episode_index)
);

-- Enable RLS on all new tables
ALTER TABLE public.wardrobe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.set_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfx_sfx ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sound_music ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.continuity_anchors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.continuity_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.continuity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.props ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_breakdowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for all tables (project access)
CREATE POLICY "Project access for wardrobe" ON public.wardrobe FOR ALL USING (has_project_access(auth.uid(), project_id));
CREATE POLICY "Project access for set_pieces" ON public.set_pieces FOR ALL USING (has_project_access(auth.uid(), project_id));
CREATE POLICY "Project access for vfx_sfx" ON public.vfx_sfx FOR ALL USING (has_project_access(auth.uid(), project_id));
CREATE POLICY "Project access for sound_music" ON public.sound_music FOR ALL USING (has_project_access(auth.uid(), project_id));
CREATE POLICY "Project access for continuity_anchors" ON public.continuity_anchors FOR ALL USING (has_project_access(auth.uid(), project_id));
CREATE POLICY "Project access for entity_refs" ON public.entity_refs FOR ALL USING (has_project_access(auth.uid(), project_id));
CREATE POLICY "Project access for continuity_locks" ON public.continuity_locks FOR ALL USING (has_project_access(auth.uid(), project_id));
CREATE POLICY "Project access for continuity_events" ON public.continuity_events FOR ALL USING (has_project_access(auth.uid(), project_id));
CREATE POLICY "Project access for props" ON public.props FOR ALL USING (has_project_access(auth.uid(), project_id));
CREATE POLICY "Project access for script_breakdowns" ON public.script_breakdowns FOR ALL USING (has_project_access(auth.uid(), project_id));
CREATE POLICY "Project access for episodes" ON public.episodes FOR ALL USING (has_project_access(auth.uid(), project_id));

-- Triggers for updated_at
CREATE TRIGGER update_wardrobe_updated_at BEFORE UPDATE ON public.wardrobe FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_set_pieces_updated_at BEFORE UPDATE ON public.set_pieces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vfx_sfx_updated_at BEFORE UPDATE ON public.vfx_sfx FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sound_music_updated_at BEFORE UPDATE ON public.sound_music FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_continuity_anchors_updated_at BEFORE UPDATE ON public.continuity_anchors FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_entity_refs_updated_at BEFORE UPDATE ON public.entity_refs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_continuity_locks_updated_at BEFORE UPDATE ON public.continuity_locks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_continuity_events_updated_at BEFORE UPDATE ON public.continuity_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_props_updated_at BEFORE UPDATE ON public.props FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_script_breakdowns_updated_at BEFORE UPDATE ON public.script_breakdowns FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_episodes_updated_at BEFORE UPDATE ON public.episodes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add missing columns to existing tables

-- Add objective and mood to scenes if not exists
ALTER TABLE public.scenes ADD COLUMN IF NOT EXISTS objective TEXT;

-- Add fields_json and prompt_json to shots
ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS fields_json JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS prompt_json JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS engine TEXT DEFAULT 'veo';
ALTER TABLE public.shots ADD COLUMN IF NOT EXISTS render_status TEXT DEFAULT 'draft'; -- draft, ready, rendering, done, failed

-- Add profile_json to characters
ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS profile_json JSONB DEFAULT '{}'::jsonb;

-- Add profile_json to locations
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS profile_json JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

-- Add locked status to style_packs
ALTER TABLE public.style_packs ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT false;
ALTER TABLE public.style_packs ADD COLUMN IF NOT EXISTS tone TEXT;
ALTER TABLE public.style_packs ADD COLUMN IF NOT EXISTS realism_level TEXT DEFAULT 'Cinematic_Real';
ALTER TABLE public.style_packs ADD COLUMN IF NOT EXISTS camera_system TEXT DEFAULT 'Modern_Digital_Clean';

-- Add status to scripts
ALTER TABLE public.scripts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'; -- draft, locked
ALTER TABLE public.scripts ADD COLUMN IF NOT EXISTS parsed_json JSONB DEFAULT '{}'::jsonb;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_wardrobe_project ON public.wardrobe(project_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_character ON public.wardrobe(character_id);
CREATE INDEX IF NOT EXISTS idx_set_pieces_project ON public.set_pieces(project_id);
CREATE INDEX IF NOT EXISTS idx_vfx_sfx_project ON public.vfx_sfx(project_id);
CREATE INDEX IF NOT EXISTS idx_sound_music_project ON public.sound_music(project_id);
CREATE INDEX IF NOT EXISTS idx_continuity_anchors_project ON public.continuity_anchors(project_id);
CREATE INDEX IF NOT EXISTS idx_continuity_anchors_scene ON public.continuity_anchors(scene_id);
CREATE INDEX IF NOT EXISTS idx_entity_refs_entity ON public.entity_refs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_continuity_locks_entity ON public.continuity_locks(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_continuity_events_scene ON public.continuity_events(scene_id);
CREATE INDEX IF NOT EXISTS idx_props_project ON public.props(project_id);
CREATE INDEX IF NOT EXISTS idx_script_breakdowns_script ON public.script_breakdowns(script_id);
CREATE INDEX IF NOT EXISTS idx_episodes_project ON public.episodes(project_id);