
-- Editorial Sources System for AI Engine Control

-- Central Editorial Source (universal principles)
CREATE TABLE public.editorial_source_central (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL, -- 'narrative', 'quality', 'coherence', 'style', 'safety'
  rule_key TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  description TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50, -- 1-100, higher = more important
  is_active BOOLEAN NOT NULL DEFAULT true,
  enforcement_level TEXT NOT NULL DEFAULT 'required', -- 'required', 'recommended', 'optional'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Engine-specific Editorial Sources
CREATE TABLE public.editorial_source_engines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  engine_id TEXT NOT NULL, -- 'nano-banana', 'flux-ultra', 'kling-v2', 'veo', 'chatgpt', 'claude', 'gemini'
  engine_display_name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'prompt_style', 'common_errors', 'quality_control', 'limitations'
  rule_key TEXT NOT NULL,
  rule_name TEXT NOT NULL,
  description TEXT NOT NULL,
  prompt_modification TEXT, -- How to modify prompts for this engine
  negative_patterns TEXT[], -- Patterns to avoid/add to negative prompts
  validation_checks JSONB, -- Checks to run on outputs
  priority INTEGER NOT NULL DEFAULT 50,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(engine_id, rule_key)
);

-- Project-level editorial overrides
CREATE TABLE public.project_editorial_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  central_rule_overrides JSONB DEFAULT '{}', -- {rule_key: {active: bool, priority: int}}
  engine_rule_overrides JSONB DEFAULT '{}', -- {engine_id: {rule_key: {active: bool}}}
  custom_central_rules JSONB DEFAULT '[]', -- Project-specific central rules
  custom_engine_rules JSONB DEFAULT '{}', -- {engine_id: [custom rules]}
  preferred_engines JSONB DEFAULT '{}', -- {purpose: engine_id}
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

-- Editorial decision log (for learning and telemetry)
CREATE TABLE public.editorial_decisions_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  engine_id TEXT NOT NULL,
  decision_type TEXT NOT NULL, -- 'prompt_modified', 'output_rejected', 'warning_issued', 'rule_applied'
  original_intent TEXT,
  modified_prompt TEXT,
  rules_applied TEXT[],
  outcome TEXT, -- 'accepted', 'rejected', 'warning_shown'
  user_action TEXT, -- 'accepted', 'overridden', 'modified'
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.editorial_source_central ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_source_engines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_editorial_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_decisions_log ENABLE ROW LEVEL SECURITY;

-- Central sources are readable by all authenticated users
CREATE POLICY "Central editorial sources are readable by authenticated users"
ON public.editorial_source_central FOR SELECT
TO authenticated USING (true);

-- Engine sources are readable by all authenticated users
CREATE POLICY "Engine editorial sources are readable by authenticated users"
ON public.editorial_source_engines FOR SELECT
TO authenticated USING (true);

-- Project config accessible by project members
CREATE POLICY "Project editorial config accessible by members"
ON public.project_editorial_config FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = project_editorial_config.project_id
    AND pm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_editorial_config.project_id
    AND p.owner_id = auth.uid()
  )
);

-- Decision log accessible by project members
CREATE POLICY "Editorial decisions log accessible by members"
ON public.editorial_decisions_log FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = editorial_decisions_log.project_id
    AND pm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = editorial_decisions_log.project_id
    AND p.owner_id = auth.uid()
  )
);

-- Indexes
CREATE INDEX idx_editorial_central_category ON public.editorial_source_central(category);
CREATE INDEX idx_editorial_central_active ON public.editorial_source_central(is_active);
CREATE INDEX idx_editorial_engines_engine ON public.editorial_source_engines(engine_id);
CREATE INDEX idx_editorial_engines_active ON public.editorial_source_engines(is_active);
CREATE INDEX idx_project_editorial_project ON public.project_editorial_config(project_id);
CREATE INDEX idx_editorial_decisions_project ON public.editorial_decisions_log(project_id);
CREATE INDEX idx_editorial_decisions_engine ON public.editorial_decisions_log(engine_id);

