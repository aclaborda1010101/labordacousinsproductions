-- P0.5: Telemetry columns for generation_blocks
ALTER TABLE public.generation_blocks ADD COLUMN IF NOT EXISTS output_tokens_est INTEGER;
ALTER TABLE public.generation_blocks ADD COLUMN IF NOT EXISTS latency_ms INTEGER;
ALTER TABLE public.generation_blocks ADD COLUMN IF NOT EXISTS qa_flags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.generation_blocks ADD COLUMN IF NOT EXISTS drift_flags JSONB DEFAULT '[]'::jsonb;

-- P0.5: Canon Lock columns for canon_packs  
ALTER TABLE public.canon_packs ADD COLUMN IF NOT EXISTS canon_hash TEXT;
ALTER TABLE public.canon_packs ADD COLUMN IF NOT EXISTS locked_fields JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.canon_packs ADD COLUMN IF NOT EXISTS invariants_by_character JSONB DEFAULT '{}'::jsonb;

-- Indexes for telemetry analysis
CREATE INDEX IF NOT EXISTS idx_gen_blocks_telemetry ON public.generation_blocks(model_used, latency_ms) WHERE status = 'done';
CREATE INDEX IF NOT EXISTS idx_gen_blocks_drift ON public.generation_blocks(drift_warnings) WHERE drift_warnings > 0;
CREATE INDEX IF NOT EXISTS idx_canon_packs_hash ON public.canon_packs(canon_hash) WHERE canon_hash IS NOT NULL;