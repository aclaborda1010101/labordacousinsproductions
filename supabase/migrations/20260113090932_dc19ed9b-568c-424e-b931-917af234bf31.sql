-- ============================================================================
-- ZOMBIE OUTLINE RECOVERY - V11.1
-- Marks stalled outlines as 'error' with proper error_code for retry
-- ============================================================================

-- 1. Mark any 'generating' outlines with stale heartbeat as error
UPDATE project_outlines
SET
  status = 'error',
  stage = 'done',
  quality = 'error',
  error_code = 'ZOMBIE_TIMEOUT',
  error_detail = 'Recuperado: heartbeat stale mientras status=generating',
  completed_at = now()
WHERE status = 'generating'
  AND heartbeat_at < now() - interval '5 minutes';

-- 2. Clean up any 'stalled' status that may have been incorrectly set
UPDATE project_outlines
SET 
  status = 'error',
  error_code = 'ZOMBIE_TIMEOUT',
  error_detail = 'Migrado desde status stalled inválido'
WHERE status = 'stalled';

-- 3. Also mark 'queued' outlines that have been waiting too long (15+ min)
UPDATE project_outlines
SET
  status = 'error',
  stage = 'done',
  quality = 'error',
  error_code = 'QUEUE_TIMEOUT',
  error_detail = 'Recuperado: en cola por más de 15 minutos sin iniciar',
  completed_at = now()
WHERE status = 'queued'
  AND created_at < now() - interval '15 minutes';