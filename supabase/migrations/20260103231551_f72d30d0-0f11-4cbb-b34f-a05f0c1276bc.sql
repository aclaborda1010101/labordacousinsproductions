
-- =============================================
-- MVP SISTEMA EDITORIAL JERÁRQUICO - MODELO DE DATOS
-- =============================================

-- Enum para fases del proyecto
CREATE TYPE public.editorial_project_phase AS ENUM ('exploracion', 'produccion');

-- Enum para tipos de regla editorial
CREATE TYPE public.editorial_rule_type AS ENUM ('A', 'B', 'D');

-- Enum para severidad de regla
CREATE TYPE public.editorial_rule_severity AS ENUM ('1', '2', '3', '4', '5');

-- Enum para método de validación
CREATE TYPE public.editorial_validation_method AS ENUM (
  'prompt_check', 
  'output_text_check', 
  'output_vision_check', 
  'bible_contradiction_check',
  'none'
);

-- Enum para acción en fallo
CREATE TYPE public.editorial_action_on_fail AS ENUM (
  'reject_regenerate', 
  'reject_explain', 
  'warn', 
  'suggest'
);

-- Enum para veredicto de generación
CREATE TYPE public.generation_verdict AS ENUM ('approved', 'warn', 'regenerate');

-- Enum para tipo de evento telemetría
CREATE TYPE public.telemetry_event_type AS ENUM ('accept', 'reject', 'regenerate', 'edit');

-- =============================================
-- TABLA: editorial_projects (proyectos editoriales MVP)
-- =============================================
CREATE TABLE public.editorial_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phase public.editorial_project_phase NOT NULL DEFAULT 'exploracion',
  owner_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- TABLA: asset_characters (personajes del proyecto)
-- =============================================
CREATE TABLE public.asset_characters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.editorial_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  traits_text TEXT NOT NULL,
  reference_image_url TEXT,
  fixed_traits TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- TABLA: asset_locations (locaciones del proyecto)
-- =============================================
CREATE TABLE public.asset_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.editorial_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  traits_text TEXT NOT NULL,
  reference_image_url TEXT,
  fixed_elements TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- TABLA: project_bibles (biblia del proyecto - tono/época/rating)
-- =============================================
CREATE TABLE public.project_bibles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.editorial_projects(id) ON DELETE CASCADE UNIQUE,
  tone TEXT, -- ej: "oscuro", "esperanzador", "satírico"
  period TEXT, -- ej: "contemporáneo", "medieval", "futurista"
  rating TEXT, -- ej: "G", "PG", "PG-13", "R"
  facts JSONB DEFAULT '[]', -- Array de hechos canónicos del proyecto
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- TABLA: editorial_rules_config (reglas editoriales configurables)
-- =============================================
CREATE TABLE public.editorial_rules_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_code TEXT NOT NULL UNIQUE, -- A-001, B-002, D-003
  rule_type public.editorial_rule_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  applies_to TEXT[] DEFAULT '{}', -- ['character', 'location', 'scene', 'all']
  scope TEXT[] DEFAULT '{}', -- ['prompt', 'output_text', 'output_image', 'output_video']
  severity public.editorial_rule_severity NOT NULL DEFAULT '3',
  active_default BOOLEAN NOT NULL DEFAULT true,
  toggleable BOOLEAN NOT NULL DEFAULT false,
  disable_reasons TEXT[] DEFAULT '{}', -- razones válidas para desactivar
  validation_method public.editorial_validation_method NOT NULL DEFAULT 'none',
  must_include TEXT[] DEFAULT '{}',
  must_avoid TEXT[] DEFAULT '{}',
  negative_prompt_snippets TEXT[] DEFAULT '{}',
  action_on_fail public.editorial_action_on_fail NOT NULL DEFAULT 'warn',
  action_on_fail_production public.editorial_action_on_fail, -- acción más estricta en producción
  user_message_template TEXT NOT NULL,
  applies_in_exploration BOOLEAN NOT NULL DEFAULT true,
  applies_in_production BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- TABLA: project_rule_overrides (overrides de reglas por proyecto)
