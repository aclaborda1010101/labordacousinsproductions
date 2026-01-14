-- Add identity fix metadata fields to keyframes for traceability
ALTER TABLE public.keyframes
  ADD COLUMN IF NOT EXISTS identity_fix_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS identity_fix_engine_model TEXT,
  ADD COLUMN IF NOT EXISTS identity_fix_latency_ms INTEGER;

COMMENT ON COLUMN public.keyframes.identity_fix_attempts IS 
  'Number of identity fix attempts for this keyframe';
COMMENT ON COLUMN public.keyframes.identity_fix_engine_model IS 
  'AI model used for identity fix (e.g., google/gemini-3-pro-image-preview)';
COMMENT ON COLUMN public.keyframes.identity_fix_latency_ms IS 
  'Time taken for identity fix pass in milliseconds';