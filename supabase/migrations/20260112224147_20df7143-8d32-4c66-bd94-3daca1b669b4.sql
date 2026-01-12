-- Añadir columnas para sistema de heartbeat y estados robustos
ALTER TABLE project_outlines 
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS substage text DEFAULT null,
  ADD COLUMN IF NOT EXISTS outline_parts jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qc_issues text[] DEFAULT null;

-- Comentarios para documentación
COMMENT ON COLUMN project_outlines.heartbeat_at IS 'Actualizado cada 10-15s durante procesamiento para detección de stuck';
COMMENT ON COLUMN project_outlines.substage IS 'Substep actual: arc|episodes_1|episodes_2|merge';
COMMENT ON COLUMN project_outlines.outline_parts IS 'Partes generadas para fan-out/fan-in y resumabilidad';
COMMENT ON COLUMN project_outlines.qc_issues IS 'Lista de problemas detectados por QC automático';