-- =============================================
CREATE TABLE public.project_rule_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.editorial_projects(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.editorial_rules_config(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL,
  disable_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id, rule_id)
);

-- =============================================
-- TABLA: generation_runs (ejecuciones de generación)
-- =============================================
CREATE TABLE public.generation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.editorial_projects(id) ON DELETE CASCADE,
  engine TEXT NOT NULL, -- 'nano-banana', 'flux-ultra', etc.
  input_intent TEXT NOT NULL, -- intención original del usuario
  context TEXT, -- contexto narrativo breve
  used_asset_ids UUID[] DEFAULT '{}', -- IDs de assets usados
  composed_prompt TEXT NOT NULL, -- prompt final construido
  negative_prompt TEXT, -- prompt negativo
  output_url TEXT, -- URL del resultado (imagen/video)
  output_text TEXT, -- texto generado (si aplica)
  verdict public.generation_verdict NOT NULL DEFAULT 'approved',
  triggered_rules TEXT[] DEFAULT '{}', -- códigos de reglas activadas
  warnings JSONB DEFAULT '[]', -- [{rule_code, message}]
  suggestions JSONB DEFAULT '[]', -- [{rule_code, message}]
  rule_plan JSONB, -- plan de reglas aplicado
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- TABLA: telemetry_events (eventos de telemetría)
-- =============================================
CREATE TABLE public.telemetry_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.editorial_projects(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.generation_runs(id) ON DELETE SET NULL,
  event_type public.telemetry_event_type NOT NULL,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- ENABLE RLS
-- =============================================
ALTER TABLE public.editorial_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_bibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_rules_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_rule_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES
-- =============================================

-- Editorial Projects
CREATE POLICY "Users can manage their own editorial projects"
ON public.editorial_projects FOR ALL
USING (owner_id = auth.uid());

-- Asset Characters
CREATE POLICY "Users can manage characters in their projects"
ON public.asset_characters FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.editorial_projects p
    WHERE p.id = asset_characters.project_id AND p.owner_id = auth.uid()
  )
);

-- Asset Locations
CREATE POLICY "Users can manage locations in their projects"
ON public.asset_locations FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.editorial_projects p
    WHERE p.id = asset_locations.project_id AND p.owner_id = auth.uid()
  )
);

-- Project Bibles
CREATE POLICY "Users can manage bibles in their projects"
ON public.project_bibles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.editorial_projects p
    WHERE p.id = project_bibles.project_id AND p.owner_id = auth.uid()
  )
);

-- Editorial Rules Config (readable by all authenticated)
CREATE POLICY "Editorial rules are readable by authenticated users"
ON public.editorial_rules_config FOR SELECT
TO authenticated USING (true);

-- Project Rule Overrides
CREATE POLICY "Users can manage rule overrides in their projects"
ON public.project_rule_overrides FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.editorial_projects p
    WHERE p.id = project_rule_overrides.project_id AND p.owner_id = auth.uid()
  )
);

-- Generation Runs
CREATE POLICY "Users can manage generation runs in their projects"
ON public.generation_runs FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.editorial_projects p
    WHERE p.id = generation_runs.project_id AND p.owner_id = auth.uid()
  )
);

-- Telemetry Events
CREATE POLICY "Users can manage telemetry in their projects"
ON public.telemetry_events FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.editorial_projects p
    WHERE p.id = telemetry_events.project_id AND p.owner_id = auth.uid()
  )
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_asset_characters_project ON public.asset_characters(project_id);
CREATE INDEX idx_asset_locations_project ON public.asset_locations(project_id);
CREATE INDEX idx_project_bibles_project ON public.project_bibles(project_id);
CREATE INDEX idx_project_rule_overrides_project ON public.project_rule_overrides(project_id);
CREATE INDEX idx_generation_runs_project ON public.generation_runs(project_id);
CREATE INDEX idx_generation_runs_verdict ON public.generation_runs(verdict);
CREATE INDEX idx_telemetry_events_project ON public.telemetry_events(project_id);
CREATE INDEX idx_telemetry_events_run ON public.telemetry_events(run_id);
CREATE INDEX idx_editorial_rules_type ON public.editorial_rules_config(rule_type);