-- Triggers for updated_at
CREATE TRIGGER update_editorial_central_updated_at
BEFORE UPDATE ON public.editorial_source_central
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_editorial_engines_updated_at
BEFORE UPDATE ON public.editorial_source_engines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_project_editorial_updated_at
BEFORE UPDATE ON public.project_editorial_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed Central Editorial Rules
INSERT INTO public.editorial_source_central (category, rule_key, rule_name, description, priority, enforcement_level) VALUES
-- Narrative Coherence
('narrative', 'character_identity_lock', 'Bloqueo de Identidad de Personaje', 'Los rasgos físicos definidos en Visual DNA nunca pueden cambiar sin aprobación explícita', 100, 'required'),
('narrative', 'location_consistency', 'Consistencia de Locación', 'Las características arquitectónicas y ambientales deben mantenerse entre tomas', 95, 'required'),
('narrative', 'temporal_continuity', 'Continuidad Temporal', 'La iluminación, clima y hora del día deben ser coherentes dentro de cada escena', 90, 'required'),
('narrative', 'prop_persistence', 'Persistencia de Props', 'Los objetos presentes en una escena deben mantener posición y estado coherentes', 85, 'required'),
-- Quality Standards
('quality', 'cinematic_framing', 'Encuadre Cinematográfico', 'Todas las composiciones deben seguir principios de cinematografía profesional', 80, 'recommended'),
('quality', 'lighting_realism', 'Realismo de Iluminación', 'La iluminación debe ser físicamente plausible y narrativamente coherente', 75, 'recommended'),
('quality', 'detail_preservation', 'Preservación de Detalle', 'Los elementos importantes del frame deben mantener claridad y definición', 70, 'recommended'),
-- Style Control
('style', 'tone_alignment', 'Alineación de Tono', 'El estilo visual debe coincidir con el tono narrativo definido en la Biblia', 85, 'required'),
('style', 'era_accuracy', 'Precisión de Época', 'Elementos visuales deben ser apropiados para la época del proyecto', 80, 'required'),
-- Safety
('safety', 'content_boundaries', 'Límites de Contenido', 'Respetar restricciones de contenido definidas por el proyecto', 100, 'required'),
('safety', 'legal_compliance', 'Cumplimiento Legal', 'Evitar marcas, rostros reales sin permiso, contenido protegido', 100, 'required');

-- Seed Engine-Specific Rules
INSERT INTO public.editorial_source_engines (engine_id, engine_display_name, category, rule_key, rule_name, description, prompt_modification, negative_patterns, priority) VALUES
-- Nano Banana Pro
('nano-banana', 'Nano Banana Pro', 'prompt_style', 'nano_subject_first', 'Sujeto Primero', 'Iniciar prompts con descripción clara del sujeto principal', 'Mover descripción del personaje/sujeto al inicio del prompt', NULL, 90),
('nano-banana', 'Nano Banana Pro', 'prompt_style', 'nano_technical_suffix', 'Sufijo Técnico', 'Añadir especificaciones técnicas de fotografía al final', 'Añadir: "professional photography, 8K, detailed"', NULL, 80),
('nano-banana', 'Nano Banana Pro', 'common_errors', 'nano_avoid_complexity', 'Evitar Complejidad Excesiva', 'Limitar elementos simultáneos para mantener coherencia', NULL, ARRAY['multiple subjects', 'crowded scene', 'too many details'], 85),
('nano-banana', 'Nano Banana Pro', 'quality_control', 'nano_face_check', 'Control de Rostro', 'Verificar que rostros generados mantengan proporción y naturalidad', NULL, ARRAY['deformed face', 'asymmetric eyes', 'distorted features'], 95),

