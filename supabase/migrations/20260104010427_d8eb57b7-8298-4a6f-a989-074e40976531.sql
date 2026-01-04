-- Add user_override column to generation_runs
ALTER TABLE public.generation_runs 
ADD COLUMN IF NOT EXISTS user_override boolean DEFAULT false;