-- =============================================
-- TRIGGERS
-- =============================================
CREATE TRIGGER update_editorial_projects_updated_at
BEFORE UPDATE ON public.editorial_projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_asset_characters_updated_at
BEFORE UPDATE ON public.asset_characters
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_asset_locations_updated_at
BEFORE UPDATE ON public.asset_locations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_bibles_updated_at
BEFORE UPDATE ON public.project_bibles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- SEED: REGLAS EDITORIALES MVP
-- =============================================

-- REGLAS TIPO A (Bloqueantes - siempre activas)
INSERT INTO public.editorial_rules_config (
  rule_code, rule_type, name, description, applies_to, scope, severity,
  active_default, toggleable, validation_method, must_include, must_avoid,
  negative_prompt_snippets, action_on_fail, user_message_template,
  applies_in_exploration, applies_in_production
) VALUES
-- A-001: Identidad de Personaje
('A-001', 'A', 'Identidad de Personaje Bloqueada', 
 'Los rasgos físicos definidos como fijos nunca pueden modificarse sin aprobación explícita',
 ARRAY['character'], ARRAY['prompt', 'output_text'], '5',
 true, false, 'prompt_check', ARRAY[]::text[], ARRAY['change appearance', 'different look', 'altered face'],
 ARRAY['changing identity', 'morphing face', 'different person'],
 'reject_regenerate',
 'Para mantener la coherencia visual, los rasgos fijos del personaje deben preservarse. Considera ajustar la descripción respetando: {fixed_traits}',
 true, true),

-- A-002: Límites de Contenido
('A-002', 'A', 'Límites de Contenido', 
 'El contenido debe respetar la clasificación definida en la Biblia del proyecto',
 ARRAY['all'], ARRAY['prompt', 'output_text', 'output_image'], '5',
 true, false, 'prompt_check', ARRAY[]::text[], ARRAY['explicit', 'gore', 'violence extreme', 'nsfw'],
 ARRAY['explicit content', 'gore', 'extreme violence', 'nsfw', 'inappropriate'],
 'reject_explain',
 'El contenido solicitado excede la clasificación del proyecto ({rating}). Considera reformular manteniendo el tono apropiado.',
 true, true),

-- A-003: Coherencia Temporal
('A-003', 'A', 'Coherencia Temporal', 
 'Los elementos visuales deben ser apropiados para la época definida',
 ARRAY['all'], ARRAY['prompt'], '4',
 true, false, 'prompt_check', ARRAY[]::text[], ARRAY[]::text[],
 ARRAY['anachronistic', 'wrong era', 'modern in historical', 'historical in modern'],
 'reject_regenerate',
 'Se detectaron elementos que podrían no corresponder a la época del proyecto ({period}). Considera revisar: {detected_anachronisms}',
 true, true),

-- A-004: Anatomía Humana (preventivo en MVP)
('A-004', 'A', 'Anatomía Humana Plausible', 
 'Prevenir deformaciones anatómicas mediante prompts negativos',
 ARRAY['character'], ARRAY['prompt', 'output_image'], '4',
 true, false, 'none', ARRAY[]::text[], ARRAY[]::text[],
 ARRAY['deformed', 'extra limbs', 'missing limbs', 'bad anatomy', 'wrong proportions', 'extra fingers', 'fused fingers', 'mutated hands', 'malformed face', 'asymmetric eyes', 'crossed eyes'],
 'warn',
 'Se aplicaron filtros preventivos de anatomía. Si el resultado presenta anomalías, considera regenerar o proporcionar más contexto anatómico.',
 true, true),

-- A-005: Texto Legible (preventivo en MVP)
('A-005', 'A', 'Prevención de Texto Ilegible', 
 'Prevenir texto generado defectuoso mediante prompts negativos',
 ARRAY['all'], ARRAY['prompt', 'output_image'], '3',
 true, false, 'none', ARRAY[]::text[], ARRAY[]::text[],
 ARRAY['text', 'words', 'letters', 'writing', 'captions', 'watermark', 'signature', 'logo'],
 'warn',
 'Se evitó incluir texto en la generación para prevenir artefactos. Si necesitas texto visible, considera añadirlo en post-producción.',
 true, true);

