-- Añadir campos de QC de identidad a storyboard_panels
ALTER TABLE storyboard_panels 
ADD COLUMN IF NOT EXISTS identity_qc JSONB DEFAULT '{}';

ALTER TABLE storyboard_panels 
ADD COLUMN IF NOT EXISTS regen_count INTEGER DEFAULT 0;

-- Comentario de estructura esperada para identity_qc:
-- {
--   "characters": {
--     "char_uuid": {
--       "identity_score": 0.85,
--       "issues": ["FACE_DRIFT", "HAIR_DRIFT"],
--       "status": "pass" | "fail"
--     }
--   },
--   "overall_score": 0.85,
--   "needs_regen": false,
--   "verified_at": "2024-01-14T..."
-- }

-- Index para encontrar paneles que necesitan regeneración
CREATE INDEX IF NOT EXISTS idx_storyboard_panels_regen 
ON storyboard_panels((identity_qc->>'needs_regen')) 
WHERE identity_qc->>'needs_regen' = 'true';