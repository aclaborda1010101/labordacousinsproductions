-- =====================================================
-- KEYFRAMES + MOTION CONTINUITY (Fase 1 + Fase 2)
-- =====================================================

-- Fase 1: Añadir pose_data a keyframes
ALTER TABLE keyframes ADD COLUMN IF NOT EXISTS 
  pose_data JSONB DEFAULT '{}';

-- Añadir frame_type para distinguir inicio/medio/final
ALTER TABLE keyframes ADD COLUMN IF NOT EXISTS 
  frame_type TEXT DEFAULT 'mid';

-- Comentario explicativo de la estructura
COMMENT ON COLUMN keyframes.pose_data IS 'Per-character pose data: {charId: {position: {x_m, y_m, screen_pos}, orientation: {facing_deg, gaze_target}, scale: {relative, in_frame_pct}, body_state: {posture, gesture}}}';

-- =====================================================
-- Fase 2: Tabla de transiciones entre planos
-- =====================================================

CREATE TABLE IF NOT EXISTS shot_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_shot_id UUID REFERENCES shots(id) ON DELETE CASCADE,
  to_shot_id UUID NOT NULL REFERENCES shots(id) ON DELETE CASCADE,
  
  -- Locks de continuidad
  exit_pose JSONB NOT NULL DEFAULT '{}',
  entry_pose JSONB NOT NULL DEFAULT '{}',
  
  -- Validación automática
  pose_match_score FLOAT DEFAULT 0,
  screen_direction_lock TEXT DEFAULT 'preserve',
  relative_scale_lock FLOAT DEFAULT 1.0,
  
  -- Estado de validación
  validated_at TIMESTAMP WITH TIME ZONE,
  validation_status TEXT DEFAULT 'pending',
  override_reason TEXT,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraint: no puede haber duplicados de la misma transición
  UNIQUE(from_shot_id, to_shot_id)
);

-- Índices para queries rápidas
CREATE INDEX IF NOT EXISTS idx_shot_transitions_project ON shot_transitions(project_id);
CREATE INDEX IF NOT EXISTS idx_shot_transitions_to ON shot_transitions(to_shot_id);
CREATE INDEX IF NOT EXISTS idx_shot_transitions_from ON shot_transitions(from_shot_id);
CREATE INDEX IF NOT EXISTS idx_shot_transitions_status ON shot_transitions(validation_status);

-- RLS para shot_transitions
ALTER TABLE shot_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shot_transitions for their projects"
  ON shot_transitions FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert shot_transitions for their projects"
  ON shot_transitions FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update shot_transitions for their projects"
  ON shot_transitions FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete shot_transitions for their projects"
  ON shot_transitions FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_shot_transitions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_shot_transitions_timestamp ON shot_transitions;
CREATE TRIGGER update_shot_transitions_timestamp
  BEFORE UPDATE ON shot_transitions
  FOR EACH ROW
  EXECUTE FUNCTION update_shot_transitions_updated_at();

-- =====================================================
-- Añadir continuity_lock formalizado a shots
-- =====================================================

ALTER TABLE shots ADD COLUMN IF NOT EXISTS 
  continuity_lock JSONB DEFAULT '{}';

COMMENT ON COLUMN shots.continuity_lock IS 'Formal continuity constraints: {entry_pose, exit_pose, screen_direction, scale_lock, validated}';