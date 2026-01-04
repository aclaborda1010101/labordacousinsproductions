-- =====================================================
-- EDITORIAL KNOWLEDGE BASE v1 + ADAPTIVE UX
-- =====================================================

-- Add high-level project configuration columns to projects table
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS format_profile text DEFAULT 'short';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS animation_type text DEFAULT '3D';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS visual_style text DEFAULT 'pixar';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS user_level text DEFAULT 'explorer';

-- Add comments for documentation
COMMENT ON COLUMN public.projects.format_profile IS 'Project format: short, series, trailer, teaser, cinematic';
COMMENT ON COLUMN public.projects.animation_type IS 'Animation type: 2D, 3D, mixed';
COMMENT ON COLUMN public.projects.visual_style IS 'Visual style: pixar, ghibli, anime, cartoon, sports_epic, realistic';
COMMENT ON COLUMN public.projects.user_level IS 'User experience level: explorer, creator, pro';

-- Add same columns to editorial_projects for MVP consistency
ALTER TABLE public.editorial_projects ADD COLUMN IF NOT EXISTS format_profile text DEFAULT 'short';
ALTER TABLE public.editorial_projects ADD COLUMN IF NOT EXISTS animation_type text DEFAULT '3D';
ALTER TABLE public.editorial_projects ADD COLUMN IF NOT EXISTS visual_style text DEFAULT 'pixar';
ALTER TABLE public.editorial_projects ADD COLUMN IF NOT EXISTS user_level text DEFAULT 'explorer';

