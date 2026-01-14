-- Añadir columna frame_config a shots
ALTER TABLE public.shots
  ADD COLUMN IF NOT EXISTS frame_config JSONB;

-- Documentar estructura esperada
COMMENT ON COLUMN public.shots.frame_config IS 
  'Frame configuration: { size, composition_rule, headroom, look_room, aspect_ratio, safe_areas }';