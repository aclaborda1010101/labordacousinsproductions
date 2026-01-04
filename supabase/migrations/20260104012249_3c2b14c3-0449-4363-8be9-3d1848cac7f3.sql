-- Add auto_retry_count and last_error columns to generation_runs
ALTER TABLE public.generation_runs 
ADD COLUMN IF NOT EXISTS auto_retry_count integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error text;

-- Add comment for documentation
COMMENT ON COLUMN public.generation_runs.auto_retry_count IS 'Number of automatic retries attempted for this run';
COMMENT ON COLUMN public.generation_runs.last_error IS 'Last error message if the run failed';