-- FLUX Pro Ultra
('flux-ultra', 'FLUX Pro Ultra', 'prompt_style', 'flux_descriptive', 'Estilo Descriptivo', 'FLUX responde mejor a descripciones detalladas y atmosféricas', 'Expandir descripciones con adjetivos sensoriales y atmosféricos', NULL, 85),
('flux-ultra', 'FLUX Pro Ultra', 'prompt_style', 'flux_lighting_explicit', 'Iluminación Explícita', 'Especificar siempre tipo y dirección de iluminación', 'Añadir descripción de iluminación si no existe', NULL, 90),
('flux-ultra', 'FLUX Pro Ultra', 'limitations', 'flux_text_avoid', 'Evitar Texto', 'FLUX tiene dificultades con texto en imágenes', NULL, ARRAY['text', 'letters', 'words', 'signs with writing'], 95),
('flux-ultra', 'FLUX Pro Ultra', 'quality_control', 'flux_architecture', 'Control Arquitectónico', 'Verificar coherencia de estructuras y perspectiva', NULL, ARRAY['impossible architecture', 'broken perspective', 'floating elements'], 80),

-- Kling v2
('kling-v2', 'Kling v2', 'prompt_style', 'kling_action_focus', 'Foco en Acción', 'Kling requiere descripciones claras de movimiento y acción', 'Enfatizar verbos de acción y dirección de movimiento', NULL, 90),
('kling-v2', 'Kling v2', 'prompt_style', 'kling_keyframe_anchor', 'Anclaje a Keyframe', 'Usar keyframe aprobado como ancla visual para v2', 'Referenciar elementos específicos del keyframe en el prompt', NULL, 95),
('kling-v2', 'Kling v2', 'common_errors', 'kling_motion_limit', 'Límite de Movimiento', 'Evitar movimientos de cámara complejos simultáneos', NULL, ARRAY['rapid camera movement', 'multiple pans', 'complex tracking'], 85),
('kling-v2', 'Kling v2', 'limitations', 'kling_duration_aware', 'Conciencia de Duración', 'Ajustar complejidad de acción a duración del clip', 'Para clips <5s simplificar acción', NULL, 80),

-- Veo
('veo', 'Google Veo', 'prompt_style', 'veo_cinematic', 'Estilo Cinematográfico', 'Veo responde bien a terminología cinematográfica profesional', 'Usar términos de cine: "dolly shot", "rack focus", "establishing shot"', NULL, 85),
('veo', 'Google Veo', 'prompt_style', 'veo_atmosphere', 'Énfasis Atmosférico', 'Incluir descripción de ambiente y mood', 'Añadir descriptores de atmósfera y emoción', NULL, 80),
('veo', 'Google Veo', 'common_errors', 'veo_face_stability', 'Estabilidad Facial', 'Veo puede tener drift en rostros durante movimiento', NULL, ARRAY['face morphing', 'identity drift'], 90),
('veo', 'Google Veo', 'limitations', 'veo_text_handling', 'Manejo de Texto', 'Evitar texto visible en escenas', NULL, ARRAY['readable text', 'signs', 'subtitles'], 85),

-- ChatGPT/GPT-4o
('chatgpt', 'ChatGPT', 'prompt_style', 'gpt_structured', 'Estructura Clara', 'GPT funciona mejor con instrucciones estructuradas', 'Organizar prompts en secciones claras', NULL, 85),
('chatgpt', 'ChatGPT', 'prompt_style', 'gpt_context_rich', 'Contexto Rico', 'Proporcionar contexto narrativo completo', 'Incluir información de escena, personaje y objetivo', NULL, 80),
('chatgpt', 'ChatGPT', 'common_errors', 'gpt_verbosity', 'Control de Verbosidad', 'Indicar longitud esperada para evitar respuestas excesivas', 'Añadir límites de extensión cuando sea relevante', NULL, 70),

-- Claude
('claude', 'Claude', 'prompt_style', 'claude_narrative', 'Enfoque Narrativo', 'Claude excele en comprensión narrativa profunda', 'Enfatizar intención dramática y arco narrativo', NULL, 90),
('claude', 'Claude', 'prompt_style', 'claude_nuance', 'Captura de Matices', 'Incluir subtexto y capas emocionales', 'Añadir contexto emocional y motivacional', NULL, 85),
('claude', 'Claude', 'quality_control', 'claude_consistency', 'Control de Consistencia', 'Verificar coherencia con establecido previamente', 'Referenciar elementos canónicos de la Biblia', NULL, 80);
