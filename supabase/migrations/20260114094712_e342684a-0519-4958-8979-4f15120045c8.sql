-- Add QC fields to keyframes table for constraint validation
ALTER TABLE keyframes 
  ADD COLUMN IF NOT EXISTS constraint_qc JSONB,
  ADD COLUMN IF NOT EXISTS qc_status TEXT DEFAULT 'pending';

-- Index for QC status queries
CREATE INDEX IF NOT EXISTS idx_keyframes_qc_status ON keyframes(qc_status);

-- Add comments for documentation
COMMENT ON COLUMN keyframes.constraint_qc IS 
  'QC results: { constraint_score, violations: [{lock, status, notes}] }';
COMMENT ON COLUMN keyframes.qc_status IS 
  'QC status: pending, passed, identity_fail, constraint_fail, both_fail';