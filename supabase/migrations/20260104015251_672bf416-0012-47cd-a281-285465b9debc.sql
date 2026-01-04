-- Short Templates v1: Templates for short format projects
-- Each template has 5 steps with recommended presets and shot types

-- Create short_templates table
CREATE TABLE public.short_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  style_id TEXT NOT NULL, -- references animation_styles (pixar, ghibli, anime, etc.)
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]',
  recommended_shots JSONB,
  pacing TEXT DEFAULT 'medium',
  duration_range TEXT DEFAULT '3-7 min',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.short_templates ENABLE ROW LEVEL SECURITY;

-- Public read access (templates are shared)
CREATE POLICY "Templates are publicly readable"
  ON public.short_templates FOR SELECT
  USING (true);

-- Add template tracking fields to projects
ALTER TABLE public.projects 
  ADD COLUMN IF NOT EXISTS active_template_id UUID REFERENCES public.short_templates(id),
  ADD COLUMN IF NOT EXISTS active_template_step_index INT DEFAULT 0;

-- Add template_step_key to generation_runs for autopilot v2
ALTER TABLE public.generation_runs
  ADD COLUMN IF NOT EXISTS template_step_key TEXT;

-- Seed templates for all 6 canonical styles

-- 1. Pixar: Emotional Journey
INSERT INTO public.short_templates (style_id, name, description, pacing, duration_range, steps) VALUES
('pixar', 'Viaje Emocional Pixar', 'Estructura clásica de cortometraje Pixar: presentación emotiva, conflicto interno, y resolución con catarsis.', 'medium', '5-8 min',
'[
  {"stepKey": "intro_world", "label": "Presentación del mundo", "recommendedPresetIds": ["establishing", "atmospheric", "wide"], "shotType": "location", "notes": "Establece el tono emocional y el contexto visual del mundo."},
  {"stepKey": "intro_character", "label": "Presentación del personaje", "recommendedPresetIds": ["character_focus", "expressive", "hero"], "shotType": "character", "notes": "Muestra al protagonista con su rasgo distintivo y vulnerabilidad."},
  {"stepKey": "conflict", "label": "Conflicto o deseo", "recommendedPresetIds": ["dramatic", "medium", "frontal"], "shotType": "keyframe", "notes": "El personaje enfrenta un obstáculo o descubre un anhelo."},
  {"stepKey": "transformation", "label": "Momento de cambio", "recommendedPresetIds": ["impact", "close", "emotional"], "shotType": "keyframe", "notes": "El punto de giro emocional. Cambio interno del personaje."},
  {"stepKey": "resolution", "label": "Resolución emotiva", "recommendedPresetIds": ["hero", "establishing", "warm"], "shotType": "keyframe", "notes": "Catarsis final. El personaje ha crecido o aceptado algo."}
]');

-- 2. Ghibli: Contemplative
INSERT INTO public.short_templates (style_id, name, description, pacing, duration_range, steps) VALUES
('ghibli', 'Contemplación Ghibli', 'Estructura pausada del estilo Ghibli: observación, silencio, y conexión con la naturaleza.', 'slow', '5-10 min',
'[
  {"stepKey": "nature_intro", "label": "El entorno natural", "recommendedPresetIds": ["atmospheric", "establishing", "environmental"], "shotType": "location", "notes": "Plano amplio de la naturaleza. Deja respirar la imagen."},
  {"stepKey": "character_in_world", "label": "El personaje en su mundo", "recommendedPresetIds": ["character_focus", "medium", "observational"], "shotType": "character", "notes": "El personaje interactúa naturalmente con el entorno."},
  {"stepKey": "quiet_moment", "label": "Momento de silencio", "recommendedPresetIds": ["mood", "contemplative", "detail"], "shotType": "keyframe", "notes": "Pausa narrativa. Observación sin diálogo."},
  {"stepKey": "subtle_magic", "label": "Lo mágico sutil", "recommendedPresetIds": ["atmospheric", "wonder", "wide"], "shotType": "keyframe", "notes": "Un elemento mágico o extraordinario aparece naturalmente."},
  {"stepKey": "peaceful_end", "label": "Final sereno", "recommendedPresetIds": ["establishing", "warm", "environmental"], "shotType": "keyframe", "notes": "Regreso a la calma. Cierre contemplativo."}
]');

-- 3. Anime/Manga: Dramatic Impact
INSERT INTO public.short_templates (style_id, name, description, pacing, duration_range, steps) VALUES
('anime', 'Impacto Dramático Anime', 'Estructura de alto impacto visual: tensión creciente hasta el climax explosivo.', 'fast', '3-6 min',
'[
  {"stepKey": "setup_tension", "label": "Setup de tensión", "recommendedPresetIds": ["establishing", "dramatic", "ominous"], "shotType": "location", "notes": "Ambiente cargado. Algo importante está por pasar."},
  {"stepKey": "character_determined", "label": "Personaje determinado", "recommendedPresetIds": ["hero", "intense", "close"], "shotType": "character", "notes": "Close-up del protagonista. Expresión intensa."},
  {"stepKey": "escalation", "label": "Escalada", "recommendedPresetIds": ["action", "dynamic", "speed_lines"], "shotType": "keyframe", "notes": "Acción en aumento. Ritmo acelerado."},
  {"stepKey": "climax_moment", "label": "Momento climático", "recommendedPresetIds": ["impact", "dramatic", "explosive"], "shotType": "keyframe", "notes": "El pico de la acción. Máximo impacto visual."},
  {"stepKey": "aftermath", "label": "Consecuencia", "recommendedPresetIds": ["emotional", "aftermath", "hero"], "shotType": "keyframe", "notes": "El resultado del climax. Resolución emocional."}
]');

