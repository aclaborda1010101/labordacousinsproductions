-- V3.0 ENTERPRISE: Rate Limiting & Run Logging Tables
-- ====================================================

-- Rate limiting table for controlling expensive operations
CREATE TABLE IF NOT EXISTS public.generation_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL,
  function_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast rate limit queries
CREATE INDEX IF NOT EXISTS idx_rate_limits_project_time 
ON public.generation_rate_limits (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limits_user_time 
ON public.generation_rate_limits (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.generation_rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own rate limits
CREATE POLICY "Users can view their own rate limits"
ON public.generation_rate_limits
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Service role can manage all
CREATE POLICY "Service role can manage rate limits"
ON public.generation_rate_limits
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');

-- RPC: Check rate limit (returns true if allowed, false if rate limited)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_project_id UUID,
  p_user_id UUID,
  p_function_name TEXT,
  p_max_per_minute INTEGER DEFAULT 3
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  -- Count requests in the last minute for this project
  SELECT COUNT(*) INTO recent_count
  FROM public.generation_rate_limits
  WHERE project_id = p_project_id
    AND function_name = p_function_name
    AND created_at > now() - interval '1 minute';
  
  IF recent_count >= p_max_per_minute THEN
    RETURN FALSE;
  END IF;
  
  -- Log this request
  INSERT INTO public.generation_rate_limits (project_id, user_id, function_name)
  VALUES (p_project_id, p_user_id, p_function_name);
  
  RETURN TRUE;
END;
$$;

-- Clean up old rate limit entries (can be called periodically)
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.generation_rate_limits
  WHERE created_at < now() - interval '1 hour';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Generation run logs table for observability
CREATE TABLE IF NOT EXISTS public.generation_run_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  project_id UUID,
  function_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'timeout', 'rate_limited')),
  provider TEXT,
  model TEXT,
  tokens_estimated INTEGER,
  tokens_actual INTEGER,
  cost_estimate_usd NUMERIC(10, 6),
  error_code TEXT,
  error_message TEXT,
  raw_snippet_hash TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- Indexes for run logs
CREATE INDEX IF NOT EXISTS idx_run_logs_project ON public.generation_run_logs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_logs_user ON public.generation_run_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_logs_status ON public.generation_run_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_run_logs_function ON public.generation_run_logs (function_name, created_at DESC);

-- Enable RLS
ALTER TABLE public.generation_run_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own logs
CREATE POLICY "Users can view their own run logs"
ON public.generation_run_logs
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Service role can manage all
CREATE POLICY "Service role can manage run logs"
ON public.generation_run_logs
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role');