-- Create editorial knowledge base tables for future DB-driven rules (optional)
CREATE TABLE IF NOT EXISTS public.ekb_industry_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    description text NOT NULL,
    applies_to text[] NOT NULL DEFAULT '{}',
    impact text NOT NULL DEFAULT 'medium',
    effect jsonb NOT NULL DEFAULT '{}',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ekb_format_profiles (
    id text PRIMARY KEY,
    name text NOT NULL,
    rhythm text NOT NULL DEFAULT 'medium',
    avg_shot_duration_sec numeric NOT NULL DEFAULT 4,
    visual_complexity text NOT NULL DEFAULT 'medium',
    recommended_presets text[] NOT NULL DEFAULT '{}',
    activated_rules text[] NOT NULL DEFAULT '{}',
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ekb_animation_styles (
    id text PRIMARY KEY,
    name text NOT NULL,
    animation_type text NOT NULL DEFAULT '3D',
    visual_traits jsonb NOT NULL DEFAULT '{}',
    narrative_traits jsonb NOT NULL DEFAULT '{}',
    typical_composition text,
    lighting text,
    restrictions text[] NOT NULL DEFAULT '{}',
    preset_bias jsonb NOT NULL DEFAULT '{}',
    created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on new tables (read-only for everyone)
ALTER TABLE public.ekb_industry_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ekb_format_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ekb_animation_styles ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Anyone can read industry rules" ON public.ekb_industry_rules
    FOR SELECT USING (true);

CREATE POLICY "Anyone can read format profiles" ON public.ekb_format_profiles
    FOR SELECT USING (true);

CREATE POLICY "Anyone can read animation styles" ON public.ekb_animation_styles
    FOR SELECT USING (true);

-- Insert seed data for format profiles
INSERT INTO public.ekb_format_profiles (id, name, rhythm, avg_shot_duration_sec, visual_complexity, recommended_presets, activated_rules) VALUES
    ('short', 'Cortometraje', 'medium', 4, 'high', '{"hero", "establishing", "detail"}', '{}'),
    ('series', 'Serie', 'fast', 3, 'medium', '{"frontal", "action", "dialog"}', '{}'),
    ('trailer', 'Trailer', 'fast', 2, 'high', '{"hero", "action", "impact"}', '{}'),
    ('teaser', 'Teaser', 'slow', 5, 'high', '{"establishing", "mood", "silhouette"}', '{}'),
    ('cinematic', 'Cinemática', 'slow', 6, 'very_high', '{"hero", "establishing", "epic"}', '{}')
ON CONFLICT (id) DO NOTHING;

-- Insert seed data for animation styles
INSERT INTO public.ekb_animation_styles (id, name, animation_type, visual_traits, narrative_traits, typical_composition, lighting, restrictions, preset_bias) VALUES
    ('pixar', 'Pixar', '3D', '{"expressions": "exaggerated", "eyes": "large", "colors": "vibrant", "textures": "smooth"}', '{"emotion": "high", "humor": "family_friendly", "arc": "hero_journey"}', 'rule_of_thirds', 'soft_volumetric', '{"avoid_dark_themes", "no_realistic_violence"}', '{"expressive": 0.05, "character_focus": 0.03}'),
    ('ghibli', 'Studio Ghibli', '2D', '{"colors": "watercolor", "backgrounds": "detailed", "movement": "fluid", "nature": "prominent"}', '{"pace": "contemplative", "themes": "nature_humanity", "magic": "subtle"}', 'environmental_focus', 'natural_atmospheric', '{"avoid_fast_cuts", "respect_silence"}', '{"atmospheric": 0.05, "establishing": 0.04}'),
    ('anime', 'Anime / Manga', '2D', '{"eyes": "very_large", "expressions": "extreme", "speed_lines": true, "dramatic_lighting": true}', '{"drama": "high", "action": "intense", "emotion": "peak_moments"}', 'dynamic_angles', 'high_contrast', '{}', '{"action": 0.05, "impact": 0.04}'),
    ('cartoon', 'Cartoon Clásico', '2D', '{"proportions": "exaggerated", "squash_stretch": true, "colors": "bold", "outlines": "thick"}', '{"humor": "slapstick", "pace": "fast", "gags": "visual"}', 'centered_action', 'flat_bright', '{"avoid_realistic_physics"}', '{"comedic": 0.05, "expressive": 0.04}'),
    ('sports_epic', 'Deportivo Épico', '2D', '{"anatomy": "exaggerated", "motion_blur": true, "sweat_effects": true, "dramatic_angles": true}', '{"tension": "high", "rivalry": "core", "training_arcs": true}', 'low_angle_dynamic', 'dramatic_rim_light', '{}', '{"action": 0.06, "wide": 0.04}'),
    ('realistic', 'Realista', '3D', '{"textures": "photorealistic", "lighting": "physically_based", "proportions": "accurate"}', '{"drama": "grounded", "dialogue": "naturalistic"}', 'cinematic', 'naturalistic', '{"avoid_cartoon_physics"}', '{"cinematic": 0.05, "detail": 0.04}')
ON CONFLICT (id) DO NOTHING;

-- Insert seed data for industry rules
INSERT INTO public.ekb_industry_rules (name, description, applies_to, impact, effect, is_active) VALUES
    ('Silueta Protagonista', 'Los personajes protagonistas deben ser reconocibles solo por su silueta', '{"character"}', 'high', '{"recommend_preset": "silhouette", "warn_if_missing": true}', true),
    ('Contraste Infantil', 'Animación infantil debe evitar contrastes agresivos de color', '{"character", "location", "keyframe"}', 'medium', '{"limit_contrast": 0.7, "warn_style": ["realistic", "anime"]}', true),
    ('Planos Deportivos', 'Acción deportiva usa planos abiertos y exageración de movimiento', '{"keyframe"}', 'medium', '{"boost_preset": "wide", "motion_exaggeration": 1.3}', true),
    ('Consistencia Expresiva', 'Las expresiones del personaje deben mantener consistencia con su arco narrativo', '{"character"}', 'high', '{"require_expression_pack": true}', true),
    ('Iluminación Ambiental', 'La iluminación debe reflejar el tono emocional de la escena', '{"location", "keyframe"}', 'medium', '{"sync_lighting_mood": true}', true)
ON CONFLICT DO NOTHING;