-- 4. Sports Epic: Legendary Moment
INSERT INTO public.short_templates (style_id, name, description, pacing, duration_range, steps) VALUES
('sports_epic', 'Momento Legendario Deportivo', 'Estructura épica deportiva estilo Oliver y Benji: preparación, desafío, y jugada legendaria.', 'fast', '3-5 min',
'[
  {"stepKey": "stadium_setup", "label": "El escenario", "recommendedPresetIds": ["establishing", "wide", "epic"], "shotType": "location", "notes": "El estadio, la cancha, el contexto épico del momento."},
  {"stepKey": "rival_intro", "label": "El rival o desafío", "recommendedPresetIds": ["dramatic", "intense", "character_focus"], "shotType": "character", "notes": "Presentación del obstáculo. Mirada del rival."},
  {"stepKey": "preparation", "label": "La preparación", "recommendedPresetIds": ["action", "dynamic", "close"], "shotType": "keyframe", "notes": "Concentración. El protagonista se prepara para el momento."},
  {"stepKey": "legendary_move", "label": "La jugada legendaria", "recommendedPresetIds": ["impact", "action", "speed_lines"], "shotType": "keyframe", "notes": "El tiro, la patada, el movimiento imposible. Slow motion."},
  {"stepKey": "victory_emotion", "label": "Emoción del triunfo", "recommendedPresetIds": ["hero", "emotional", "wide"], "shotType": "keyframe", "notes": "Celebración o momento de orgullo. Liberación emocional."}
]');

-- 5. Cartoon Classic: Visual Gag
INSERT INTO public.short_templates (style_id, name, description, pacing, duration_range, steps) VALUES
('cartoon', 'Gag Visual Cartoon', 'Estructura de comedia visual clásica: setup del gag, complicación, y punchline visual.', 'fast', '2-4 min',
'[
  {"stepKey": "normal_situation", "label": "Situación normal", "recommendedPresetIds": ["establishing", "simple", "frontal"], "shotType": "location", "notes": "Todo parece tranquilo. Setup inocente."},
  {"stepKey": "character_plan", "label": "El personaje tiene un plan", "recommendedPresetIds": ["character_focus", "expressive", "comedic"], "shotType": "character", "notes": "Expresión de confianza o astucia. Algo va a intentar."},
  {"stepKey": "execution_fail", "label": "El plan falla", "recommendedPresetIds": ["action", "comedic", "dynamic"], "shotType": "keyframe", "notes": "Las cosas salen mal de forma exagerada."},
  {"stepKey": "escalation_chaos", "label": "Escalada de caos", "recommendedPresetIds": ["action", "wide", "chaotic"], "shotType": "keyframe", "notes": "Todo empeora cómicamente. Squash and stretch."},
  {"stepKey": "punchline", "label": "Punchline final", "recommendedPresetIds": ["impact", "comedic", "close"], "shotType": "keyframe", "notes": "El remate visual. Expresión final exagerada."}
]');

-- 6. Realistic Cinematic: Contained Scene
INSERT INTO public.short_templates (style_id, name, description, pacing, duration_range, steps) VALUES
('realistic', 'Escena Contenida Realista', 'Estructura cinematográfica realista: atmósfera, tensión contenida, y revelación.', 'slow', '5-10 min',
'[
  {"stepKey": "atmosphere", "label": "Atmósfera del lugar", "recommendedPresetIds": ["establishing", "cinematic", "atmospheric"], "shotType": "location", "notes": "Plano de ubicación. Iluminación naturalista."},
  {"stepKey": "character_context", "label": "Personaje en contexto", "recommendedPresetIds": ["character_focus", "medium", "naturalistic"], "shotType": "character", "notes": "El personaje en su entorno. Comportamiento creíble."},
  {"stepKey": "tension_build", "label": "Tensión creciente", "recommendedPresetIds": ["detail", "close", "subtle"], "shotType": "keyframe", "notes": "Detalles que construyen tensión. Miradas, objetos."},
  {"stepKey": "confrontation", "label": "Confrontación o revelación", "recommendedPresetIds": ["dramatic", "medium", "over_shoulder"], "shotType": "keyframe", "notes": "El momento de verdad. Diálogo o descubrimiento."},
  {"stepKey": "resolution", "label": "Resolución contenida", "recommendedPresetIds": ["establishing", "wide", "atmospheric"], "shotType": "keyframe", "notes": "Final abierto o cerrado. Regreso al espacio."}
]');