-- REGLAS TIPO B (Advertencias - toggleables)
INSERT INTO public.editorial_rules_config (
  rule_code, rule_type, name, description, applies_to, scope, severity,
  active_default, toggleable, disable_reasons, validation_method,
  must_include, must_avoid, negative_prompt_snippets,
  action_on_fail, action_on_fail_production, user_message_template,
  applies_in_exploration, applies_in_production
) VALUES
-- B-001: Consistencia de Iluminación
('B-001', 'B', 'Consistencia de Iluminación', 
 'La iluminación debe ser coherente dentro de cada escena',
 ARRAY['all'], ARRAY['prompt'], '3',
 true, true, ARRAY['Escena nocturna intencional', 'Efecto artístico deliberado', 'Transición temporal'],
 'prompt_check', ARRAY[]::text[], ARRAY[]::text[],
 ARRAY['inconsistent lighting', 'mixed light sources'],
 'warn', 'reject_regenerate',
 'La iluminación descrita podría generar inconsistencias. Para mayor coherencia, considera especificar: hora del día, fuente de luz principal, ambiente lumínico.',
 true, true),

-- B-002: Continuidad de Vestuario
('B-002', 'B', 'Continuidad de Vestuario', 
 'El vestuario de personajes debe ser consistente salvo cambios narrativos explícitos',
 ARRAY['character'], ARRAY['prompt'], '3',
 true, true, ARRAY['Cambio de vestuario narrativo', 'Elipsis temporal', 'Escena de vestuario'],
 'prompt_check', ARRAY[]::text[], ARRAY[]::text[],
 ARRAY['wrong outfit', 'different clothes unexplained'],
 'warn', 'warn',
 'El vestuario descrito difiere del establecido para este personaje. Si es intencional, considera indicar el motivo narrativo.',
 true, true),

-- B-003: Persistencia de Props
('B-003', 'B', 'Persistencia de Objetos', 
 'Los objetos importantes deben mantener posición y estado coherentes',
 ARRAY['location', 'scene'], ARRAY['prompt'], '2',
 true, true, ARRAY['Acción narrativa de movimiento', 'Elipsis temporal'],
 'prompt_check', ARRAY[]::text[], ARRAY[]::text[],
 ARRAY['disappearing objects', 'teleporting items'],
 'warn', 'warn',
 'Algunos objetos de la escena podrían aparecer en posiciones inconsistentes. Considera especificar su ubicación si son relevantes.',
 true, true),

-- B-004: Encuadre Cinematográfico
('B-004', 'B', 'Encuadre Profesional', 
 'Sugerir principios de composición cinematográfica',
 ARRAY['all'], ARRAY['prompt'], '2',
 true, true, ARRAY['Estilo documental intencionado', 'Found footage', 'POV narrativo'],
 'none', ARRAY[]::text[], ARRAY[]::text[],
 ARRAY['amateur framing', 'bad composition', 'centered boring'],
 'suggest', 'warn',
 'Para un resultado más cinematográfico, considera especificar: tipo de plano, regla de tercios, profundidad de campo.',
 true, true),

-- B-005: Coherencia de Tono
('B-005', 'B', 'Alineación con Tono del Proyecto', 
 'El contenido debe alinearse con el tono definido en la Biblia',
 ARRAY['all'], ARRAY['prompt', 'output_text'], '3',
 true, true, ARRAY['Contraste narrativo intencional', 'Momento de alivio cómico', 'Subversión de género'],
 'bible_contradiction_check', ARRAY[]::text[], ARRAY[]::text[],
 ARRAY[]::text[],
 'warn', 'reject_regenerate',
 'El tono de la solicitud podría diferir del establecido para el proyecto ({tone}). Considera si el contraste es intencional.',
 true, true),

