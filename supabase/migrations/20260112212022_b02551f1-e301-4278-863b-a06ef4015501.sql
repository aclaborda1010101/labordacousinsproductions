-- Generation Jobs table for idempotency and caching
CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  chunk_id TEXT,
  job_type TEXT NOT NULL,
  hash_input TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  result_json JSONB,
  attempts INTEGER DEFAULT 0,
  error_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(hash_input)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_generation_jobs_hash ON public.generation_jobs(hash_input);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_job_id ON public.generation_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_generation_jobs_status ON public.generation_jobs(status);

-- Enable RLS
ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role full access" ON public.generation_jobs
  FOR ALL USING (true) WITH CHECK (true);