-- Eliminar constraint antiguo
ALTER TABLE project_outlines 
DROP CONSTRAINT IF EXISTS project_outlines_status_check;

-- Crear constraint actualizado con 'stalled'
ALTER TABLE project_outlines 
ADD CONSTRAINT project_outlines_status_check 
CHECK (status = ANY (ARRAY[
  'idle', 'queued', 'generating', 'completed', 'draft', 
  'approved', 'failed', 'timeout', 'error', 'stalled'
]));

-- Recuperar el outline actual (marcarlo como failed para que sea resumible)
UPDATE project_outlines 
SET status = 'failed', 
    error_code = 'ZOMBIE_TIMEOUT',
    error_detail = 'Detectado por watchdog: runtime shutdown durante ACT I. Scaffold completado, listo para resume.'
WHERE id = 'b4ec636e-2b74-4943-95b8-0033983c2a36'
AND status = 'generating';