-- B-006: Hechos Canónicos
('B-006', 'B', 'Respeto a Hechos Canónicos', 
 'No contradecir hechos establecidos en la Biblia del proyecto',
 ARRAY['all'], ARRAY['output_text'], '4',
 true, true, ARRAY['Universo alternativo', 'Flashback/Flashforward', 'Narrador no confiable'],
 'bible_contradiction_check', ARRAY[]::text[], ARRAY[]::text[],
 ARRAY[]::text[],
 'warn', 'reject_regenerate',
 'Se detectó una posible contradicción con hechos establecidos: {contradiction}. Considera verificar la coherencia narrativa.',
 true, true);

-- REGLAS TIPO D (Sugerencias - contextuales)
INSERT INTO public.editorial_rules_config (
  rule_code, rule_type, name, description, applies_to, scope, severity,
  active_default, toggleable, validation_method,
  action_on_fail, user_message_template,
  applies_in_exploration, applies_in_production
) VALUES
-- D-001: Detalles de Escena
('D-001', 'D', 'Enriquecimiento de Escena', 
 'Sugerir añadir contexto ambiental para mayor inmersión',
 ARRAY['location', 'scene'], ARRAY['prompt'], '1',
 true, false, 'none',
 'suggest',
 'Para mayor inmersión, podrías considerar añadir: condiciones climáticas, sonidos ambientales, olores o texturas.',
 true, true),

-- D-002: Expresión Emocional
('D-002', 'D', 'Claridad Emocional', 
 'Sugerir especificar estado emocional de personajes',
 ARRAY['character'], ARRAY['prompt'], '1',
 true, false, 'none',
 'suggest',
 'Especificar la emoción del personaje puede mejorar la expresividad: considera indicar estado emocional, postura corporal o microexpresiones.',
 true, true),

-- D-003: Contexto Narrativo
('D-003', 'D', 'Profundidad Narrativa', 
 'Sugerir añadir contexto de la historia',
 ARRAY['all'], ARRAY['prompt'], '1',
 true, false, 'none',
 'suggest',
 'Añadir contexto de lo que acaba de ocurrir o está por ocurrir puede enriquecer la generación.',
 false, true),

-- D-004: Referencias Visuales
('D-004', 'D', 'Referencias de Estilo', 
 'Sugerir incluir referencias visuales o artísticas',
 ARRAY['all'], ARRAY['prompt'], '1',
 true, false, 'none',
 'suggest',
 'Incluir referencias de estilo visual (director, película, artista) puede ayudar a lograr el look deseado.',
 true, true),

-- D-005: Composición Avanzada
('D-005', 'D', 'Técnicas de Composición', 
 'Sugerir técnicas cinematográficas específicas',
 ARRAY['all'], ARRAY['prompt'], '1',
 true, false, 'none',
 'suggest',
 'Considera especificar: distancia focal, altura de cámara, ángulo holandés, o movimiento de cámara para mayor control visual.',
 false, true),

-- D-006: Paleta de Color
('D-006', 'D', 'Coherencia Cromática', 
 'Sugerir definir paleta de colores',
 ARRAY['all'], ARRAY['prompt'], '1',
 true, false, 'none',
 'suggest',
 'Definir una paleta de colores dominante puede mejorar la coherencia visual del proyecto.',
 true, true),

-- D-007: Textura y Material
('D-007', 'D', 'Especificación de Materiales', 
 'Sugerir describir texturas y materiales',
 ARRAY['location', 'character'], ARRAY['prompt'], '1',
 true, false, 'none',
 'suggest',
 'Describir texturas y materiales específicos (madera envejecida, metal oxidado, tela de lino) añade realismo.',
 true, true),

-- D-008: Momento del Día
('D-008', 'D', 'Precisión Temporal', 
 'Sugerir especificar momento exacto del día',
 ARRAY['location', 'scene'], ARRAY['prompt'], '1',
 true, false, 'none',
 'suggest',
 'Especificar el momento exacto (amanecer dorado, mediodía duro, hora azul) mejora la atmósfera lumínica.',
 true, true),

-- D-009: Escala y Proporción
('D-009', 'D', 'Referencias de Escala', 
 'Sugerir incluir elementos de referencia de escala',
 ARRAY['location'], ARRAY['prompt'], '1',
 true, false, 'none',
 'suggest',
 'Incluir elementos de referencia (personas, vehículos, objetos conocidos) ayuda a transmitir la escala del espacio.',
 false, true);
